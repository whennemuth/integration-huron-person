import path from "path";
import fs from "fs/promises";
import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export type StateRow = {
  huronCode: string;
  huronName: string;
}

/**
 * Utility class to load and provide access to state code and name mappings.
 * Loads data from a CSV file or S3 bucket and provides a method to get the mapping as a Map.
 * Runs in a static context so the data is loaded once and shared across instances.
 */
export class StateLookup {

  static async loadStates(config?: Config): Promise<Map<string, StateRow>> {
    if( ! config ) {
      config = ConfigManager.getInstance().fromEnvironment().fromFileSystem().getConfig('none'); 
    }
    let map = await StateLookup.loadStatesFromS3Bucket(config);
    if(map.size === 0) {
      map = await StateLookup.loadStatesLocal();
    }
    return map;
  }

  static async loadStatesLocal(): Promise<Map<string, StateRow>> {
    const filePath = path.join(__dirname, 'csv/states.csv');
    const csv = await fs.readFile(filePath, 'utf-8');
    return StateLookup.loadStatesCSV(() => Promise.resolve(csv));
  }

  static async loadStatesFromS3Bucket(config: Config): Promise<Map<string, StateRow>> {
    const { dataSource: { statesCsvS3Config } = {}} = config;
    if(!statesCsvS3Config) {
      console.log('No statesCsvS3Config provided, skipping S3 lookup');
      return new Map<string, StateRow>();
    }
    
    try {
      return await StateLookup.loadStatesCSV(async () => {
        const { bucketName, key, region } = statesCsvS3Config;
        
        if (!bucketName || !key || !region) {
          console.log('S3 config incomplete: missing required field(s)');
          return '';
        }
        
        const s3Client = new S3Client({ region });
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        
        try {
          const response = await s3Client.send(command);
          const csvContent = await response.Body?.transformToString('utf-8');
          console.log(`Successfully loaded states.csv from S3: s3://${bucketName}/${key}`);
          return csvContent || '';
        } catch (error: any) {
          if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
            console.log(`S3 object not found: s3://${bucketName}/${key}`);
          } else if (error.name === 'NoSuchBucket') {
            console.log(`S3 bucket not found: ${bucketName}`);
          } else {
            console.error(`Error fetching from S3: ${error.message}`);
          }
          return '';
        }
      });
    } catch (error: any) {
      console.error(`Error in loadStatesFromS3Bucket: ${error.message}`);
      return new Map<string, StateRow>();
    } finally {
      // Ensure we always return a map, even if empty
    }
  }

  static async loadStatesCSV(csvLoader: () => Promise<string>): Promise<Map<string, StateRow>> {
    const csv = await csvLoader();
    const lines = csv.trim().split('\n');
    if(lines.length > 0 && lines[0].length > 2) {
      // Not a 2-character state code, so assume first line is header and remove it
      lines.shift();
    }
    const map = new Map<string, StateRow>();
    for (const line of lines) {
      let [code, huronCode, huronName] = line.split(',');

      // Trim and remove quotes from values
      code = code.trim().toUpperCase().replaceAll('"', '');
      huronCode = huronCode.trim().replaceAll('"', '');
      huronName = huronName.trim().replaceAll('"', '');

      // Add to map.
      map.set(code, { huronCode, huronName });
    }
    return map;
  }
}


if(require.main === module) {
  // For testing purposes, load the states and log the map
  StateLookup.loadStates().then(map => {
    console.log('Loaded states map:');
    for(const [key, value] of map.entries()) {
      console.log(`${key} => ${JSON.stringify(value)}`);
    }
  }).catch(error => {
    console.error('Error loading states map:', error);
  });
}