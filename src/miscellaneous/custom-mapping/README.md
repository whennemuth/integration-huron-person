# Custom Mapping Batched Sync Operations

## Overview

This directory contains scripts and utilities for carrying out synchronization operations for multiple people in batch mode. What would have been a standard synchronization for each person is modified by injecting custom subclass implementations of the data mapper, allowing for the overriding or augmentation of the default mapping behavior.

```mermaid
graph TD
    LIST[List of buids to be Synced] -->|U1234567, U2345678, . . .| A
    A[Batch Sync Operation] --> B[Person 1]
    A --> C[Person 2]
    A --> D[Person N]
    
    B --> E[Custom DataMapper Subclass]
    C --> F[Custom DataMapper Subclass]
    D --> G[Custom DataMapper Subclass]
    
    E --> H{Mapping Behavior}
    F --> H
    G --> H
    
    H -->|Override| I[Replace Default Mapping]
    H -->|Augment| J[Extend Default Mapping]
    
    I --> K[Target System]
    J --> K
    
    style E fill:#e1f5ff
    style F fill:#e1f5ff
    style G fill:#e1f5ff
    style H fill:#fff4e6
    style K fill:#e8f5e9
```

## Modules

### SyncPersonBatchUnassignedOrgEnforcer.ts

**Purpose:** Enforces UNASSIGNED organization assignment for people not present in the authorized population.

**Problem:** The PersonFull population (bulk endpoint) may not contain all individuals that can be looked up via the single-person endpoint. When syncing individuals not in PersonFull, the single-person endpoint returns their actual organization/employer data without knowing they should be excluded from the active population, resulting in incorrect assignments.

**Solution:** Loads authorized BUIDs from a text file (one per line) and checks each person during mapping. For people NOT in the authorized set:
- Sets organization to `lookup:sourceIdentifier:UNASSIGNED`
- Sets employer to `lookup:sourceIdentifier:UNASSIGNED`
- Sets active to `false`

**Usage:**
```bash
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_AUTHORIZED_BUIDS_FILE_PATH=./authorized-buids.txt
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_SYNC_BUIDS_FILE_PATH=./buids-to-sync.txt
npx ts-node src/miscellaneous/custom-mapping/SyncPersonBatchUnassignedOrgEnforcer.ts
```

**Authorized BUIDs File Format:**
```
# Lines starting with # are comments
# One BUID per line
U12345678
U23456789
U34567890
```

