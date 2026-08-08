# integration-huron-person/src/data-target: Data Persistence Patterns

## Purpose
Implements DataTarget abstraction for writing person records and managing state in the target system (HRS).

## Harnesses (8 total)

### CRUD Operations (4 harnesses)

#### 1. ReadPerson
**Purpose**: Fetch individual person record from target

**Environment Prefix**: READ_PERSON

**Harness Location**: `crud/ReadPerson.ts`

**Validation**: Verify person exists, check field mapping, handle missing records

#### 2. ReadList
**Purpose**: Fetch organizational structures/lists

**Environment Prefix**: READ_LIST

**Harness Location**: `crud/ReadList.ts`

#### 3. ReadPeople
**Purpose**: Batch read multiple person records with filtering and sorting

**Environment Prefix**: READ_PEOPLE

**Harness Location**: `crud/ReadPeople.ts`

**Special Configuration**: Uses custom URL serializer (`useCustomUrlSerializer: true`) for HRN-based filtering (e.g., `readPeopleHavingRole`). See "URL Serialization for Huron API" section below.

#### 4. DeactivatePerson
**Purpose**: Soft delete (deactivate) person in target

**Environment Prefix**: DEACTIVATE_PERSON

**Harness Location**: `crud/DeactivatePerson.ts`

**Configuration**: 
- Deactivation reason
- Effective date
- Cascade rules (related records)

### Organizational Context (2 harnesses)

#### 5. ReadOrganization
**Purpose**: Fetch single organizational unit

**Environment Prefix**: READ_ORGANIZATION

**Harness Location**: `org/ReadOrganization.ts`

#### 6. ReadOrganizations
**Purpose**: Fetch all organizational units or filtered set

**Environment Prefix**: READ_ORGANIZATIONS

**Harness Location**: `org/ReadOrganizations.ts`

### Authentication & Mutation (2 harnesses)

#### 7. AuthToken
**Purpose**: Obtain and refresh JWT authentication tokens

**Environment Prefix**: AUTH_TOKEN

**Harness Location**: `AuthToken.ts`

**Critical Pattern**: Tests token acquisition and refresh mechanism

#### 8. UpsertBulkTargetPatcher (in parent directory)
**Purpose**: Bulk update/insert operations

**Environment Prefix**: BULK_TARGET_PATCHER

**Location**: `../BulkTargetPatcher.ts`

## Pattern: DataTarget Base Class

All implementations extend abstract `DataTarget` from `integration-core`:

```typescript
import { DataTarget } from 'integration-core';

export class MyDataTarget extends DataTarget {
  async read(id: string): Promise<Person | null> {
    // Fetch person by ID
  }
  
  async write(person: Person): Promise<void> {
    // Create or update person
  }
  
  async deactivate(id: string, reason?: string): Promise<void> {
    // Soft delete
  }
}
```

## Authentication Pattern: JWT Token with Refresh

DataTarget uses JWT token authentication (more complex than DataSource):

```typescript
// 1. Acquire token via credentials
const token = await authTokenTarget.obtainToken(username, password);

// 2. Use token in requests
const headers = {
  'Authorization': `Bearer ${base64EncodedToken}`,
  'Content-Type': 'application/json'
};

// 3. Refresh on expiry
if (tokenExpired(token)) {
  const newToken = await authTokenTarget.refreshToken();
}
```

**Environment Variables**:
- DATATARGET_BASE_URL (shared, unprefixed)
- AUTH_TOKEN_USER_ID (shared, unprefixed)
- AUTH_TOKEN_PASSWORD (shared, unprefixed)
- AUTH_TOKEN_LOGIN_SVC_PATH (shared, unprefixed)
- AUTH_TOKEN_TIMEOUT (prefix-specific if needed)

## URL Serialization for Huron API

**Problem**: The Huron API has specific URL encoding requirements that differ from standard axios behavior. The API expects:
- **Unencoded brackets** in parameter names: `filter[roles]=...` not `filter%5Broles%5D=...`
- **Encoded special characters** in values: `hrn%3Ahrs%3Alists%3Aroles%2Fprimary` (colons → %3A, slashes → %2F)

This incompatibility only surfaced with HRN-based filtering (e.g., role filtering) since previous filters used simple string values like `'true'` which didn't expose the encoding issue.

**Solution**: Custom URL parameter serializer in `UrlSerializer.ts`

```typescript
import { serializeParams } from './UrlSerializer';

// In ApiClientForJWT constructor
const config = {
  baseURL: this.baseUrl,
  paramsSerializer: (params) => serializeParams(params)
};
```

**When to Use**:
- Enable in `ApiClientForJWT` via `useCustomUrlSerializer: true` in EndpointConfigForJWT
- Currently used by `ReadPeople` for HRN-based role filtering
- Defaults to `false` for backward compatibility

**Example Output**:
```
// Custom serializer produces:
filter[roles]=in:hrn%3Ahrs%3Alists%3Aroles%2Fprimary

// Standard axios would produce (rejected by Huron API):
filter%5Broles%5D=in:hrn:hrs:lists:roles/primary
```

**Encoding Rules**:
- Parameter names: Preserve brackets `[]`, colons `:`, exclamation marks `!`
- Comparison operators: Preserve `eq:`, `neq:`, `lt:`, `lte:`, `gt:`, `gte:`, `in:`, `null:`
- HRN values: Encode colons `%3A` and slashes `%2F`
- Include parameters: Preserve commas in field lists

## ConfigManager Integration

DataTarget operations typically use ConfigManager chain for credential resolution:

```typescript
const configManager = new ConfigManager();
const targetUsername = configManager
  .fromTaskDef()      // First: ECS TaskDef secrets
  .fromSecretManager() // Second: AWS Secrets Manager
  .fromEnvironment()   // Third: Environment variables
  .getVariable('DATATARGET_USER');
```

**Three-Tier Priority**:
1. **TaskDef** (fromJsonString): ECS Fargate runtime credentials
2. **Secrets Manager** (fromSecretManager): Production AWS Secrets
3. **Environment** (fromEnvironment): Local `.env` variables
4. **Filesystem** (fromFileSystem): Fallback config files

## Adding a New DataTarget

### Steps:
1. Create new file in appropriate subdirectory (crud/, org/, etc.)
2. Extend `DataTarget` base class from integration-core
3. Implement required methods (read, write, deactivate)
4. Add harness block:
   ```typescript
   import { TestEnvironment } from 'integration-core';
   
   if (require.main === module) {
     const testEnvironment = TestEnvironment('NEW_TARGET_OPERATION');
     [
       'SPECIFIC_VAR_1',
       'SPECIFIC_VAR_2'
     ].forEach(testEnvironment.getVarOrEmptyString);
     main();
   }
   ```
5. Determine authentication method:
   - **Simple API Key**: Use DATASOURCE_API_KEY pattern
   - **JWT with Refresh**: Follow AuthToken pattern
6. Add environment variables to `.env` under harness group
7. Document in `example-env.md`
8. Update parent README

### Environment Configuration Considerations:
- **Shared variables**: DATATARGET_BASE_URL, AUTH_TOKEN_USER_ID, AUTH_TOKEN_PASSWORD (unprefixed)
- **Operation-specific**: Timeouts, batch sizes, deactivation reasons (PREFIX_VARNAME)
- **Exemption**: Never prefix DATATARGET_* variables—they're shared across all targets

## Error Handling Patterns

### AuthToken Failures
- Invalid credentials → Clear token cache, prompt re-auth
- Expired token → Trigger refresh automatically
- Network errors → Retry with exponential backoff

### CRUD Operation Failures
- Record not found → Return null (for Read operations)
- Validation errors → Throw with detailed error message
- Permission denied → Log and propagate auth issue
- Concurrent modification → Retry or fail based on business rule

## Testing Harnesses

Each harness validates:
- Token acquisition and validity
- Read operations (single, bulk, organizational queries)
- Write/update operations (permissions, validation)
- Deactivation logic (cascade handling, audit trail)
- Error conditions (auth failures, malformed data, network timeouts)

### Execution:
```bash
# VS Code
F5 on the DataTarget file

# npx
npx ts-node src/data-target/crud/ReadPerson.ts
npx ts-node src/data-target/AuthToken.ts
npx ts-node src/BulkTargetPatcher.ts
```

### Validation Checklist:
1. Authentication tokens obtained and validated
2. CRUD operations return expected data structures
3. Deactivation respects organizational constraints
4. Error messages are informative
5. Retry logic handles transient failures
6. Concurrent modifications handled correctly

