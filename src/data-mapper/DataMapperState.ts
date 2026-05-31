import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { STATES_CSV } from './csv/states-csv';
import { TestEnvironment } from 'integration-core';

export type StateRow = {
  huronCode: string;
  huronName: string;
}

export type StateMappings = { 
  forwardMap: Map<string, StateRow>,
  reverseMap: Map<string, string>
}

/**
 * Utility class to load and provide access to state code and name mappings.
 * Loads data from a CSV file or S3 bucket and provides a method to get the mapping as a Map.
 * Runs in a static context so the data is loaded once and shared across instances.
 */
export class StateLookup {
  private static cachedStates: StateMappings | null = null;

  static async loadStates(config?: Config): Promise<StateMappings> {
    // Return cached map if already loaded
    if (StateLookup.cachedStates) {
      return StateLookup.cachedStates;
    }

    if( ! config ) {
      config = ConfigManager.getInstance().fromEnvironment().fromFileSystem().getConfig('none'); 
    }
    let mappings = await StateLookup.loadStatesFromS3Bucket(config);
    if(mappings.forwardMap.size === 0) {
      mappings = await StateLookup.loadStatesLocal();
    }
    
    // Cache the loaded map for future calls
    StateLookup.cachedStates = mappings;
    return mappings;
  }

  static async loadStatesLocal(): Promise<StateMappings> {
    // Use imported CSV constant instead of file system access
    return StateLookup.loadStatesCSV(() => Promise.resolve(STATES_CSV));
  }

  static async loadStatesFromS3Bucket(config: Config): Promise<StateMappings> {
    const { dataSource: { statesCsvS3Config } = {}} = config;
    if(!statesCsvS3Config) {
      console.log('No statesCsvS3Config provided, skipping S3 lookup');
      return { forwardMap: new Map<string, StateRow>(), reverseMap: new Map<string, string>() };
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
      return { forwardMap: new Map<string, StateRow>(), reverseMap: new Map<string, string>() };
    } finally {
      // Ensure we always return a map, even if empty
    }
  }

  static async loadStatesCSV(csvLoader: () => Promise<string>): Promise<StateMappings> {
    const csv = await csvLoader();
    const lines = csv.trim().split('\n');
    if(lines.length > 0 && lines[0].length > 2) {
      // Not a 2-character state code, so assume first line is header and remove it
      lines.shift();
    }
    const forwardMap = new Map<string, StateRow>();
    const reverseMap = new Map<string, string>();
    for (const line of lines) {
      let [code, huronCode, huronName] = line.split(',');

      // Trim and remove quotes from values
      code = code.trim().toUpperCase().replaceAll('"', '');
      huronCode = huronCode.trim().replaceAll('"', '');
      huronName = huronName.trim().replaceAll('"', '');

      // Add to the forward map.
      forwardMap.set(code, { huronCode, huronName });

      // Add to the reverse map for reverse lookups (e.g. by HRN code)
      reverseMap.set(huronCode, code);
    }
    return { forwardMap, reverseMap };
  }


}


if(require.main === module) {
  const testEnvironment = TestEnvironment('DATA_MAPPER_STATE');

  // For testing purposes, load the states and log the map
  StateLookup.loadStates().then(map => {
    console.log('Loaded states map:');
    for(const [key, value] of map.forwardMap.entries()) {
      console.log(`${key} => ${JSON.stringify(value)}`);
    }
  }).catch(error => {
    console.error('Error loading states map:', error);
  });
}