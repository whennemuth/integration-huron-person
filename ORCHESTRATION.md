# integration-huron-person: Main Orchestration Harnesses

## Purpose
Orchestration harnesses that coordinate the synchronization process end-to-end.

## Harnesses (3 total)

### 1. SyncPeople
**Purpose**: Sync all persons in a population

**Environment Prefix**: SYNC_PEOPLE

**Location**: `SyncPeople.ts`

**Workflow**:
1. Fetch all persons from source
2. Fetch current persons from target
3. Determine delta for each person
4. Write changes to target
5. Publish statistics

**Configuration**:
```bash
SYNC_PEOPLE_BATCH_SIZE=200          # Batch size for target writes
SYNC_PEOPLE_TIMEOUT=7200000         # 2 hour timeout (large populations)
SYNC_PEOPLE_CHECKPOINT_INTERVAL=1000 # Save progress every N records
```

### 2. SyncPerson
**Purpose**: Sync single person record

**Environment Prefix**: SYNC_PERSON

**Location**: `SyncPerson.ts`

**Workflow**:
1. Fetch person by ID from source
2. Fetch person by ID from target
3. Determine delta
4. Apply change (create/update)
5. Return result

**Configuration**:
```bash
SYNC_PERSON_TIMEOUT=30000           # 30 second timeout (single record)
SYNC_PERSON_VERIFY_AFTER_WRITE=true # Verify write succeeded
```

### 3. SyncPersonBatch
**Purpose**: Sync a batch of person IDs

**Environment Prefix**: SYNC_PERSON_BATCH

**Location**: `SyncPersonBatch.ts`

**Workflow**:
1. Load batch of person IDs (from file, parameter, or stream)
2. Fetch persons from source (parallel)
3. Fetch persons from target (parallel)
4. Determine delta for each
5. Write changes (batched)
6. Report progress

**Configuration**:
```bash
SYNC_PERSON_BATCH_SIZE=100          # How many IDs per batch
SYNC_PERSON_BATCH_PARALLEL_WORKERS=4 # Parallel fetch tasks
SYNC_PERSON_BATCH_TIMEOUT=600000    # 10 minute timeout
```

## Orchestration Pattern

### High-Level Flow

```
┌──────────────────────────────────────┐
│ SyncPeople / SyncPersonBatch         │
│ (Main orchestrator)                  │
├──────────────────────────────────────┤
│ 1. Load source persons               │
│ 2. Load target persons               │
│ 3. For each person:                  │
│    - Determine delta                 │
│    - Apply change                    │
│ 4. Report statistics                 │
└──────────────────────────────────────┘
```

### Component Integration

```typescript
export class SyncPeople {
  constructor(
    private sourceDataSource: PersonDataSource,
    private targetDataTarget: PersonDataTarget,
    private deltaStrategy: UpsertDeltaStrategy,
    private dataMapper: DataMapper
  ) {}

  async sync(): Promise<SyncStatistics> {
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      deactivated: 0,
      errors: 0
    };

    try {
      // Step 1: Fetch source data
      console.log('Fetching source persons...');
      const sourcePersons = await this.sourceDataSource.fetch();
      console.log(`Fetched ${sourcePersons.length} source persons`);

      // Step 2: Fetch target data
      console.log('Fetching target persons...');
      const targetPersons = await this.targetDataTarget.fetchAll();
      const targetMap = new Map(targetPersons.map(p => [p.id, p]));
      console.log(`Fetched ${targetPersons.length} target persons`);

      // Step 3: Process each person
      for (const sourcePerson of sourcePersons) {
        try {
          stats.processed++;
          
          // Map source format to target format
          const mapped = this.dataMapper.map(sourcePerson);
          
          // Get target record if exists
          const targetPerson = targetMap.get(mapped.id);
          
          // Determine what action to take
          const delta = await this.deltaStrategy.determineDelta(
            mapped,
            targetPerson
          );
          
          // Execute delta action
          switch (delta) {
            case DeltaAction.CREATE:
              await this.targetDataTarget.write(mapped);
              stats.created++;
              break;
            case DeltaAction.UPDATE:
              await this.targetDataTarget.write(mapped);
              stats.updated++;
              break;
            case DeltaAction.DEACTIVATE:
              await this.targetDataTarget.deactivate(mapped.id);
              stats.deactivated++;
              break;
            case DeltaAction.NO_CHANGE:
              // No action needed
              break;
          }
          
          // Logging
          if (stats.processed % 100 === 0) {
            console.log(`Progress: ${stats.processed}/${sourcePersons.length}`);
          }
          
        } catch (error) {
          console.error(`Error processing person ${sourcePerson.id}:`, error);
          stats.errors++;
        }
      }
      
      // Step 4: Report
      console.log('Sync complete:', stats);
      return stats;
      
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }
}
```

## Testing Orchestration Harnesses

### SyncPeople Harness

```bash
npx ts-node src/SyncPeople.ts
```

**Validation**:
1. Source data fetched correctly
2. Target data fetched correctly
3. Deltas computed accurately
4. Changes applied to target
5. Statistics match actual work

### SyncPerson Harness

```bash
npx ts-node src/SyncPerson.ts
```

**Test Cases**:
- Sync new person (not in target)
- Sync existing person with changes
- Sync person with no changes
- Handle missing person (should deactivate)

### SyncPersonBatch Harness

```bash
# Create test batch file
echo '["P123", "P124", "P125"]' > test-batch.json

npx ts-node src/SyncPersonBatch.ts --batch test-batch.json
```

## Error Handling & Resilience

### Partial Failure Handling
If one person fails, continue processing others:

```typescript
for (const person of persons) {
  try {
    await processPerson(person);
  } catch (error) {
    console.error(`Failed person ${person.id}:`, error);
    stats.errors++;
    // Continue to next person
  }
}
```

### Checkpointing (Resume After Failure)
Save progress periodically to resume from last checkpoint:

```typescript
const checkpoint = await getLastCheckpoint();
const startIndex = checkpoint?.processedCount || 0;

for (let i = startIndex; i < persons.length; i++) {
  await processPerson(persons[i]);
  
  if (i % 1000 === 0) {
    await saveCheckpoint({ processedCount: i });
  }
}
```

### Timeout Handling
Set appropriate timeouts for different orchestrators:

```typescript
const SYNC_PEOPLE_TIMEOUT = 7200000;      // 2 hours for all people
const SYNC_PERSON_TIMEOUT = 30000;        // 30 sec for single
const SYNC_PERSON_BATCH_TIMEOUT = 600000; // 10 min for batch
```

## Statistics & Monitoring

### Output Format

```
Sync Statistics:
  Total Processed:  10000
  Created:          2500
  Updated:          5000
  Deactivated:      500
  Errors:           0
  Success Rate:     100%
  Duration:         2m 34s
  Throughput:       65 persons/second
```

### Metrics to Track
- Records processed per second
- Success/failure ratio
- Distribution of actions (create vs update)
- Error categories (auth, validation, network)
- Peak memory usage
- Total duration

## Integration with Pipeline

### From Chunking Pipeline
```
Phase 1 (Chunking) outputs chunks
  ↓
SyncPeople/SyncPersonBatch processes chunks
  ↓
Phase 3 (Merging) consolidates results
```

### Standalone Usage
```bash
# Run orchestrator independently
npm run sync:people

# Run with specific configuration
SYNC_PEOPLE_BATCH_SIZE=500 npm run sync:people
```

