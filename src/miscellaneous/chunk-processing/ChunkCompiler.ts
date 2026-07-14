import * as fs from 'fs';
import { TestEnvironment } from 'integration-core';
import { AbstractChunkProcessor, ChunkProcessorConfig } from './AbstractChunkProcessor';

/**
 * ChunkCompiler collects all distinct person IDs from NDJSON chunk files in an S3 
 * directory and saves them to a file (one personid per line).
 * 
 * This class uses the Template Method pattern inherited from AbstractChunkProcessor to:
 * 1. List all .ndjson files in the specified S3 directory
 * 2. Execute "SELECT personid FROM s3object" against each file
 * 3. Collect all personids into a Set for deduplication
 * 4. Write the final list to a file (one personid per line)
 * 
 * Usage:
 * 1. Configure environment variables for bucket, key (directory), region, and output file
 * 2. Run the script to compile all personids from the directory
 * 3. Check the output file for the complete list of distinct personids
 * 
 * Environment Variables:
 * - CHUNK_COMPILER_BUCKET: The name of the S3 bucket containing the chunk files
 * - CHUNK_COMPILER_KEY: The S3 directory prefix to scan (must end with '/')
 * - CHUNK_COMPILER_REGION: The AWS region where the bucket is located (e.g., 'us-east-2')
 * - CHUNK_COMPILER_OUTPUT_FILE: The local file path where personids will be saved
 */
export class ChunkCompiler extends AbstractChunkProcessor {
  private personIds: Set<string> = new Set();
  private outputFilePath: string;

  constructor(config: ChunkProcessorConfig, outputFilePath: string) {
    super(config);
    this.outputFilePath = outputFilePath;
  }

  /**
   * Initialize the Set for collecting personids.
   */
  protected async initializeProcessing(): Promise<void> {
    this.personIds.clear();
    console.log('Initialized personid collection...');
  }

  /**
   * Returns the SQL expression to extract personid from each record.
   * We select all personids (not DISTINCT per file) because we'll deduplicate 
   * across all files using the Set.
   */
  protected getSqlExpression(): string {
    return 'SELECT s.personid FROM s3object s';
  }

  /**
   * Process the result from a single file by extracting personids and adding to Set.
   * The data may contain multiple JSON objects (one per line) or a single object.
   */
  protected async processFileResult(fileKey: string, data: string): Promise<void> {
    // Split by newlines to handle multiple records (NDJSON format)
    const lines = data.trim().split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.personid) {
          this.personIds.add(record.personid);
        }
      } catch (error) {
        console.error(`Error parsing JSON line from ${fileKey}:`, error);
        // Continue processing other lines
      }
    }
  }

  /**
   * Write all collected personids to the output file (one per line).
   */
  protected async finalizeResults(): Promise<void> {
    const personIdArray = Array.from(this.personIds).sort();
    
    console.log(`\nCompilation complete:`);
    console.log(`- Total distinct personids found: ${personIdArray.length}`);
    console.log(`- Writing to file: ${this.outputFilePath}`);

    try {
      const fileContent = personIdArray.join('\n') + '\n';
      fs.writeFileSync(this.outputFilePath, fileContent, 'utf-8');
      console.log(`Successfully saved ${personIdArray.length} personids to ${this.outputFilePath}`);
    } catch (error) {
      console.error(`Error writing output file ${this.outputFilePath}:`, error);
      throw error;
    }
  }

  /**
   * Public method to execute the compilation process.
   */
  public async compile(): Promise<void> {
    await this.processChunks();
  }
}

if (require.main === module) {
  const testEnvironment = TestEnvironment('CHUNK_COMPILER');

  [
    'CHUNK_COMPILER_BUCKET',
    'CHUNK_COMPILER_KEY',
    'CHUNK_COMPILER_REGION',
    'CHUNK_COMPILER_OUTPUT_FILE'
  ].forEach(testEnvironment.getVarOrEmptyString);

  (async () => {
    const {
      CHUNK_COMPILER_BUCKET: bucketName,
      CHUNK_COMPILER_KEY: key,
      CHUNK_COMPILER_REGION: region = 'us-east-2',
      CHUNK_COMPILER_OUTPUT_FILE: outputFile = 'compiled-personids.txt'
    } = process.env;

    if (!bucketName) {
      console.error('Error: CHUNK_COMPILER_BUCKET environment variable is not set.');
      process.exit(1);
    }
    if (!key) {
      console.error('Error: CHUNK_COMPILER_KEY environment variable is not set.');
      process.exit(1);
    }
    if (!key.endsWith('/')) {
      console.error('Error: CHUNK_COMPILER_KEY must be a directory path ending with "/"');
      process.exit(1);
    }

    const config: ChunkProcessorConfig = {
      bucketName,
      key,
      region
    };

    const compiler = new ChunkCompiler(config, outputFile);
    await compiler.compile();
  })();
}
