/**
 * Where a sync's previous state comes from, which decides how each person is classified (create, update or
 * unchanged):
 * - `storage`: the hashes stored at earlier syncs. A person whose hash matches is unchanged and never sent, and a
 *   person with no stored hash is created, without looking anyone up in the target.
 * - `target`: the target itself. Every person is looked up there (UpsertDeltaStrategy), so records changed in the
 *   target directly are put right, at the cost of a lookup per person. This is a "bulk reset".
 *
 * It replaced the two booleans bulkReset and trustPreviousStorage, which only ever acted together (`target` whenever
 * bulkReset was true or trustPreviousStorage false). They are no longer accepted.
 */
export const PREVIOUS_STATE_SOURCES = ['storage', 'target'] as const;

export type PreviousStateSource = typeof PREVIOUS_STATE_SOURCES[number];

export const isPreviousStateSource = (value: unknown): value is PreviousStateSource =>
  (PREVIOUS_STATE_SOURCES as readonly unknown[]).includes(value);

export type PreviousStateSourceParams = {
  previousStateSource?: PreviousStateSource;
};

/** The two booleans previousStateSource replaced, refused if a caller (untyped, or not yet moved over) still sends them */
const REMOVED_PARAMS = ['bulkReset', 'trustPreviousStorage'] as const;

/**
 * The previous state source the params ask for: previousStateSource when given, otherwise the fallback.
 *
 * @throws if previousStateSource is not one of PREVIOUS_STATE_SOURCES, or if the params carry bulkReset or
 *   trustPreviousStorage, which are no longer read: ignoring them would quietly change what the caller asked for.
 */
export const previousStateSourceOf = (
  params: PreviousStateSourceParams, fallback: PreviousStateSource = 'storage'
): PreviousStateSource => {
  const removed = REMOVED_PARAMS.filter(name => (params as Record<string, unknown>)[name] !== undefined);
  if (removed.length > 0) {
    throw new Error(`${removed.join(' and ')} ${removed.length > 1 ? 'are' : 'is'} no longer accepted: ` +
      `send previousStateSource ('storage', or 'target' for a bulk reset) instead.`);
  }
  const { previousStateSource } = params;
  if (previousStateSource === undefined) {
    return fallback;
  }
  if (!isPreviousStateSource(previousStateSource)) {
    throw new Error(`Invalid previousStateSource: ${JSON.stringify(previousStateSource)}. ` +
      `Expected one of ${PREVIOUS_STATE_SOURCES.join(', ')}.`);
  }
  return previousStateSource;
};

/**
 * A manual run's previous state source from its environment variable (SYNC_PREVIOUS_STATE_SOURCE): `storage` or
 * `target`, and `target` when unset, as manual runs have always looked people up in the target unless told otherwise.
 *
 * @param name The variable's name, for the error
 * @throws if the value is set but is not `storage` or `target` (the old variable's `true` / `false` included)
 */
export const previousStateSourceFromEnvironment = (value: string | undefined, name: string): PreviousStateSource => {
  const trimmed = `${value ?? ''}`.trim();
  if (trimmed === '') {
    return 'target';
  }
  if (!isPreviousStateSource(trimmed)) {
    throw new Error(`Invalid ${name}: ${JSON.stringify(trimmed)}. Expected one of ${PREVIOUS_STATE_SOURCES.join(', ')} ` +
      `(storage: decide whether a person is in sync from their stored hash; target: compare with the target).`);
  }
  return trimmed;
};
