# integration-huron-person/src/data-source: Data Ingestion Patterns

## Purpose
Implements DataSource abstraction for consuming person records from various endpoints and file formats.

## Harnesses (5 total)

### 1. CurrentTermsDataSource
**Purpose**: Fetch academic calendar/term data from source API

**Environment Prefix**: CURRENT_TERMS_DATA_SOURCE

**Harness Location**: `CurrentTermsDataSource.ts`

**Key Configuration**:
- API endpoint URL (DATASOURCE_BASE_URL + path)
- Authentication (DATASOURCE_API_KEY)
- Timeout (CURRENT_TERMS_DATA_SOURCE_TIMEOUT)

### 2. PersonDataSource
**Purpose**: Fetch individual person record by ID

**Environment Prefix**: PERSON_DATA_SOURCE

**Harness Location**: `PersonDataSource.ts`

### 3. PeopleDataSourceBatch
**Purpose**: Fetch multiple person records in a single call (batch operation)

**Environment Prefix**: PEOPLE_DATA_SOURCE_BATCH

**Harness Location**: `PeopleDataSourceBatch.ts`

### 4. PeopleCdmDataSource
**Purpose**: Fetch all people via CDM (Colleague Data Model) endpoint

**Environment Prefix**: PEOPLE_CDM_DATA_SOURCE

**Harness Location**: `PeopleCdmDataSource.ts`

**Characteristics**: Large result sets requiring chunking

### 5. PeopleS3DataSource
**Purpose**: Load people records from S3-based file drop

**Environment Prefix**: PEOPLE_S3_DATA_SOURCE

**Harness Location**: `PeopleS3DataSource.ts`

**Configuration**:
- S3 bucket name
- S3 key/prefix
- AWS region
- File format (NDJSON, JSON array, CSV)

## Pattern: DataSource Base Class

All implementations extend abstract `DataSource` from `integration-core`:

```typescript
import { DataSource } from 'integration-core';

export class MyDataSource extends DataSource {
  async fetch(): Promise<Person[]> {
    // Load persons via API, file, or database
  }
  
  async validateCredentials(): Promise<boolean> {
    // Verify authentication and connectivity
  }
}
```

## Authentication Pattern: API Key
All data sources use API Key authentication (simplest form):

```typescript
const apiKey = process.env.DATASOURCE_API_KEY;
const headers = {
  'x-api-key': apiKey,
  'Content-Type': 'application/json'
};
```

**Environment Variable**: DATASOURCE_API_KEY (shared, unprefixed)

## Adding a New DataSource

### Steps:
1. Create new file in this directory (e.g., `NewDataSource.ts`)
2. Extend `DataSource` base class from integration-core
3. Implement `fetch()` and `validateCredentials()` methods
4. Add harness block:
   ```typescript
   import { TestEnvironment } from 'integration-core';
   
   if (require.main === module) {
     const testEnvironment = TestEnvironment('NEW_DATA_SOURCE');
     [
       'SPECIFIC_VAR_1',
       'SPECIFIC_VAR_2'
     ].forEach(testEnvironment.getVarOrEmptyString);
     main();
   }
   ```
5. Add environment variables to `.env` under new harness group
6. Add to `example-env.md`
7. Update parent README with new harness

### Environment Configuration Considerations:
- **Shared variables**: DATASOURCE_BASE_URL, DATASOURCE_API_KEY (no prefix)
- **Source-specific**: Timeout, batch size, retry policy, file format (PREFIX_VARNAME)
- **Exemption**: Never prefix DATASOURCE_* variables—they're shared across all sources

## Testing Harnesses

Each harness validates:
- Credential validation
- API connectivity
- Response parsing
- Error handling (timeouts, auth failures, malformed data)

### Execution:
```bash
# VS Code
F5 on the DataSource file

# npx
npx ts-node src/data-source/PersonDataSource.ts
npx ts-node src/data-source/PeopleCdmDataSource.ts
```

### Validation Checklist:
1. Environment variables correctly loaded from `.env`
2. API/file connectivity established
3. Returned data matches expected schema (Person array)
4. Error conditions handled gracefully

