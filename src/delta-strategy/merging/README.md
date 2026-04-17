# Post-Processing Delta Storage Merging

This directory contains functionality for the post-processing delta storage merging step of the Huron Person integration. This step consolidates the chunked delta outputs from parallel processing into a single baseline file that can then be merged with the previous baseline to comprise the final delta for the current run.

## Overview

When the chunked processing triggers the "EndToEnd" flow, that EndToEnd module "believes" it is processing a full sync and is only being called once for the entire sync operation.
But the S3 data source is actually scoped to just the chunk file and the "EndToEnd" flow is called once per chunk, with each chunk having its own isolated delta storage that it reads from and writes to.

When the "EndToEnd" flow executes the DeltaStorage.updatePreviousData method, it won't be be overwriting a global previous-input.ndjson file, but instead writing to a chunk-specific, unique delta storage path derived from the chunk ID (as part of parallel processing). Thus, no prior state is ever actually being overwritten, though we let the "EndToEnd" flow maintain the illusion that it is doing so.

What this means is that the "previous-input.ndjson" files written by each chunk are actually just intermediate outputs that represent the delta state for that chunk, and not the true baseline for the entire sync operation. The true baseline is only created after all chunks have completed and their outputs are consolidated together in this post-processing merging step.
