import * as fs from 'fs';
import { S3Client, SelectObjectContentCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { TestEnvironment } from 'integration-core';
import { AbstractChunkProcessor, ChunkProcessorConfig } from './AbstractChunkProcessor';

export type NameSearchCriteria = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
}

export type ChunkScannerForNameConfig = ChunkProcessorConfig & {
  exactMatch?: boolean; // Optional flag to indicate matching of a field should be an exact, case-insensitive match, otherwise the field can contain the value, ignoring case. Default false.
  stopWhenFound?: boolean; // Optional flag to stop scanning after finding the first match (default: true)
}

/**
 * ChunkScannerForName class that scans large NDJSON chunk files in S3 for 
 * specific person records by name (firstName, middleName, lastName, or any combination).
 * 
 * Due to S3 Select SQL limitations (no LIKE, limited functions, complex array access issues),
 * this implementation retrieves all records from S3 and performs filtering in JavaScript code.
 * 
 * It searches within the personBasic.names array (which can have 0-6 elements) and matches records 
 * where ALL specified name criteria are found within the SAME array element. The search is 
 * case-insensitive and can be either exact match or contains match based on configuration.
 * 
 * This class extends AbstractChunkProcessor to inherit S3 client management and shared 
 * utilities, but implements its own scanning logic due to the need to stop early when 
 * a match is found.
 * 
 * Usage:
 * 1. Configure the environment variables for bucket, key, region, and name search criteria.
 * 2. Run the script, and it will output which file(s) contain matching records.
 * 3. Optionally, it can stop after finding the first match to save time.
 * 4. You can also retrieve the full person record for the found match and save it locally.
 * 
 * Environment Variables:
 * - CHUNK_SCANNER_FOR_NAME_BUCKET: The name of the S3 bucket containing the chunk files
 * - CHUNK_SCANNER_FOR_NAME_KEY: The S3 key to scan (can be a single file or a directory prefix ending with '/')
 * - CHUNK_SCANNER_FOR_NAME_REGION: The AWS region where the bucket is located (e.g., 'us-east-2')
 * - CHUNK_SCANNER_FOR_NAME_FIRST_NAME: Optional first name to search for
 * - CHUNK_SCANNER_FOR_NAME_MIDDLE_NAME: Optional middle name to search for
 * - CHUNK_SCANNER_FOR_NAME_LAST_NAME: Optional last name to search for
 * - CHUNK_SCANNER_FOR_NAME_EXACT_MATCH: Optional flag ('true' or 'false') for exact matching (default: 'false')
 * - CHUNK_SCANNER_FOR_NAME_STOP_WHEN_FOUND: Optional flag ('true' or 'false') to stop scanning after finding the first match (default: 'true')
 */
export class ChunkScannerForName extends AbstractChunkProcessor {
  private foundFileKeys: string[] = [];
  private foundRecords: any[] = [];
  private stopWhenFound: boolean;
  private exactMatch: boolean;

  constructor(config: ChunkScannerForNameConfig) {
    super(config);
    this.stopWhenFound = config.stopWhenFound ?? true;
    this.exactMatch = config.exactMatch ?? false;
  }

  // ChunkScannerForName doesn't use the template method pattern for its main logic
  // because it needs to stop early when found, so we override processFileResult and finalizeResults as no-ops
  protected async processFileResult(fileKey: string, data: string): Promise<void> {
    // Not used - ChunkScannerForName uses its own scanning logic
  }
  protected async finalizeResults(): Promise<void> {
    // Not used - ChunkScannerForName returns results directly
  }

  /**
   * Builds a simple SQL expression to retrieve all records.
   * S3 Select doesn't support array indexing in WHERE clauses, so we must filter in code.
   * @returns SQL SELECT expression
   */
  protected getSqlExpression(): string {
    // For NDJSON (Type: 'LINES'), use [*] to access each line as a record
    // All filtering is done in code due to S3 Select SQL limitations
    return 'SELECT * FROM s3object[*] s';
  }

  /**
   * Normalizes a string value for comparison by trimming whitespace and converting to lowercase.
   * Treats null, undefined, empty strings, and whitespace-only strings as equivalent (returns null).
   * @param value The value to normalize
   * @returns Normalized lowercase string or null if empty/whitespace
   */
  private normalizeValue(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed.toLowerCase();
  }

  /**
   * Checks if a name element matches all specified search criteria.
   * @param nameElement A single element from personBasic.names array
   * @param criteria The search criteria
   * @returns true if all specified criteria match within this name element
   */
  private nameElementMatches(nameElement: any, criteria: NameSearchCriteria): boolean {
    // Check each specified criteria field
    if (criteria.firstName !== undefined) {
      const searchValue = this.normalizeValue(criteria.firstName);
      const fieldValue = this.normalizeValue(nameElement?.firstName);
      
      if (!this.valuesMatch(fieldValue, searchValue)) {
        return false;
      }
    }

    if (criteria.middleName !== undefined) {
      const searchValue = this.normalizeValue(criteria.middleName);
      const fieldValue = this.normalizeValue(nameElement?.middleName);
      
      if (!this.valuesMatch(fieldValue, searchValue)) {
        return false;
      }
    }

    if (criteria.lastName !== undefined) {
      const searchValue = this.normalizeValue(criteria.lastName);
      const fieldValue = this.normalizeValue(nameElement?.lastName);
      
      if (!this.valuesMatch(fieldValue, searchValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if a field value matches a search value according to the matching mode.
   * @param fieldValue The normalized field value from the record
   * @param searchValue The normalized search value
   * @returns true if they match according to exactMatch setting
   */
  private valuesMatch(fieldValue: string | null, searchValue: string | null): boolean {
    // If search value is null/empty, treat it as "match anything" (criteria not specified)
    if (searchValue === null) {
      return true;
    }

    // If field value is null/empty but search value is not, no match
    if (fieldValue === null) {
      return false;
    }

    // Both are non-null, non-empty strings - compare according to match mode
    if (this.exactMatch) {
      return fieldValue === searchValue;
    } else {
      return fieldValue.includes(searchValue);
    }
  }

  /**
   * Checks if a person record matches the search criteria.
   * The record matches if ANY element in personBasic.names array has ALL specified criteria matching.
   * @param record The person record to check
   * @param criteria The search criteria
   * @returns true if the record matches
   */
  private recordMatches(record: any, criteria: NameSearchCriteria): boolean {
    const names = record?.personBasic?.names;
    if (!Array.isArray(names) || names.length === 0) {
      return false;
    }

    // Check if any name element matches all criteria
    return names.some(nameElement => this.nameElementMatches(nameElement, criteria));
  }

  /**
   * Scans the specified NDJSON chunk file in S3 for records matching name criteria.
   * Retrieves all records from S3 and filters in code for precise matching.
   * (S3 Select doesn't support array indexing in WHERE clauses)
   * @param fileKey The S3 object key to scan
   * @param criteria The name search criteria
   * @returns Array of matching person records
   */
  private scanFileForName = async (fileKey: string, criteria: NameSearchCriteria): Promise<any[]> => {
    console.log(`Scanning ${fileKey} for name criteria...`);
    const matches: any[] = [];
    
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

      // Accumulate all data from the event stream first
      // S3 Select may send data in chunks that don't align with newlines
      let accumulatedData = '';
      
      if (response.Payload) {
        for await (const event of response.Payload as any) {
          if (event.Records) {
            const payload = event.Records.Payload;
            if (payload && payload.length > 0) {
              accumulatedData += new TextDecoder().decode(payload as Uint8Array);
            }
          }
        }
      }

      // Now parse all complete JSON lines
      if (accumulatedData.trim()) {
        const lines = accumulatedData.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const record = JSON.parse(line);
              // Filter records in code to ensure ALL criteria match within SAME element
              if (this.recordMatches(record, criteria)) {
                matches.push(record);
              }
            } catch (parseError) {
              console.error(`Error parsing JSON line in ${fileKey}:`, parseError);
              console.error(`Problematic line: ${line.substring(0, 200)}...`);
            }
          }
        }
      }

      if (matches.length > 0) {
        console.log(`Found ${matches.length} matching record(s) in ${fileKey}`);
        this.foundFileKeys.push(fileKey);
      }

      return matches;
    } catch (error) {
      console.error(`Error scanning file ${fileKey} for name criteria:`, error);
      return [];
    }
  };

  /**
   * Lists all NDJSON files in a directory and scans each one for matching name records.
   * @param directoryKey The S3 directory prefix to scan (must end with '/')
   * @param criteria The name search criteria
   * @returns An array of file keys that contain matches
   */
  private scanDirectoryForName = async (directoryKey: string, criteria: NameSearchCriteria): Promise<string[]> => {
    const foundFiles: string[] = [];
    console.log(`Scanning directory ${directoryKey} for name criteria...`);

    try {
      let continuationToken: string | undefined;
      let isTruncated = true;

      while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: directoryKey,
          ContinuationToken: continuationToken,
        });

        const listResponse = await this.s3Client.send(listCommand);

        // Scan each file in this batch
        if (listResponse.Contents) {
          for (const obj of listResponse.Contents) {
            if (obj.Key && obj.Key !== directoryKey && obj.Key.endsWith('.ndjson')) {
              const matches = await this.scanFileForName(obj.Key, criteria);
              if (matches.length > 0) {
                foundFiles.push(obj.Key);
                this.foundRecords.push(...matches);
                
                // Stop if we're configured to stop after finding the first match
                if (this.stopWhenFound) {
                  return foundFiles;
                }
              }
            }
          }
        }

        // Handle pagination
        isTruncated = listResponse.IsTruncated ?? false;
        continuationToken = listResponse.NextContinuationToken;
      }
    } catch (error) {
      console.error(`Error listing directory ${directoryKey}:`, error);
    }

    return foundFiles;
  };

  /**
   * Validates that at least one name field is specified in the criteria.
   * @param criteria The name search criteria to validate
   * @throws Error if no name fields are specified
   */
  private validateCriteria(criteria: NameSearchCriteria): void {
    const hasFirstName = criteria.firstName !== undefined && this.normalizeValue(criteria.firstName) !== null;
    const hasMiddleName = criteria.middleName !== undefined && this.normalizeValue(criteria.middleName) !== null;
    const hasLastName = criteria.lastName !== undefined && this.normalizeValue(criteria.lastName) !== null;

    if (!hasFirstName && !hasMiddleName && !hasLastName) {
      throw new Error('At least one name field (firstName, middleName, or lastName) must be specified for search');
    }
  }

  /**
   * Scans for records matching name criteria in either a single file or all files in a directory.
   * @param criteria The name search criteria
   * @returns An array of file keys that contain matches
   */
  public scanForName = async (criteria: NameSearchCriteria): Promise<string[]> => {
    // Validate criteria
    this.validateCriteria(criteria);

    // Reset state
    this.foundFileKeys = [];
    this.foundRecords = [];

    // Determine if the key is a file or a directory
    const { key } = this.config;
    if (key.endsWith('/')) {
      // Key is a directory, scan all files within the directory
      const foundFiles = await this.scanDirectoryForName(key, criteria);
      return foundFiles;
    } else {
      // Key is a file, scan the single file
      const matches = await this.scanFileForName(key, criteria);
      return matches.length > 0 ? [key] : [];
    }
  }

  /**
   * Gets the found records from the most recent scan.
   * @returns Array of matching person records
   */
  public getFoundRecords(): any[] {
    return this.foundRecords;
  }

  /**
   * Saves all found records to a local JSON file with readable formatting.
   * @param outputFilename The filename to save to
   */
  public saveFoundRecords = async (outputFilename: string): Promise<void> => {
    if (this.foundRecords.length === 0) {
      console.log('No records found to save.');
      return;
    }

    try {
      console.log(`Saving ${this.foundRecords.length} record(s) to file ${outputFilename}...`);
      const output = {
        matchCount: this.foundRecords.length,
        files: this.foundFileKeys,
        records: this.foundRecords
      };
      fs.writeFileSync(outputFilename, JSON.stringify(output, null, 2));
      console.log(`Successfully saved records to ${outputFilename}`);
    } catch (error) {
      console.error(`Error saving file ${outputFilename}:`, error);
    }
  }
}

if(require.main === module) {
  const testEnvironment = TestEnvironment('CHUNK_SCANNER_FOR_NAME');

  [
    'BUCKET',
    'KEY',
    'REGION',
    'FIRST_NAME',
    'MIDDLE_NAME',
    'LAST_NAME',
    'EXACT_MATCH',
    'STOP_WHEN_FOUND'
  ].forEach(varName => testEnvironment.getVarOrEmptyString(varName));

  (async () => {

    const {
      CHUNK_SCANNER_FOR_NAME_TASK: task = 'scan', // Default to 'scan' if not provided
      CHUNK_SCANNER_FOR_NAME_BUCKET: bucketName, 
      CHUNK_SCANNER_FOR_NAME_KEY: key, 
      CHUNK_SCANNER_FOR_NAME_REGION: region = 'us-east-2', 
      CHUNK_SCANNER_FOR_NAME_FIRST_NAME: firstName,
      CHUNK_SCANNER_FOR_NAME_MIDDLE_NAME: middleName,
      CHUNK_SCANNER_FOR_NAME_LAST_NAME: lastName,
      CHUNK_SCANNER_FOR_NAME_EXACT_MATCH: exactMatchStr = 'false',
      CHUNK_SCANNER_FOR_NAME_STOP_WHEN_FOUND: stopWhenFoundStr = 'false',
      CHUNK_SCANNER_FOR_NAME_OUTPUT_FILE: outputFile = 'chunk-scanner-found-names.json'
    } = process.env;

    if(task !== 'scan' && task !== 'save') {
      console.error(`Invalid CHUNK_SCANNER_FOR_NAME_TASK value: ${task}. Must be either 'scan' or 'save'.`);
      process.exit(1);
    }
    if(!bucketName) {
      console.error("Error: CHUNK_SCANNER_FOR_NAME_BUCKET environment variable is not set.");
      process.exit(1);
    }
    if(!key) {
      console.error("Error: CHUNK_SCANNER_FOR_NAME_KEY environment variable is not set.");
      process.exit(1);
    }

    // Build search criteria
    const criteria: NameSearchCriteria = {};
    if (firstName) criteria.firstName = firstName;
    if (middleName) criteria.middleName = middleName;
    if (lastName) criteria.lastName = lastName;

    const config: ChunkScannerForNameConfig = {
      bucketName, 
      key, 
      region, 
      exactMatch: exactMatchStr.toLowerCase() === 'true',
      stopWhenFound: stopWhenFoundStr.toLowerCase() === 'true'
    };

    console.log('Search criteria:', criteria);
    console.log('Config:', { ...config, bucketName: '***', region });

    const scanner = new ChunkScannerForName(config);
    
    try {
      if (task === 'scan') {
        const foundFiles = await scanner.scanForName(criteria);

        if (foundFiles.length > 0) {
          console.log(`\nFound ${scanner.getFoundRecords().length} matching record(s) in the following file(s):`);
          foundFiles.forEach(file => console.log(`- s3://${config.bucketName}/${file}`));
          
          console.log('\nMatching records:');
          scanner.getFoundRecords().forEach((record, index) => {
            console.log(`\n[${index + 1}] Person ID: ${record.personid}`);
            console.log('Names:');
            record.personBasic?.names?.forEach((name: any, idx: number) => {
              console.log(`  [${idx}] ${name.firstName || ''} ${name.middleName || ''} ${name.lastName || ''}`.trim());
            });
          });
        } 
        else {
          console.log('No matching records found in any scanned files.');
        }
      } 
      else if (task === 'save') {
        await scanner.scanForName(criteria);
        await scanner.saveFoundRecords(outputFile);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  })();
}
