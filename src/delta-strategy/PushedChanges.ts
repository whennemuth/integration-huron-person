import { CrudOperation, FieldSet } from 'integration-core';
import { PushRecorder } from '../data-target/PersonDataTarget';

/** The change a successful push made to a person, named as person history names it */
export type PushedChangeType = 'NEW' | 'UPDATED';

/** A FieldSet's primary key: the field's name and its value */
export type PrimaryKey = { field: string, value: string };

/**
 * The people a run's push created or updated in the target, recorded from each successful push
 * (HuronPersonDataTarget.pushAll()), so that the baseline update that follows can record in person history
 * what the push did (see PushedChangeTypesDeltaStrategy).
 *
 * Without it, DynamoDB delta storage classifies each person by comparing their hash with the stored
 * baseline: no stored record is NEW, a different hash UPDATED. That agrees with the push only when the delta
 * came from that baseline. When it came from the target instead (UpsertDeltaStrategy: a bulk reset, or
 * previous storage not trusted), a person who already exists in the target is updated there even when the
 * baseline has no record of them (history said NEW), and a person created there may already be in the
 * baseline (history said UPDATED, or wrote nothing for an unchanged hash). The run's figures, counted from the
 * pushes, then disagreed with the changes its history lists.
 *
 * Deletions aren't recorded: person history records deactivations itself (DynamoDBDeltaStorage.markDeleted()).
 */
export class PushedChanges implements PushRecorder {
  private readonly pushes: { record: FieldSet, changeType: PushedChangeType }[] = [];

  recordSuccess(record: FieldSet, crud: CrudOperation): void {
    if (crud === CrudOperation.CREATE) {
      this.pushes.push({ record, changeType: 'NEW' });
    }
    else if (crud === CrudOperation.UPDATE) {
      this.pushes.push({ record, changeType: 'UPDATED' });
    }
  }

  /** How many creates and updates have been recorded */
  get size(): number {
    return this.pushes.length;
  }

  /**
   * Each pushed person's change, by the value of their primary key
   * @param primaryKeyFields - The primary key's field name(s); without them, a FieldSet's first field
   */
  changeTypes(primaryKeyFields?: Set<string>): Map<string, PushedChangeType> {
    const changeTypes = new Map<string, PushedChangeType>();
    for (const { record, changeType } of this.pushes) {
      const key = PushedChanges.primaryKeyOf(record, primaryKeyFields);
      if (key) {
        changeTypes.set(key.value, changeType);
      }
    }
    return changeTypes;
  }

  /**
   * A FieldSet's primary key: the first field named in primaryKeyFields, or without them the FieldSet's
   * first field, as DynamoDBDeltaStorage finds it. Undefined when there is no such field or it has no value.
   */
  static primaryKeyOf(fieldSet: FieldSet, primaryKeyFields?: Set<string>): PrimaryKey | undefined {
    const fields = fieldSet.fieldValues ?? [];
    const keyField = primaryKeyFields && primaryKeyFields.size > 0
      ? fields.find(field => Object.keys(field).some(name => primaryKeyFields.has(name)))
      : fields[0];
    if (!keyField) {
      return undefined;
    }
    const field = primaryKeyFields && primaryKeyFields.size > 0
      ? Object.keys(keyField).find(name => primaryKeyFields.has(name))!
      : Object.keys(keyField)[0];
    const value = field === undefined ? undefined : keyField[field];
    return value === undefined || value === null || value === '' ? undefined : { field, value: String(value) };
  }
}
