# Delta Strategy: Potential Improvements

## Are `trustPreviousStorage` / `bulkReset` the right indicators for "use stored state"?

Whether previously stored hashes can decide what changed (rather than looking persons up in the
target) is currently derived from two booleans: `DeltaStrategyFactory.trustsPreviousStorage()`
returns `trustPreviousStorage && !bulkReset`. Both `DeltaStrategyFactory.createStrategy()` (Upsert
wrapping) and `SinglePersonSync`'s stored-hash in-sync check use that rule. Concerns:

- Two inverted booleans encode a single decision, and their combinations aren't obvious
  (`bulkReset` overrides `trustPreviousStorage`; `trustPreviousStorage: false` acts as a bulk reset).
- The defaults disagree: the factory defaults `trustPreviousStorage` to `true`, while
  `SinglePersonSync` (and the `SYNC_TRUST_PREVIOUS_STORAGE` env var) default it to `false`.
- Neither flag says *which* stored state is trusted, though trustworthiness differs by storage
  type: a DynamoDB record is written per person as it syncs, while a baseline file is rewritten as a
  whole.

Consider replacing them with one explicit mode, e.g.
`previousStateSource: 'storage' | 'target' | 'storage-then-target'`.

When doing so, keep in mind:

- **Reading stored state depends on writing it.** For manual runs (`SyncPerson`, `SyncPersonBatch`
  and the custom-mapping batch harnesses), `SYNC_TRUST_PREVIOUS_STORAGE` / `SYNC_BULK_RESET` only
  take effect when `SYNC_UPDATE_HASH=true`. That variable is a separate decision - whether the run
  writes to hash storage at all - and the trust flags travel on the `hashStorage` object it creates.
  So a run cannot use stored hashes without also writing them. That coupling is reasonable (an
  in-sync person's hash is re-written anyway), but a consolidated mode should either keep it
  deliberately or let reading and writing be chosen independently.
- **Bulk sync pipelines have their own pair.** Pipeline runs in importing projects never read the
  `SYNC_*` variables. They always write hash storage, and take unprefixed `BULK_RESET` /
  `TRUST_PREVIOUS_STORAGE` settings that reach `DeltaStrategyFactory.createStrategy()` through
  their own run configuration. The `SYNC_*` pair mirrors those names for manual runs. Consolidating
  one pair without the other would leave the two ways of running a sync with different vocabularies
  for the same decision, so change them together.

## The stored-hash fast path still reads the target

With trusted stored state, `SinglePersonSync` skips the reverse-mapping and hash comparison against
the target, but not the target read: `getMappedPerson()` -> `getHrn()` still looks the person up to
resolve their HRN and the CRUD operation. The savings are therefore limited. Avoiding the read would
mean deferring HRN resolution until a push is actually needed.

## Extend the stored-hash fast path to S3/file storage

The fast path is DynamoDB-only because `fetchPreviousData()` for baseline file storage reads the
whole `previous-input.ndjson` to find one person. A keyed lookup (or a per-run cache of the baseline,
for batches) would make it viable there too.
