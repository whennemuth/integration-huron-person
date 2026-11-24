/**
 * Where a sync's previous state comes from, which decides how each person is classified (create, update or
 * unchanged):
 * - `storage`: the hashes stored at earlier syncs. A person whose hash matches is unchanged and never sent, and a
 *   person with no stored hash is created, without looking anyone up in the target.
 * - `target`: the target itself. Every person is looked up there (UpsertDeltaStrategy), so records changed in the
 *   target directly are put right, at the cost of a lookup per person. This is a "bulk reset".
 *
 * It replaces the two booleans bulkReset and trustPreviousStorage, which only ever acted together: `target` whenever
 * bulkReset is true or trustPreviousStorage is false (previousStateSourceOf()).
 */
export const PREVIOUS_STATE_SOURCES = ['storage', 'target'] as const;

export type PreviousStateSource = typeof PREVIOUS_STATE_SOURCES[number];

export const isPreviousStateSource = (value: unknown): value is PreviousStateSource =>
  (PREVIOUS_STATE_SOURCES as readonly unknown[]).includes(value);

export type PreviousStateSourceParams = {
  previousStateSource?: PreviousStateSource;
  /** @deprecated Use previousStateSource: true means `target` */
  bulkReset?: boolean;
  /** @deprecated Use previousStateSource: false means `target` */
  trustPreviousStorage?: boolean;
};

/**
 * The previous state source the params ask for: previousStateSource when given, otherwise the old pair translated
 * (`target` if bulkReset is true or trustPreviousStorage is false), otherwise the fallback.
 *
 * @throws if previousStateSource is not one of PREVIOUS_STATE_SOURCES, or if the old pair is also given and asks for
 *   something else (a caller half way through moving to the new setting).
 */
export const previousStateSourceOf = (
  params: PreviousStateSourceParams, fallback: PreviousStateSource = 'storage'
): PreviousStateSource => {
  const { previousStateSource, bulkReset, trustPreviousStorage } = params;
  const hasOldPair = bulkReset !== undefined || trustPreviousStorage !== undefined;
  const fromOldPair: PreviousStateSource | undefined = hasOldPair
    ? (bulkReset === true || trustPreviousStorage === false ? 'target' : 'storage')
    : undefined;

  if (previousStateSource === undefined) {
    return fromOldPair ?? fallback;
  }
  if (!isPreviousStateSource(previousStateSource)) {
    throw new Error(`Invalid previousStateSource: ${JSON.stringify(previousStateSource)}. ` +
      `Expected one of ${PREVIOUS_STATE_SOURCES.join(', ')}.`);
  }
  if (fromOldPair !== undefined && fromOldPair !== previousStateSource) {
    throw new Error(`previousStateSource=${previousStateSource} contradicts ` +
      `${JSON.stringify({ bulkReset, trustPreviousStorage })}, which means ${fromOldPair}. Send previousStateSource alone.`);
  }
  return previousStateSource;
};
