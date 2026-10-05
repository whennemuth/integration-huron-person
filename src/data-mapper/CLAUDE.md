# integration-huron-person/src/data-mapper: Data Transformation Patterns

## Purpose
Converts raw BU CDM person records into the Huron target API's field format
(`integration-core` `Input`/`FieldSet` shape), applying field renaming, type
conversion, organization/state/country HRN resolution, and validation.

## Core Class: DataMapper.ts

`DataMapper` implements `CoreDataMapper` (`integration-core`), whose `map()`
method is **contractually synchronous** (`(rawData, crudOperation?) => Input`).
This constrains the whole file: no real async work can happen inside
`map()`/`getMappedData()` without breaking that interface for every consumer.

**Entry points**:
- `map(rawData, crudOperation?)` - implements the core interface, delegates to `getMappedData()`
- `getMappedData({ rawData, personHrn?, crudOperation? })` - the actual per-person
  mapping loop (`rawData.map(person => { try { ... } catch { ... } })`)

**Per-person collaborators** (called once per record inside `getMappedData()`'s loop):
- `NameMapper` - resolves first/middle/last name
- `UserIdMapper` - resolves userId (varies by CrudOperation)
- `EmailMapper` - resolves email
- `AddressMapper` - resolves address line/city/state/postal/country (uses `stateMappings`/`countryMappings`)
- `OrgMapper` - resolves organization/employer/secondaryUnit/additionalUnit assignments and `skipReason` (uses `currentTerms`)
- `TitleMapper` - resolves title (depends on `orgAssignments.personType`)

**Status/introspection getters** (read the state left behind by the most recent `getMappedData()` call):
- `criticalValidationErrorMessage` - first critical validation failure encountered in the batch (missing personid/name/organization, unresolvable organization HRN). Read externally by `SyncPerson.ts` to bail out of a single-person sync.
- `infoValidationErrorMessage` - first non-critical (info-level) issue, e.g. unresolved secondaryUnit/additionalUnit HRN. Also read by `SyncPerson.ts`'s `getMappingError()`.
- `getMappingErrorCount()` - count of records that threw during mapping and were filtered out of the returned `Input` (marked with `__mappingError`, never sent to target)
- `mappedPersonRecords: PersonRecordPair[]` - `{raw, mapped?, error?}` entries for **every** record encountered (successfully mapped ones get `mapped`, failed ones get `error` instead), reset on every `getMappedData()`/`map()` call. Enables callers to run custom per-person async logic post-mapping regardless of per-record outcome (see `personRecordProcessor` in the root `CLAUDE.md`) without needing `map()` itself to be async.

**`_fieldDefinitions`**: the target field schema (`id`, `sourceIdentifier`,
`firstName`/`lastName`, `organization`, `contactInformation`, `roles`,
`__arrayFieldOperations`, etc.) - see root `CLAUDE.md`'s `__arrayFieldOperations`
Real Example for the append-vs-replace semantics of that special field.

## Other modules in this directory
- `DataMapperCountry.ts` / `DataMapperState.ts` - forward/reverse lookup maps (ISO country codes, US state abbreviations) loaded once via `getDataMapperMaps()` and shared across a whole sync
- `DataMapperOrg.ts` - organization/employer/secondaryUnit/additionalUnit assignment logic, semester/current-terms filtering
- `DataMapperAddressSorter.ts` / `DataMapperDateSorter.ts` - deterministic ordering helpers for arrays with multiple candidate entries (addresses, dated records)
- `DataMapperHeuristics.ts` - shared heuristic helpers used across multiple mappers
- `FieldFilter.ts` - post-mapping field inclusion/exclusion, applied via `EndToEnd`'s `fieldFilter` callback (see `SyncPeople.ts`)
- `MappingValidator.ts` - field-level validation
- `ReverseDataMapper.ts` - target → source direction mapping (used where the pipeline needs to go the other way)
- `csv/` - CSV-driven mapping configuration/data

## Architecture History: DataMapOne.ts (removed)
A short-lived `DataMapOne.ts` module attempted to extract the per-person body of
`getMappedData()`'s loop into a separately-callable, `Promise.all`-driven async
function (to support per-person async side effects). It was deleted after
review surfaced two bugs (see root `CLAUDE.md`'s Real Examples: discarded
`removeEmptyValues()` result, and an unawaited `Promise.all` that always
produced empty results) and a cleaner alternative was adopted instead: the
`mappedPersonRecords` getter above, combined with `personRecordProcessor`
dependency injection at the `HuronPersonIntegration` orchestration layer
(`SyncPeople.ts`), where async work is natural and the synchronous `map()`
interface never has to be violated.

## Testing
`test/data-mapper/DataMapper.test.ts` covers: basic field mapping, critical/info
validation messages, `mappedPersonRecords` population and reset-between-calls,
multi-person batches, secondary/additional unit HRN resolution, and
`StaticMapUsage`/dynamic-lookup fallback behavior.

```bash
npx jest test/data-mapper/DataMapper.test.ts
```


