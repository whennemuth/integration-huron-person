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

