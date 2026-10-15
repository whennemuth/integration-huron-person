# Delta Strategy: Potential Improvements

## Are `trustPreviousStorage` / `bulkReset` the right indicators for "use stored state"?

Whether previously stored hashes can decide what changed (rather than looking persons up in the
target) is currently derived, for bulk syncs, from two booleans: `DeltaStrategyFactory.trustsPreviousStorage()`
returns `trustPreviousStorage && !bulkReset`, and `DeltaStrategyFactory.createStrategy()` (Upsert
wrapping) uses that rule. Concerns:

- Two inverted booleans encode a single decision, and their combinations aren't obvious
  (`bulkReset` overrides `trustPreviousStorage`; `trustPreviousStorage: false` acts as a bulk reset).
  As far as traced, every behavior keyed on them uses only the combined value
  (`bulkReset || !trustPreviousStorage`), so `bulkReset: true` is equivalent to
  `trustPreviousStorage: false` - one of the two is redundant. Manual runs already dropped their
  bulk reset variable for this reason (see below). One distinct use remains for bulk syncs: a run
  with no baseline forces bulk reset on, which could equally be expressed as forcing trust off.
- The defaults disagree: the factory defaults `trustPreviousStorage` to `true`, while
  `SinglePersonSync` (and the `SYNC_TRUST_PREVIOUS_STORAGE` env var) default it to `false`.
- Neither flag says *which* stored state is trusted, though trustworthiness differs by storage
  type: a DynamoDB record is written per person as it syncs, while a baseline file is rewritten as a
  whole.

Consider replacing them with one explicit mode, e.g.
`previousStateSource: 'storage' | 'target' | 'storage-then-target'`.

When doing so, keep in mind:

- **Reading stored state depends on writing it.** For manual runs (`SyncPerson`, `SyncPersonBatch`
  and the custom-mapping batch harnesses), `SYNC_TRUST_PREVIOUS_STORAGE` only takes effect when
  `SYNC_UPDATE_HASH=true`. That variable is a separate decision - whether the run writes to hash
  storage at all - and the trust flag travels on the `hashStorage` object it creates, so a run
  cannot use stored hashes without also writing them (the `main()`s warn when trust is set
  without it). That coupling is reasonable (an in-sync person's hash is re-written anyway), but a
  consolidated setting should either keep it deliberately or let reading and writing be chosen
  independently.
- **Bulk sync pipelines have their own pair.** Pipeline runs in importing projects never read the
  `SYNC_*` variables. They always write hash storage, and take unprefixed `BULK_RESET` /
  `TRUST_PREVIOUS_STORAGE` settings that reach `DeltaStrategyFactory.createStrategy()` through
  their own run configuration. Manual runs use only `SYNC_TRUST_PREVIOUS_STORAGE` (plus the
  separate write switch, `SYNC_UPDATE_HASH`), which already matches the shape a consolidated
  pipeline setting would likely take: one two-valued "where does previous state come from"
  setting. When the pipeline pair is consolidated, align the manual variable's name and values with
  it, so the two ways of running a sync share one vocabulary.

## The stored-hash fast path still reads the target

With trusted stored state, `SinglePersonSync` skips the reverse-mapping and hash comparison against
the target, but not the target read: `getMappedPerson()` -> `getHrn()` still looks the person up to
resolve their HRN and the CRUD operation. The savings are therefore limited. Avoiding the read would
mean deferring HRN resolution until a push is actually needed.

## Extend the stored-hash fast path to S3/file storage

The fast path is DynamoDB-only because `fetchPreviousData()` for baseline file storage reads the
whole `previous-input.ndjson` to find one person. A keyed lookup (or a per-run cache of the baseline,
for batches) would make it viable there too.

## Keep the `DELETED:` marker out of PersonHistory, and record reactivation explicitly

The `DELETED:` hash prefix is a PersonCurrentState device: it keeps deletion detection from selecting
a soft-deleted person again, and makes a returning person classify as UPDATED (so they are
reactivated). PersonHistory needs neither, and a `DELETED` history record (written by
`DynamoDBDeltaStorage.markDeleted()`, or by bulk sync deferred delete handling) carries the unmarked
hash. But when the person is later reactivated, integration-core's
`DynamoDBDeltaStorage.updatePreviousData()` copies the stored hash into the new `UPDATED` record's
`previousHash` as-is, so it reads `DELETED:<hash>`. As a result:

- History records don't chain: one record's `hash` doesn't equal the next record's `previousHash`
  across a delete and reactivate, so readers must strip the prefix.
- The marker is undocumented in the history schema, and appears only in `previousHash`, never in
  `hash`.

It is, however, currently the only thing on a single history record identifying a reactivation
(e.g. a run's reactivations can be found by querying `UPDATED` records and filtering on
`begins_with(previousHash, "DELETED:")`). So strip it only together with recording reactivation
explicitly - preferably a `REACTIVATED` change type, alternatively a `reactivated: true` attribute
on the `UPDATED` record. Both changes belong in integration-core's `updatePreviousData()` (a core
release), and anything that treats change types as `NEW | UPDATED | DELETED` must learn the new one.
Nothing reads PersonHistory yet, so this is cheapest to do before something does.
