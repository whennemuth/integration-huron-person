import { S3Client, SelectObjectContentCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export type ChunkProcessorConfig = {
  bucketName: string;
  key: string;
  region: string;
}

/**
 * Abstract base class implementing the Template Method pattern for processing NDJSON 
 * chunk files in S3. This class defines the skeleton of the chunk processing algorithm:
 * 
 * 1. List all .ndjson files in the specified S3 directory (or process a single file)
 * 2. Process each file using S3 Select with a SQL expression
 * 3. Aggregate results across all files
 * 
 * Subclasses implement the specific behavior for:
 * - getSqlExpression(): The SQL query to execute against each file
 * - processFileResult(): How to handle results from each file
 * - finalizeResults(): How to aggregate and present final results
 */
export abstract class AbstractChunkProcessor {
  protected s3Client: S3Client;

  constructor(protected config: ChunkProcessorConfig) {
    this.s3Client = new S3Client({ region: config.region });
  }

  /**
   * Template method defining the algorithm skeleton. This method orchestrates the 
   * overall process and calls hook methods that subclasses implement.
   */
  protected async processChunks(): Promise<void> {
    const { key } = this.config;

    // Initialize processing (hook for subclasses)
    await this.initializeProcessing();

    // Determine if we're processing a single file or a directory
    if (key.endsWith('/')) {
      // Process all files in directory
      await this.processDirectory(key);
    } else {
      // Process single file
      await this.processFile(key);
    }

    // Finalize and return results (hook for subclasses)
    await this.finalizeResults();
  }

  /**
   * Lists all .ndjson files in a directory using pagination and processes each one.
   * @param directoryKey The S3 directory prefix to scan (must end with '/')
   */
  protected async processDirectory(directoryKey: string): Promise<void> {
    console.log(`Processing directory ${directoryKey}...`);

    try {
      let continuationToken: string | undefined;
      let isTruncated = true;
      let fileCount = 0;

      while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: directoryKey,
          ContinuationToken: continuationToken,
        });

        const listResponse = await this.s3Client.send(listCommand);

        // Process each file in this batch
        if (listResponse.Contents) {
          for (const obj of listResponse.Contents) {
            if (obj.Key && obj.Key !== directoryKey && obj.Key.endsWith('.ndjson')) {
              fileCount++;
              await this.processFile(obj.Key);
            }
          }
        }

        // Handle pagination
        isTruncated = listResponse.IsTruncated ?? false;
        continuationToken = listResponse.NextContinuationToken;
      }

      console.log(`Processed ${fileCount} files from directory ${directoryKey}`);
    } catch (error) {
      console.error(`Error listing directory ${directoryKey}:`, error);
      throw error;
    }
  }

  /**
   * Processes a single file using S3 Select with the SQL expression provided by subclass.
   * @param fileKey The S3 object key to process
   */
  protected async processFile(fileKey: string): Promise<void> {
    console.log(`Processing file ${fileKey}...`);
    
    try {
      const sqlExpression = this.getSqlExpression();
      const command = new SelectObjectContentCommand({
        Bucket: this.config.bucketName,
        Key: fileKey,
        ExpressionType: 'SQL',
        Expression: sqlExpression,
        InputSerialization: {
          JSON: { Type: 'LINES' },
          CompressionType: 'NONE',
        },
        OutputSerialization: {
          JSON: {},
        },
      });

      const response = await this.s3Client.send(command);

      // Process the event stream from the response
      if (response.Payload) {
        for await (const event of response.Payload as any) {
          if (event.Records) {
            const payload = event.Records.Payload;
            if (payload && payload.length > 0) {
              const data = new TextDecoder().decode(payload as Uint8Array);
              await this.processFileResult(fileKey, data);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing file ${fileKey}:`, error);
      // Continue processing other files rather than failing completely
    }
  }

  /**
   * Hook method: Initialize any state before processing begins.
   * Subclasses override this to set up data structures, counters, etc.
   */
  protected async initializeProcessing(): Promise<void> {
    // Default: no initialization needed
  }

  /**
   * Hook method: Get the SQL expression to execute against each file.
   * Subclasses must implement this to define what data to extract.
   */
  protected abstract getSqlExpression(): string;

  /**
   * Hook method: Process the result data from a single file.
   * Called once per file (or potentially multiple times if S3 Select returns multiple record batches).
   * @param fileKey The S3 key of the file being processed
   * @param data The decoded string data from the S3 Select response
   */
  protected abstract processFileResult(fileKey: string, data: string): Promise<void>;

  /**
   * Hook method: Finalize processing and present results.
   * Subclasses override this to aggregate results, save output, display summaries, etc.
   */
  protected abstract finalizeResults(): Promise<void>;
}
