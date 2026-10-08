# integration-huron-person: Harness Orchestration Patterns

## Project Purpose
Implements the core synchronization logic for Huron person records, featuring 29 test harnesses covering data mapping, sources, targets, and orchestration. Primary example of the centralized harness pattern.

## Repository Relationship Model

This project is an independently versioned npm package with its own source repository.

It composes with other repositories via package dependencies (especially `integration-core`) instead of workspace-level source control.

## Shared Skills Repository

Cross-repository Copilot skills are maintained in a separate repository at `integration-workspace-skills/skills/`.

VS Code discovers these skills using the `chat.agentSkillsLocations` setting in your `.code-workspace` file. In multi-root `.code-workspace` configurations, `chat.agentSkillsLocations` paths are resolved relative to each workspace root folder (not from the `.code-workspace` file location).

Canonical settings entry:

```json
"chat.agentSkillsLocations": {
  "../integration-workspace-skills/skills": true
}
```

Core-only and core+person+fargate workspace examples are documented in this repository's `README.md`.

## Workspace-Scoped Memory Files

The `.copilot/memories/` directory (visible in the workspace as "workspace-memories") stores workspace-scoped Copilot memory files that apply to all projects.

**Purpose**: Stores coding preferences, task verification protocols, and workflow requirements that should be consistently applied across all integration projects (core, huron-person, fargate, dashboard, file-drop, etc.).

**Key file**: `task-verification-protocol.md` - Defines requirements for build verification, test execution, and completion reporting on all code implementation tasks.

**Discovery**: VS Code Copilot automatically loads memory files from `.copilot/memories/` when the directory is included as a workspace folder.

## Implementation Verification Protocol

**CRITICAL**: When implementing code that depends on unfamiliar abstractions, control flow directives, or domain-specific patterns, you MUST verify their actual behavior before proceeding.

### High-Risk Abstractions Requiring Verification

- **Control flow directives**: `__arrayFieldOperations`, `__metadata`, behavioral flags
- **Update semantics**: append vs replace, merge vs overwrite patterns  
- **Authentication patterns**: JWT token refresh, external token handling
- **Data mapping abstractions**: DataMapper extensions, field filters
- **Sync strategies**: UpsertDeltaStrategy, hash comparison logic
- **Role management**: Role assignment directives, HRN encoding

### Mandatory Verification Steps

Before implementing code that uses an unfamiliar abstraction:

1. **Search for definition**: Use `grep_search` to find where it's defined
2. **Find consumers**: Search for where it's processed/interpreted
3. **Read usage examples**: Look at tests and similar patterns
4. **State your understanding**: Explicitly describe what you think it does
5. **Think through interactions**: Consider edge cases and combinations
6. **Only then implement**: Proceed with verified understanding

### Real Example: __arrayFieldOperations Bug

A critical bug occurred when implementing role operations without verifying `__arrayFieldOperations` behavior:
- **Assumption**: Keeping the field meant "append mode"
- **Reality**: Empty `{}` means replace, populated means append
- **Result**: 'remove' operation broke (appended instead of replaced)

This bug could have been prevented by searching for how the directive is processed before implementing.

### Real Example: MockPersonDataTarget sourceIdentifier Field Mismatch

A bug existed in `MockPersonDataTarget.getPersonId()` (used to key records for the mock DynamoDB target) without verifying which field name `DataMapper` actually emits on mapped person records:
- **Assumption**: Person records would carry the ID under `buid`, `personId`, `BUID`, or `id`
- **Reality**: `DataMapper` emits `sourceIdentifier` as the field name for the source BUID - none of the assumed field names matched
- **Result**: CRUD operations against the mock target would silently fail to find an ID for any real mapped person record, only working in tests that happened to use one of the assumed field names

This was caught while adding `getPersonByBuid()` for mock-mode existence lookups, and fixed by adding `sourceIdentifier` as the first-checked field. The lesson: verify the actual field/property names a producer emits (e.g. via `grep_search` on the producing code) rather than assuming names based on similar-sounding conventions elsewhere in the codebase.

### Real Example: infoValidationFailureMessage / infoValidationErrorMessage Naming Mismatch

`DataMapper` originally exposed a getter/setter pair named `infoValidationFailureMessage`, while `SyncPerson.ts`'s `getMappingError()` destructured a differently-named property, `infoValidationErrorMessage`, off the same `dataMapper` instance:
- **Assumption** (implicit, when `SyncPerson.ts` was written): the property being destructured actually existed on `DataMapper`
- **Reality**: no such property existed - the destructure silently produced `undefined`, so `getMappingError()` could never surface an info-level validation message, only critical ones
- **Result**: a whole class of non-critical mapping warnings (e.g. unresolved secondaryUnit/additionalUnit HRNs) was never surfaced to callers, with no error or type failure to reveal it (both sides were untyped `any`/destructuring)

Fixed by renaming the getter to `infoValidationErrorMessage` (matching the existing `criticalValidationErrorMessage` naming convention) during a `DataMapOne.ts` cleanup pass. The lesson: a silent naming mismatch between a producer (getter) and consumer (destructure) is easy to miss without either a static type check on the destructured shape or grepping for actual usages of the getter before assuming it's dead/unused.

### Real Example: DataMapOne.ts Discarded Cleaned Data

A short-lived `DataMapOne.ts` module (an attempt to extract `DataMapper.getMappedData()`'s per-person logic into a separately-callable, `Promise.all`-driven function) had a bug where `removeEmptyValues(person)`'s result was computed but discarded:
```ts
params.mapper.person = removeEmptyValues(person);
mapper.person = person; // overwrites with the RAW, uncleaned person
```
- **Assumption**: assigning the cleaned value to `mapper.person` was equivalent to the original code's `person = removeEmptyValues(person)` (which reassigns the *local* variable used by all downstream mapper calls)
- **Reality**: the local `person` variable used by `NameMapper`/`UserIdMapper`/`EmailMapper`/`AddressMapper`/`OrgMapper`/`TitleMapper` was never reassigned, so every downstream call used the raw, uncleaned data
- **Result**: mapping behavior would have silently diverged from the original for any record containing empty/null fields

Additionally, the module wrapping this logic (`getMappedData_ALTERNATIVE`) fired `Promise.all(...).then(...)` without awaiting it in a non-`async` function, so it always returned an empty `fieldSets` array - a second, independent bug. Both were caught during code review before being wired into production; `DataMapOne.ts` was deleted in favor of collecting `{raw, mapped}` pairs synchronously inside `getMappedData()` itself (see `mappedPersonRecords` below), avoiding the need for a parallel/async per-person mapping function entirely (`CoreDataMapper.map()` in `integration-core` is contractually synchronous, so no per-person async work belongs inside the mapping step in the first place).

### When You're Uncertain

If you cannot fully verify an abstraction's behavior:

- **State explicitly what you don't know**
- **Ask whether to search for implementation first**
- **Do NOT proceed on "educated guesses"**

### User Override

You can skip verification by saying:
- "Skip verification and proceed"
- "Use inference for this"

**See Also**: `verify-abstractions-before-implementation` skill in workspace skills repository

## Architecture: Explicit Environment Variable Declarations

### Design Approach
29 harness modules use explicit environment variable declarations in their direct-run blocks. Each harness self-documents exactly which variables it requires through an explicit array declaration, following the fargate project style for maximum clarity and independence.

### Pattern Structure
```typescript
import { TestEnvironment } from 'integration-core';

if (require.main === module) {
  const testEnvironment = TestEnvironment('HARNESS_PREFIX');
  
  [
    'ENV_VAR_1',
    'ENV_VAR_2',
    'ENV_VAR_3'
  ].forEach(testEnvironment.getVarOrEmptyString);
  
  main();
}
```

### Benefits
- **Self-documenting**: Each module explicitly lists its configuration dependencies
- **Independent**: No centralized configuration machinery to maintain
- **Transparent**: Clear which variables each harness needs at a glance
- **Flexible**: Easy to add/remove variables without affecting other harnesses

## Test Harnesses (29 total)

**Organization**:
- **Configuration Management** (2): ConfigFromSecretsManager, ConfigManager
- **Data Mapping** (4): DataMapper (base, country, org, state), FieldFilter, MappingValidator
- **Data Sources** (5): CurrentTermsDataSource, PeopleCdmDataSource, PeopleDataSourceBatch, PeopleS3DataSource, PersonDataSource
- **Data Targets** (8): AuthToken, DeactivatePerson, ListPeople, ReadList, ReadOrganization(s), ReadPeople, ReadPerson
- **Delta Strategy** (1): UpsertDeltaStrategy
- **Miscellaneous** (2): BulkTargetPatcher(ForSourceIdentifier), ChunkScanner, SyncEvaluator
- **Main Orchestrators** (3): SyncPeople, SyncPerson, SyncPersonBatch

### Harness Pattern
All 29 modules follow this structure:
```typescript
import { TestEnvironment } from 'integration-core';

// ... module implementation

if (require.main === module) {
  const testEnvironment = TestEnvironment('HARNESS_PREFIX');
  
  [
    'SPECIFIC_ENV_VAR_1',
    'SPECIFIC_ENV_VAR_2'
  ].forEach(testEnvironment.getVarOrEmptyString);
  
  main();
}
```

### Environment Configuration

**File**: `.env` (git-ignored, local development only)

**Structure**: 
```
# Base shared variables (no prefix)
DATASOURCE_BASE_URL=...
DATASOURCE_API_KEY=...
DATATARGET_BASE_URL=...
DATATARGET_AUTH_TOKEN=...

# Harness groups (lines ~187+)
# ---------- Use these for src/data-mapper/DataMapper.ts ---------- #
DATA_MAPPER_PEOPLE_MAP=...
DATA_MAPPER_FIELD_MAP=...

# ---------- Use these for src/data-source/current-terms/CurrentTermsDataSource.ts ---------- #
CURRENT_TERMS_DATA_SOURCE_TIMEOUT=...
```

**Exemption Rule**: DATASOURCE_* and DATATARGET_* variables remain in base section (unprefixed, shared across all harnesses)

**Template**: See `example-env.md` (~260 lines, sanitized with placeholders)

## Execution

### VS Code Launch Configuration (Recommended)
**File**: `.vscode/launch.json` (provided by this project)

Configuration: "Debug current file"
- Automatically loads `.env`
- Provides breakpoints and step-through debugging
- Allows variable inspection

**Usage**:
1. Open harness file (e.g., `src/data-mapper/DataMapper.ts`)
2. Press F5 or Run > Start Debugging
3. Select "Debug current file"

### Command Line (npx)
```bash
npx ts-node src/data-mapper/DataMapper.ts
npx ts-node src/data-target/crud/ReadPerson.ts
npx ts-node src/SyncPeople.ts
```

## Custom Per-Person Async Processing (personRecordProcessor)

**Problem**: Some use cases need custom async logic run once per person during a
sync (e.g. writing cherry-picked outliers to a separate DynamoDB table or S3
file for later analysis), with access to both the raw source record and its
mapped `FieldSet` - **including records whose mapping failed**, and regardless
of whether the overall sync ultimately succeeds. `CoreDataMapper.map()` (in
`integration-core`) is contractually synchronous, so this logic cannot live
inside `DataMapper.map()`/`getMappedData()` itself without breaking that interface.

**Solution**: `DataMapper.getMappedData()` synchronously collects `{raw, mapped?,
error?}` pairs during its existing per-person loop - `mapped` is set for
successfully mapped records, `error` is set instead for records that threw
during mapping - exposed via the `mappedPersonRecords` getter
(`PersonRecordPair[]`, reset on every `getMappedData()`/`map()` call).
`HuronPersonIntegration` (in `SyncPeople.ts`) accepts an optional
`personRecordProcessor?: (record: { raw: any, mapped?: FieldSet, error?: unknown }) =>
Promise<void>` constructor param - pure dependency injection, a no-op if not
supplied. A single object param is used rather than positional args so that
supplying `error` without `mapped` (or vice versa) is unambiguous. If provided,
`run()` iterates `dataMapper.mappedPersonRecords` from a
**`finally` block** (not the success path), so the hook runs for every
encountered record regardless of per-record mapping outcome or whether
`endToEnd.execute()` itself throws. `dataMapper` is hoisted above the `try` so
the `finally` block can still reach it even if an error occurs before or during
`execute()`. Each per-record call is wrapped in its own try/catch so one
processor failure doesn't abort the whole loop.

**Why a plain callback, not an interface**: `HuronPersonIntegrationParams`
already uses plain function types for every other optional hook in the same
params bag (`fieldFilter`, `orgHrn`, `lookupPersonInTargetSystemCache`) - a
callback is more consistent with local convention than introducing a
single-method interface (like `TargetApiErrorEventProcessor`) would have been.

**Status**: The mechanism exists in `integration-huron-person`; no concrete
processor is wired in yet. Using it in the live pipeline (e.g. from
`integration-huron-person-fargate`'s processor tasks) requires: choosing a
storage backend (DynamoDB table vs. S3), provisioning it via fargate's CDK
stack, implementing a concrete processor there, and refreshing fargate's
installed `integration-huron-person` tgz dependency.

## End-of-Records Detection in BuCdmPeopleDataSourceBatch (stopAtFirstPartial)

The BU CDM people API occasionally returns a "partial" batch (0 < length < `recordCount`)
that may NOT mean the population is exhausted (a source-side bug). So
`BuCdmPeopleDataSourceBatchConfig.stopAtFirstPartial` (optional, **default `false`**) selects
the end criterion:
- `false` (default): only an **empty** batch ends the loop; partials are logged as a
  `console.warn` and the loop continues to the next offset.
- `true`: legacy behavior - the first partial (or empty) batch ends the loop.

Record counts (`recordsProcessed()`) always come from the actual `response.length`, never
inferred from `batchSize`, so partials that no longer end the loop are still counted correctly.
`reachedTheEndOfRecords()` therefore means "an end condition was hit" (empty batch, partial only
if `stopAtFirstPartial`, `isOffsetPastKnownEnd` discard, or non-batchable single request) - NOT
"a partial was seen". It stays `false` if the loop stopped only because `iterationLimit` was met,
even when that last batch was a partial. Consumers in `integration-huron-person-fargate`
(`BigJsonFetch` -> `partialChunkEncountered`) inherit this semantics.

## Organization Bulk Load and Upsert

`src/data-target/OrganizationBulkLoad.ts` loads a json dump of all orgs from one Huron environment
(`ReadOrganizations.ts`, task `pages`, which writes the raw org objects to `OUTPUT_FILE_PATH`) into
another. Orgs are loaded level by level (roots, children, grandchildren...) because a child's
`parent` must be the **target** hrn of its parent - hrns of the same org differ between
environments. A parent is found by `parent.id` (fallback: `parent.hrn` matching a dump org).
- Payload (`toFieldSet`): the api schema has `additionalProperties: false`, so `hrn`, `dateCreated`,
  `dateModified`, `links` and all nulls are dropped, and hrn refs (category/functions/tags/state/
  country) are reduced to `{hrn}`. The api has no lists endpoint, so list hrns can't be validated
  up front - the load logs the distinct ones, and `LIST_HRN_OVERRIDES_FILE_PATH` remaps them.
- `ON_EXISTING=update|skip` decides what happens to orgs already in the target (matched by `id`;
  all target orgs are read once up front, not looked up per org).
- Orphans (parent not in the dump) load as top-level orgs. If an org fails, its descendants are
  skipped and reported (not loaded as roots, which would silently misplace them).
- The `id -> target hrn` map is written to `HRN_MAP_FILE_PATH` after every level and in a `finally`,
  and read back on start, so an interrupted load resumes without re-pushing. `DRY_RUN=true` makes no
  target calls and uses placeholder hrns. Delete the map file to start over.
- Auto-retry: after the first pass, if orgs failed (the target api returns transient 500s such as
  `Endpoint request timed out`) or were skipped under a failed ancestor, `load()` waits
  (`RETRY_BASE_DELAY_MS`, doubling per pass, capped at 5 minutes) and reruns the same level loop over
  orgs not yet in the hrn map, up to `MAX_RETRY_PASSES` (default 5, 0 disables; never on dry run).
  Ancestors go first by construction (level order + the `blocked` map). Each pass prints its own
  "BULK LOAD (retry N) SUMMARY", then an overall one. Retry passes never use `skipLookup`: a create
  that timed out at the gateway may have been applied, and the up-front existing-orgs list is stale,
  so a blind POST would hit a duplicate - the lookup by id finds it and treats it as loaded. Dump
  problems (duplicate ids, parent cycles) are not retried. Implemented in the loader rather than via
  `ApiRetryStrategy` because `ApiErrorRetryStrategy.ts` lives in integration-huron-person-fargate
  (which depends on this package) and `pushOne` discards the HTTP status.

`HuronOrganizationDataTarget.upsertOne()` (create, or update/skip if the org exists) is implemented
there rather than as a `CrudOperation.UPSERT` to avoid a change to `integration-core`. Note
`pushOne` CREATE previously dropped the new org's hrn from its result; it now returns it.

## Patterns to Follow

### Adding a New Harness
1. Create module in appropriate src/ subdirectory
2. Implement main functionality
3. Add `require.main` block with explicit TestEnvironment pattern:
   ```typescript
   import { TestEnvironment } from 'integration-core';
   
   if (require.main === module) {
     const testEnvironment = TestEnvironment('NEW_PREFIX');
     ['VAR1', 'VAR2'].forEach(testEnvironment.getVarOrEmptyString);
     main();
   }
   ```
4. Add environment variables to `.env` under `# ---------- NEW_MODULE_PATH ---------- #` section
5. Add placeholder entries to `example-env.md`
6. Update README test harnesses list

### Adding New Environment Variables
1. Add to `.env` under the appropriate harness group or base section
2. Add the variable name to the explicit array in the harness module's direct-run block
3. Document in `example-env.md` with placeholder value
4. Document in harness section of README

### Key Naming Conventions
- Harness-specific: `PREFIX_KEYNAME` (e.g., `READ_PERSON_TIMEOUT`)
- Shared across harnesses: No prefix (e.g., `DATASOURCE_API_KEY`)
- Downstream dependencies: Prefix if introduced by harness, unprefixed if shared with another harness

## Dependencies
- `integration-core`: TestEnvironment, abstract base classes
- Node ecosystem: ts-node, TypeScript, testing libraries

