import { CrudOperation, FieldSet } from "integration-core";
import { BasicCache } from "../Cache";
import { Config } from "../config/Config";
import { HuronPerson } from "../data-target/crud/Person";
import { ReadPeople } from "../data-target/crud/ReadPeople";
import { HuronPersonDataTarget } from "../data-target/PersonDataTarget";
import { getLocalConfig } from "../Utils";
import { ConfigManager } from "../config/ConfigManager";

export type SelectConfig = {
  filter?: {
    filterField: string, inArray: string[]
  }, 
  includeFields?: string[]
}

/**
 * Use this abstract class as a base for any bulk patching operations you want to perform 
 * on the target system. It provides a template method pattern where you implement the 
 * specific logic for fetching, filtering, and patching people, and the patchPeople() 
 * method orchestrates the overall flow.
 */
export abstract class AbstractBulkTargetPatcher {
  private people: HuronPerson[] = [];
  private patchablePeople: HuronPerson[] = [];
  private nonPatchablePeople: HuronPerson[] = [];
  private patchCounter: number = 0;
  private patchedCounter: number = 0;
  protected cache: BasicCache | undefined;

  constructor(protected config: Config, private selectConfig: SelectConfig, private dryRun: boolean = false) { }

  private fetchPeople = async () => {
    const { 
      config, selectConfig: { filter: { filterField, inArray } = {}, includeFields } = {} 
    } = this;
    const reader = new ReadPeople({ config });
    if(filterField) {
      this.people.push(...await reader.readPeopleByFilterField(filterField, inArray!, includeFields));
    }
    else {
      this.people.push(...await reader.readAllPeople({ includeFields }));
    }
  }

  /**
   * Implement a custom method for applying a second phase of filtering that reduces
   * the population to patch down further beyond the initiial filtering specified in the
   * fetch API call itself by scrutinizing the person to patch.
   */
  public abstract isPatchable: (person: HuronPerson) => Promise<boolean>;

  public abstract getPatchFieldset: (person: HuronPerson) => Promise<FieldSet>;

  /**
   * Implement a custom patchPerson method that capitalizes the first and last name of the 
   * person.
   * @param person 
   */
  private patchPerson = async (hrn: string, patchFieldSet: FieldSet): Promise<void> => {
    const { config, cache, dryRun } = this;
    this.patchCounter++;
    const patchMsg = `PATCH ${this.patchCounter} of ${this.patchablePeople.length}: HRN ${hrn} with fieldset: ${JSON.stringify(patchFieldSet)}`;
    if(dryRun) {
      console.log(`DRY RUN - ${patchMsg}`);
      return;
    }
    else {
      console.log(patchMsg);
    }
    const dataTarget = new HuronPersonDataTarget({ config, cache, hrn });
    await dataTarget.pushOne({
      crud: CrudOperation.UPDATE,
      data: patchFieldSet
    })
  }

  public patchPeople = async (): Promise<void> => {
    const { 
      config, people, patchablePeople, nonPatchablePeople,
      fetchPeople, getPatchFieldset, isPatchable, patchPerson 
    } = this;

    this.cache = BasicCache.getInstance(config);

    await fetchPeople();

    for(const person of people) {
      if((await isPatchable(person))) {
        patchablePeople.push(person);
      }
      else {
        nonPatchablePeople.push(person);
      }
    }

    for(const person of patchablePeople) {
      const patchFieldSet = await getPatchFieldset(person);
      try {
        await patchPerson(person.hrn!, patchFieldSet);
        this.patchedCounter++;
      } 
      catch (error) {
        console.error(`Error patching person with HRN ${person.hrn}:`, error);
      }
    }

    console.log(`Finished patching. ${JSON.stringify({
      totalPeople: people.length,
      patchablePeople: patchablePeople.length,
      nonPatchablePeople: nonPatchablePeople.length,
      patchedPeople: this.patchedCounter,
      dryRun: this.dryRun
    }, null, 2)}`);
  }
}

/**
 * Example implementation of BulkTargetPatcher that capitalizes first and last name for 
 * people created in the last week.
 */
export class ExampleBulkTargetPatcher extends AbstractBulkTargetPatcher {
  /**
   * Implement a custom isPatchable() method that determines whether a person was created
   * less than a week ago.
   * @param person 
   * @returns 
   */
  public isPatchable = async (person: HuronPerson): Promise<boolean> => {
    const { dateCreated } = person;
    if( ! dateCreated) {
      return false;
    }
    const createdDate = new Date(dateCreated);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return createdDate > oneWeekAgo;
  }

  /**
   * Implement a custom getPatchFieldset() method that returns a fieldset with the first and last name
   * capitalized.
   * @param person 
   * @returns 
   */
  public getPatchFieldset = async (person: HuronPerson): Promise<FieldSet> => {
    const { firstName, lastName } = person;
    return { fieldValues: [
      { 'firstName': firstName?.toUpperCase() },
      { 'lastName': lastName?.toUpperCase() }
    ]} as FieldSet;
  }

  public static runExample = async (config: Config, dryRun: boolean): Promise<void> => {
    const patcher = new ExampleBulkTargetPatcher(config, { includeFields: [
      'hrn', 'firstName', 'lastName', 'dateCreated'
    ]}, dryRun);
    await patcher.patchPeople();
  }
}


async function main(): Promise<void> {
  const { DRY_RUN, HURON_PERSON_CONFIG_PATH, SECRET_ARN, CACHE_ENABLED, CACHE_PATH } = process.env;
  const dryRun = DRY_RUN === 'true';

  if(CACHE_ENABLED !== 'true') {
    console.log('CACHE_ENABLED environment variable is not set to "true". You need to cache the access token for bulk operations.');
    return;
  }

  if( ! CACHE_PATH) {
    console.log('CACHE_PATH environment variable is not set. You need to set this to a writable path for caching the access token for bulk operations.');
    return;
  }

  // Load configuration.
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = await configManager
    .reset()
    .fromJsonString('HURON_PERSON_CONFIG_JSON')   // ← TaskDef secret injection
    .fromSecretManager(SECRET_ARN)                // ← Fallback to Secrets Manager
    .fromEnvironment()                            // ← Fallback to individual env var overrides
    .fromFileSystem(localConfigPath)              // ← Local dev only
    .getConfigAsync('person');

  await ExampleBulkTargetPatcher.runExample(config, dryRun);
}


if(require.main === module) {
  main();
}