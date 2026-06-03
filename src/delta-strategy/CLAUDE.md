# integration-huron-person/src/delta-strategy: Delta Synchronization Patterns

## Purpose
Implements the delta synchronization strategy—determining which records to create, update, delete based on source and target state.

## Harness (1 total)

### UpsertDeltaStrategy
**Purpose**: Determine CRUD operations (create, update, delete) for each record

**Environment Prefix**: UPSERT_DELTA_STRATEGY

**Location**: `UpsertDeltaStrategy.ts`

**Operations**:
- **Create**: Record exists in source, not in target
- **Update**: Record exists in both, source differs from target
- **Deactivate**: Record exists in target, not in source
- **No Change**: Record identical in both

## Delta Synchronization Logic

### 3-State Comparison

```
Source State        Target State        Action
─────────────────────────────────────────────
EXISTS              NOT_EXISTS          CREATE
EXISTS              EXISTS (diff)       UPDATE
EXISTS              EXISTS (same)       NO_CHANGE
NOT_EXISTS          EXISTS              DEACTIVATE (soft delete)
NOT_EXISTS          NOT_EXISTS          IGNORE
```

### Implementation Pattern

```typescript
export class UpsertDeltaStrategy {
  async determineDelta(
    sourcePerson: Person,
    targetPerson: Person | null,
    existingDeletes: Set<string>
  ): Promise<DeltaAction> {
    
    // Soft delete coordination: check if already marked for deletion
    if (existingDeletes.has(sourcePerson.id)) {
      return DeltaAction.SKIP;  // Already handled
    }
    
    // Record doesn't exist in target
    if (!targetPerson) {
      return DeltaAction.CREATE;
    }
    
    // Record exists in both; compare content
    const isDifferent = this.hasChanges(sourcePerson, targetPerson);
    
    if (isDifferent) {
      return DeltaAction.UPDATE;
    } else {
      return DeltaAction.NO_CHANGE;
    }
  }
  
  async handleMissingInSource(
    targetId: string,
    deactivationReason: string
  ): Promise<DeltaAction> {
    // Record exists in target but NOT in source
    // Soft delete (never hard delete in this system)
    return DeltaAction.DEACTIVATE;
  }
  
  private hasChanges(source: Person, target: Person): boolean {
    // Compare relevant fields
    return source.name !== target.name
      || source.email !== target.email
      || source.organization !== target.organization;
  }
}
```

## Delta Action Types

```typescript
enum DeltaAction {
  CREATE = 'create',       // Insert in target
  UPDATE = 'update',       // Modify in target
  DEACTIVATE = 'deactivate',  // Soft delete in target
  NO_CHANGE = 'no_change', // No action needed
  SKIP = 'skip'            // Ignore (already handled)
}
```

## Soft Delete Coordination

### Problem
Multiple phases and workers may attempt to deactivate the same record.

### Solution: DeferredDeleteHandler
Coordinates deactivation requests to prevent conflicts:

```typescript
class DeferredDeleteHandler {
  async queueForDeletion(id: string, reason: string): Promise<void> {
    // Add to deferred delete queue
    await this.queue.enqueue({
      id,
      reason,
      deferredUntil: new Date(Date.now() + 5000)  // Wait 5 sec
    });
  }
  
  async processDeferredDeletes(): Promise<void> {
    // Wait for all phases to queue deletions
    const deletes = await this.queue.getReady();
    
    // Deduplicate by ID
    const unique = new Map(deletes.map(d => [d.id, d]));
    
    // Deactivate each person once
    for (const [id, deletion] of unique.entries()) {
      await this.dataTarget.deactivate(id, deletion.reason);
    }
  }
}
```

## Testing Delta Strategy

```bash
npx ts-node src/delta-strategy/UpsertDeltaStrategy.ts
```

### Validation Checklist
1. CREATE: Source exists, target doesn't → should create
2. UPDATE: Both exist, source differs → should update
3. NO_CHANGE: Identical → no action
4. DEACTIVATE: Source missing, target exists → should deactivate
5. Deduplication: Multiple requests to delete same record → one delete only

## Advanced Scenarios

### Partial Sync (Resume After Failure)
If sync fails mid-way, restart without re-processing successful records:

```typescript
const lastSync = await getLastSuccessfulSync();
const source = sourceDataSource.fetchSince(lastSync);
const target = targetDataSource.fetchAll();

// Process only new/modified source records
for (const person of source) {
  const delta = await deltaStrategy.determineDelta(person, target.get(person.id));
  if (delta !== DeltaAction.NO_CHANGE) {
    // Process delta
  }
}
```

### Bi-Directional Sync
If target can change independently, track both directions:

```typescript
const sourceSince = sourceDataSource.fetchSince(lastSync);
const targetSince = targetDataSource.fetchSince(lastSync);

// Forward: source → target
for (const person of sourceSince) {
  await deltaStrategy.determineDelta(person, null);
}

// Reverse: target → source
for (const person of targetSince) {
  // Handle target-only changes
}
```

