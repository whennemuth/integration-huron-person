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

