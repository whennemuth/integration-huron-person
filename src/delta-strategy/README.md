# Delta Strategy Module

This directory contains specialized delta computation strategies for the Huron Person integration. These strategies customize how the integration determines which persons need to be created, updated, or deleted when syncing data between source and target systems.

## Overview

The files in this directory implement the **Decorator Pattern** (also known as the Wrapper Pattern) to extend and customize the delta computation behavior provided by the base `DeltaStrategy` classes from the `integration-core` dependency.

### What is the Decorator Pattern?

The Decorator Pattern allows us to add new functionality to objects dynamically by wrapping them with decorator objects that implement the same interface. In our case:

1. **Base Strategies** (from `integration-core`):
   - `DeltaStrategyForFileSystem` - Stores delta state in local files
   - `DeltaStrategyForS3Bucket` - Stores delta state in S3
   - `DeltaStrategyForDatabase` - Stores delta state in a database

2. **Our Decorators** (in this directory):
   - Wrap the base strategies
   - Implement the same `DeltaStrategy` interface
   - Delegate most operations to the wrapped strategy
   - Override specific methods to add custom behavior

This approach allows us to:
- ✅ Extend functionality without modifying `integration-core` code
- ✅ Combine multiple decorators (e.g., ChunkedDeltaStrategy + UpsertDeltaStrategy)
- ✅ Maintain separation of concerns
- ✅ Keep the code testable and maintainable

## Files

### **DeltaStrategyFactory.ts**

Factory class responsible for creating and configuring delta strategies based on storage type (file, S3, or database).

**Key responsibilities:**
- Instantiates base strategies from `integration-core` based on `storage.type` configuration
- Applies decorators based on runtime conditions:
  - Wraps with `ChunkedDeltaStrategy` when `chunkId` is provided (parallel processing)
  - Wraps with `UpsertDeltaStrategy` when `bulkReset` flag is enabled
- Handles dry-run mode by wrapping storage to prevent writes

**Usage:**
```typescript
const strategy = DeltaStrategyFactory.createStrategy({ 
  config, 
  chunkId: '0042',      // Optional: enables chunked processing
  bulkReset: true       // Optional: enables bulk reset mode
});
```

---

### **ChunkedDeltaStrategy.ts**

Decorator for parallel chunk processing that separates integrated delta storage (reading) from chunked delta storage (writing).

**Problem it solves:**
When processing person data in parallel chunks:
- **All chunks** must read from the same baseline: `deltas/previous-input.ndjson` (created by merger)
- **Each chunk** writes its output to a separate path: `deltas/person-full/2026-04-08/chunk-0042.ndjson`

**How it works:**
- Intercepts `computeDelta()` calls
- Overrides the `clientId` parameter when fetching previous data to use `integratedDeltaClientId`
- Preserves the original `clientId` for all other operations (writing chunk-specific deltas)

**Example:**
```typescript
// Config setup in processor.ts
config.integration.clientId = "deltas/person-full/2026-04-08";      // For writing
config.integratedDeltaClientId = "deltas";                          // For reading

// Result:
// Reads:  s3://bucket/deltas/previous-input.ndjson (same for all chunks)
// Writes: s3://bucket/deltas/person-full/2026-04-08/chunk-0042.ndjson (unique per chunk)
```

---

### **UpsertDeltaStrategy.ts**

Decorator for bulk reset/initial sync mode that queries the target system API to determine if each person exists, rather than relying on delta storage files.

**Problem it solves:**
On first sync (or after delta storage corruption), no previous baseline exists. Without this decorator:
- All persons appear as "new" → generates `POST` requests
- Existing persons in target system fail with "duplicate" errors

**How it works:**
- Intercepts `computeDelta()` calls
- For each person, queries Huron API using `ReadPerson.readPersonBySourceIdentifier()`
- Categorizes persons based on API response:
  - **Found in target** → Added to `updated[]` array → `PATCH` request
  - **Not found** → Added to `added[]` array → `POST` request
- Never returns persons in `removed[]` array during bulk reset

**Performance considerations:**
- Makes one API call per person (expensive)
- Only use for initial sync or recovery scenarios
- Switch to standard delta strategy for regular syncs

**Usage:**
Set environment variable or SSM parameter:
```bash
# Via environment (docker-compose)
BULK_RESET=true

# Via SSM Parameter Store (ECS Fargate)
aws ssm put-parameter \
  --name /huron-person-integration/{stack-id}/bulk-reset \
  --value "true" \
  --overwrite
```

---

## Decorator Chain Execution Order

When multiple decorators are applied, they execute in this order:

```
                                    ┌─────────────────────────┐
                                    │   HuronPersonIntegration│
                                    │   (calls computeDelta)  │
                                    └────────────┬────────────┘
                                                 │
                                                 ▼
                            ┌────────────────────────────────────┐
                            │    ChunkedDeltaStrategy            │
                            │    (if chunkId present)            │
                            │    - Overrides read clientId       │
                            └──────────────┬─────────────────────┘
                                           │
                                           ▼
                            ┌────────────────────────────────────┐
                            │    UpsertDeltaStrategy             │
                            │    (if bulkReset=true)             │
                            │    - Queries target API            │
                            └──────────────┬─────────────────────┘
                                           │
                                           ▼
                            ┌────────────────────────────────────┐
                            │    Base DeltaStrategy              │
                            │    (from integration-core)         │
                            │    - File/S3/Database strategy     │
                            └────────────────────────────────────┘
```

**Key insight:** Decorators wrap from outside-in, so ChunkedDeltaStrategy executes first, then passes control to UpsertDeltaStrategy (if enabled), which finally delegates to the base strategy.

---

## Design Pattern Benefits

Using the Decorator Pattern provides several advantages:

1. **Open/Closed Principle** - Open for extension, closed for modification
   - We extend `integration-core` behavior without modifying its source code

2. **Single Responsibility** - Each decorator has one clear purpose
   - `ChunkedDeltaStrategy`: Handles read/write path separation
   - `UpsertDeltaStrategy`: Handles API-based existence checking

3. **Composability** - Decorators can be combined in different ways
   - Can use ChunkedDeltaStrategy alone
   - Can use UpsertDeltaStrategy alone
   - Can use both together (common in chunk processor tasks)

4. **Maintainability** - Easy to add new decorators without affecting existing ones
   - Future decorators can be added to the chain without modifying existing code

---

## Testing Strategy

Each decorator should be tested in isolation:

```typescript
// Test ChunkedDeltaStrategy
const baseMock = jest.mocked(createMockStrategy());
const chunked = new ChunkedDeltaStrategy(baseMock, config);
await chunked.computeDelta(params);
// Verify clientId override for fetchPreviousData

// Test UpsertDeltaStrategy
const baseMock = jest.mocked(createMockStrategy());
const upsert = new UpsertDeltaStrategy(baseMock, config);
await upsert.computeDelta(params);
// Verify API queries and categorization

// Test combined (integration test)
const base = DeltaStrategyFactory.createStrategy({ 
  config, 
  chunkId: '0001', 
  bulkReset: true 
});
// Verify both decorators work together correctly
```

---

## Usage in Processor Tasks

The delta strategies are automatically applied by `DeltaStrategyFactory` based on runtime configuration:

```typescript
// In processor.ts (Fargate task)
const config = buildChunkConfig(bucketName, s3Key, region);
// config.integratedDeltaClientId is set to "deltas"
// config.integration.clientId is set to "deltas/person-full/2026-04-08"

const integration = new HuronPersonIntegration({ 
  config,
  bulkReset: await getBulkResetFlag(),  // From SSM or env
  cache: undefined 
});

// Internally, SyncPeople.ts calls:
const deltaStrategy = DeltaStrategyFactory.createStrategy({ 
  config, 
  chunkId,      // "0042" triggers ChunkedDeltaStrategy
  bulkReset     // true triggers UpsertDeltaStrategy
});

// Result: Base strategy wrapped by ChunkedDeltaStrategy, wrapped by UpsertDeltaStrategy
```

---

## Related Documentation

- [integration-core DeltaStrategy](../../node_modules/integration-core/dist/types/src/delta-strategy/DeltaStrategy.d.ts) - Base interface
- [Decorator Pattern (Gang of Four)](https://refactoring.guru/design-patterns/decorator) - Classic explanation
- [Processor Architecture](../../integration-huron-person-fargate/docs/PROCESSOR_ARCHITECTURE.md) - How chunks are processed
