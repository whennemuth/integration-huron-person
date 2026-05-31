import * as fs from 'fs';
import { S3Client, SelectObjectContentCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { TestEnvironment } from 'integration-core';

export type ChunkScannerConfig = {
  bucketName: string;
  key: string;
  region: string;
  stopWhenFound?: boolean; // Optional flag to stop scanning after finding the first match (default: true)
}

/**
 * ChunkScanner class that uses S3 Select to efficiently scan large NDJSON chunk files for 
 * specific person records by BUID. It can scan either a single file or all files within 
 * a specified directory in S3. It returns the file(s) that contain the BUID, and can also 
 * retrieve and save the full person record if needed.
 * 
 * Usage:
 * 1. Configure the environment variables for bucket, key, region, and BUID to find.
 * 2. Run the script, and it will output which file(s) contain the BUID, or that it was not found.
 * 3. Optionally, it can stop after finding the first match to save time when you only need to confirm existence.
 * 4. You can also retrieve the full person record for the found BUID and save it locally in a readable JSON format.
 * 
 * Environment Variables:
 * - CHUNK_SCANNER_BUCKET: The name of the S3 bucket containing the chunk files
 * - CHUNK_SCANNER_KEY: The S3 key to scan (can be a single file or a directory prefix ending with '/')
 * - CHUNK_SCANNER_REGION: The AWS region where the bucket is located (e.g., 'us-east-2')
 * - CHUNK_SCANNER_BUID: The person ID (BUID) to search for in the chunk files
 * - CHUNK_SCANNER_STOP_WHEN_FOUND: Optional flag ('true' or 'false') to stop scanning after finding the first match (default: 'true')
 */
export class ChunkScanner {
  private s3Client: S3Client;
  private foundFileKeys: string[] = [];

  constructor(private config: ChunkScannerConfig) {
    this.s3Client = new S3Client({ region: config.region });
  }

  /**
   * Scans the specified NDJSON chunk file in S3 for a given BUID using S3 Select.
   * @param fileKey The S3 object key to scan
   * @param buid The person ID (BUID) to search for
   * @returns true if the BUID is found in the file, false otherwise
   */
  private scanFileForBuid = async (fileKey: string, buid: string): Promise<boolean> => {
    console.log(`Scanning ${fileKey}...`);
    try {
      const command = new SelectObjectContentCommand({
        Bucket: this.config.bucketName,
        Key: fileKey,
        ExpressionType: 'SQL',
        Expression: `SELECT * FROM s3object s WHERE s.personid = '${buid}'`,
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
            // If we received any payload, the record was found
            if (payload && payload.length > 0) {
              this.foundFileKeys.push(fileKey);
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      console.error(`Error scanning file ${fileKey} for BUID ${buid}:`, error);
      return false;
    }
  };

  /**
   * Lists all NDJSON files in a directory and scans each one for the BUID.
   * @param directoryKey The S3 directory prefix to scan (must end with '/')
   * @param buid The person ID (BUID) to search for
   * @returns An array of file keys that contain the BUID
   */
  private scanDirectoryForBuid = async (directoryKey: string, buid: string): Promise<string[]> => {
    const foundFiles: string[] = [];
    console.log(`Scanning directory ${directoryKey} for BUID ${buid}...`);

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
              const found = await this.scanFileForBuid(obj.Key, buid);
              if (found) {
                foundFiles.push(obj.Key);
                // Stop if we're configured to stop after finding the first match
                if (this.config.stopWhenFound !== false) {
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
   * Scans for a given BUID in either a single file or all files in a directory.
   * @param buid The person ID (BUID) to search for
   * @returns An array of file keys that contain the BUID
   */
  public scanForBuid = async (buid: string): Promise<string[]> => {
    // First, determine if the key is a file or a directory (by checking if it ends with '/')
    const { key } = this.config;
    if (key.endsWith('/')) {
      // Key is a directory, scan all files within the directory
      const foundFiles = await this.scanDirectoryForBuid(key, buid);
      return foundFiles.length > 0 ? foundFiles : [];
    } else {
      // Key is a file, scan the single file
      const found = await this.scanFileForBuid(key, buid);
      return found ? [key] : [];
    }
  }

  /**
   * Retrieves a person's data by their BUID. Find the specific file that contain a 
   * person's record, and then retrieve the full JSON record for that person.
   * @param buid The person ID (BUID) to retrieve
   * @returns The person's data as a JSON object, or undefined if not found
   * @param buid 
   */
  public getPerson = async (buid: string): Promise<any | undefined> => {
    this.config.stopWhenFound = true; // Ensure we stop after finding the first match
    const foundFile = await this.scanForBuid(buid);
    if (foundFile.length === 0) {
      return undefined;
    }
    const fileKey = foundFile[0];
    console.log(`Retrieving person data for BUID ${buid} from file ${fileKey}...`);
    try {
      const command = new SelectObjectContentCommand({
        Bucket: this.config.bucketName,
        Key: fileKey,
        ExpressionType: 'SQL',
        Expression: `SELECT * FROM s3object s WHERE s.personid = '${buid}'`,
        InputSerialization: {
          JSON: { Type: 'LINES' },
          CompressionType: 'NONE',
        },
        OutputSerialization: {
          JSON: {},
        },
      });

      const response = await this.s3Client.send(command);

      console.log(`Processing response to retrieve person data for BUID ${buid}...`);

      // Process the event stream from the response to extract the person's data
      if (response.Payload) {
        for await (const event of response.Payload as any) {
          if (event.Records) {
            const payload = event.Records.Payload;
            if (payload && payload.length > 0) {
              // Parse the JSON line and return the person's data
              console.log(`Parsing person data for BUID ${buid} from file ${fileKey}...`);
              const json: string = new TextDecoder().decode(payload as Uint8Array);
              return JSON.parse(json);
            }
          }
        }
      }

      return undefined;
    } 
    catch (error) {
      console.error(`Error retrieving person data for BUID ${buid} from file ${fileKey}:`, error);
      return undefined;
    }
  }

  /**
   * Retrieves a person's data by their BUID and saves it to a new location on the local
   * file system with the JSON formatted for readability.
   * @param buid The ID (BUID) of the person to save
   */
  public savePerson = async (buid: string): Promise<void> => {
    const personData = await this.getPerson(buid);
    if (!personData) {
      console.log(`Person with BUID ${buid} not found, cannot save.`);
      return;
    }
    const parts = this.foundFileKeys[0].split('/');
    const chunk = parts[parts.length - 1];
    const outputFilename = `${buid}-from-${chunk}.json`;
    try {
      console.log(`Saving person data for BUID ${buid} to file ${outputFilename}...`);
      fs.writeFileSync(outputFilename, JSON.stringify(personData, null, 2));
    }
    catch (error) {
      console.error(`Error saving file ${outputFilename}:`, error);
    }
  }
}



if(require.main === module) {
  const testEnvironment = TestEnvironment('CHUNK_SCANNER');

  [
    'CHUNK_SCANNER_BUID',
    'CHUNK_SCANNER_KEY',
    'CHUNK_SCANNER_REGION',
    'CHUNK_SCANNER_STOP_WHEN_FOUND'
  ].forEach(testEnvironment.getVarOrEmptyString);

  (async () => {

    const {
      CHUNK_SCANNER_TASK: task = 'scan', // Default to 'scan' if not provided
      CHUNK_SCANNER_BUCKET: bucketName, 
      CHUNK_SCANNER_KEY: key, 
      CHUNK_SCANNER_REGION: region = 'us-east-2', 
      CHUNK_SCANNER_BUID: buidToFind, 
      CHUNK_SCANNER_STOP_WHEN_FOUND: stopWhenFound = 'true'
    } = process.env;

    if(task !== 'scan' && task !== 'save') {
      console.error(`Invalid CHUNK_SCANNER_TASK value: ${task}. Must be either 'scan' or 'save'.`);
      process.exit(1);
    }
    if(!bucketName) {
      console.error("Error: CHUNK_SCANNER_BUCKET environment variable is not set.");
      process.exit(1);
    }
    if(!key) {
      console.error("Error: CHUNK_SCANNER_KEY environment variable is not set.");
      process.exit(1);
    }
    if(!buidToFind) {
      console.error("Error: CHUNK_SCANNER_BUID environment variable is not set.");
      process.exit(1);
    }

    const config: ChunkScannerConfig = {
      bucketName, key, region, stopWhenFound: stopWhenFound.toLowerCase() === 'true'
    };

    const scanner = new ChunkScanner(config);
    
    if (task === 'scan') {
      const foundFiles = await scanner.scanForBuid(buidToFind);

      if (foundFiles.length > 0) {
        console.log(`BUID ${buidToFind} found in the following file(s):`);
        foundFiles.forEach(file => console.log(`- s3://${config.bucketName}/${file}`));
      } 
      else {
        console.log(`BUID ${buidToFind} not found in any scanned files.`);
      }
    } 
    else if (task === 'save') {
      await scanner.savePerson(buidToFind);
    }
  })();
}