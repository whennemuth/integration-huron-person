import * as fs from 'fs';
import { TestEnvironment } from 'integration-core';
import { AbstractChunkProcessor, ChunkProcessorConfig } from './AbstractChunkProcessor';

/**
 * ChunkDuplicateFinder scans all NDJSON chunk files in an S3 directory (a single
 * syncRunId's chunk output) and determines whether any personid appears in more than
 * one place - either in more than one chunk file, or more than once within the same file.
 *
 * This exists to settle whether "spurious" trailing chunk files (written by a chunker task
 * that raced another task to establish the true end of records) actually contain records
 * already captured elsewhere (in which case they're duplicates - reprocessing them is an
 * innocuous no-op) or genuinely new records (in which case they must be counted, not
 * discarded). If no duplicate personids are found across an entire run's chunk files, that's
 * evidence every partial/trailing chunk file is valid, non-overlapping data.
 *
 * Reuses the Template Method pattern from AbstractChunkProcessor to:
 * 1. List all .ndjson files in the specified S3 directory
 * 2. Execute "SELECT personid FROM s3object" against each file
 * 3. Track every chunk file each personid was encountered in
 * 4. Report personids found in more than one place, along with every chunk file
 *    (including the first/original one) they were encountered in
 *
 * Usage:
 * 1. Configure environment variables for bucket, key (directory), region, and output file
 * 2. Run the script to scan all chunk files in the directory for duplicate personids
 * 3. Check the output file for the full duplicate report
 *
 * Environment Variables:
 * - CHUNK_DUPLICATE_FINDER_BUCKET: The name of the S3 bucket containing the chunk files
 * - CHUNK_DUPLICATE_FINDER_KEY: The S3 directory prefix to scan (must end with '/')
 * - CHUNK_DUPLICATE_FINDER_REGION: The AWS region where the bucket is located (e.g., 'us-east-2')
 * - CHUNK_DUPLICATE_FINDER_OUTPUT_FILE: The local file path where the duplicate report will be saved
 */
export type PersonIdDuplicate = {
  personid: string;
  chunkFiles: string[];
  occurrenceCount: number;
};

export class ChunkDuplicateFinder extends AbstractChunkProcessor {
  // Every chunk file a personid was found in (in encounter order), including the first one -
  // an entry with more than one element means that personid is a duplicate.
  private personIdOccurrences: Map<string, string[]> = new Map();
  private outputFilePath: string;

  constructor(config: ChunkProcessorConfig, outputFilePath: string) {
    super(config);
    this.outputFilePath = outputFilePath;
  }

  /**
   * Reset occurrence tracking.
   */
  protected async initializeProcessing(): Promise<void> {
    this.personIdOccurrences.clear();
    console.log('Initialized personid occurrence tracking...');
  }

  /**
   * Returns the SQL expression to extract personid from each record.
   * We select all personids (not DISTINCT per file) so repeats within a single file are
   * visible too, not just repeats across files.
   */
  protected getSqlExpression(): string {
    return 'SELECT s.personid FROM s3object s';
  }

  /**
   * Record which chunk file each personid was encountered in.
   */
  protected async processFileResult(fileKey: string, data: string): Promise<void> {
    const lines = data.trim().split('\n').filter(line => line.trim().length > 0);

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        const personid = record.personid;
        if (!personid) {
          continue;
        }
        const occurrences = this.personIdOccurrences.get(personid);
        if (occurrences) {
          occurrences.push(fileKey);
        } else {
          this.personIdOccurrences.set(personid, [fileKey]);
        }
      } catch (error) {
        console.error(`Error parsing JSON line from ${fileKey}:`, error);
        // Continue processing other lines
      }
    }
  }

  /**
   * Report every personid found in more than one place, along with every chunk file
   * (including the original) it was encountered in, and write the full report to a file.
   */
  protected async finalizeResults(): Promise<void> {
    const duplicates: PersonIdDuplicate[] = Array.from(this.personIdOccurrences.entries())
      .filter(([, chunkFiles]) => chunkFiles.length > 1)
      .map(([personid, chunkFiles]) => ({ personid, chunkFiles, occurrenceCount: chunkFiles.length }))
      .sort((a, b) => a.personid.localeCompare(b.personid));

    console.log(`\nDuplicate scan complete:`);
    console.log(`- Total distinct personids found: ${this.personIdOccurrences.size}`);
    console.log(`- Personids with duplicate occurrences: ${duplicates.length}`);

    if (duplicates.length === 0) {
      console.log('No duplicate personids found across chunk files - all partials appear to be valid, non-overlapping data.');
    } else {
      console.log('Duplicate personids and every chunk file each was encountered in:');
      for (const { personid, chunkFiles } of duplicates) {
        console.log(`  ${personid}: ${chunkFiles.join(', ')}`);
      }
    }

    const report = {
      totalDistinctPersonIds: this.personIdOccurrences.size,
      duplicateCount: duplicates.length,
      duplicates
    };

    try {
      fs.writeFileSync(this.outputFilePath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`Successfully saved duplicate report to ${this.outputFilePath}`);
    } catch (error) {
      console.error(`Error writing output file ${this.outputFilePath}:`, error);
      throw error;
    }
  }

  /**
   * Public method to execute the duplicate-finding process.
   */
  public async find(): Promise<void> {
    await this.processChunks();
  }
}

if (require.main === module) {
  const testEnvironment = TestEnvironment('CHUNK_DUPLICATE_FINDER');

  [
    'BUCKET',
    'KEY',
    'REGION',
    'OUTPUT_FILE'
  ].forEach(testEnvironment.getVarOrEmptyString);

  (async () => {
    const {
      CHUNK_DUPLICATE_FINDER_BUCKET: bucketName,
      CHUNK_DUPLICATE_FINDER_KEY: key,
      CHUNK_DUPLICATE_FINDER_REGION: region = 'us-east-2',
      CHUNK_DUPLICATE_FINDER_OUTPUT_FILE: outputFile = 'chunk-duplicate-report.json'
    } = process.env;

    if (!bucketName) {
      console.error('Error: CHUNK_DUPLICATE_FINDER_BUCKET environment variable is not set.');
      process.exit(1);
    }
    if (!key) {
      console.error('Error: CHUNK_DUPLICATE_FINDER_KEY environment variable is not set.');
      process.exit(1);
    }
    if (!key.endsWith('/')) {
      console.error('Error: CHUNK_DUPLICATE_FINDER_KEY must be a directory path ending with "/"');
      process.exit(1);
    }

    const config: ChunkProcessorConfig = {
      bucketName,
      key,
      region
    };

    const finder = new ChunkDuplicateFinder(config, outputFile);
    await finder.find();
  })();
}
