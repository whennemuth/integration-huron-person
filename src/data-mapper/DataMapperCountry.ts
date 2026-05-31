import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { COUNTRIES_CSV } from './csv/countries-csv';
import { TestEnvironment } from 'integration-core';

export type CountryRow = {
  huronCode: string;
  huronName: string;
}

export type CountryMappings = {
  forwardMap: Map<string, CountryRow>,
  reverseMap: Map<string, string>
}

/**
 * Utility class to load and provide access to country code and name mappings.
 * Loads data from a CSV file or S3 bucket and provides a method to get the mapping as a Map.
 * Runs in a static context so the data is loaded once and shared across instances.
 */
export class CountryLookup {
  private static cachedCountries: CountryMappings | null = null;

  static async loadCountries(config?: Config): Promise<CountryMappings> {
    if (CountryLookup.cachedCountries) {
      return CountryLookup.cachedCountries;
    }

    if( ! config ) {
      config = ConfigManager.getInstance().fromEnvironment().fromFileSystem().getConfig('none'); 
    }
    let mappings = await CountryLookup.loadCountriesFromS3Bucket(config);
    if(mappings.forwardMap.size === 0) {
      mappings = await CountryLookup.loadCountriesLocal();
    }
    
    // Cache the loaded map for future calls
    CountryLookup.cachedCountries = mappings;
    return mappings;
  }

  static async loadCountriesLocal(): Promise<CountryMappings> {
    // Use imported CSV constant instead of file system access
    return CountryLookup.loadCountriesCSV(() => Promise.resolve(COUNTRIES_CSV));
  }

  static async loadCountriesFromS3Bucket(config: Config): Promise<CountryMappings> {
    const { dataSource: { countriesCsvS3Config } = {}} = config;
    if(!countriesCsvS3Config) {
      console.log('No countriesCsvS3Config provided, skipping S3 lookup');
      return { forwardMap: new Map<string, CountryRow>(), reverseMap: new Map<string, string>() };
    }
    
    try {
      return await CountryLookup.loadCountriesCSV(async () => {
        const { bucketName, key, region } = countriesCsvS3Config;
        
        if (!bucketName || !key || !region) {
          console.log('S3 config incomplete: missing required field(s)');
          return '';
        }
        
        const s3Client = new S3Client({ region });
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        
        try {
          const response = await s3Client.send(command);
          const csvContent = await response.Body?.transformToString('utf-8');
          console.log(`Successfully loaded countries.csv from S3: s3://${bucketName}/${key}`);
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
      console.error(`Error in loadCountriesFromS3Bucket: ${error.message}`);
      return { forwardMap: new Map<string, CountryRow>(), reverseMap: new Map<string, string>() };
    } finally {
      // Ensure we always return a map, even if empty
    }
  }

  static async loadCountriesCSV(csvLoader: () => Promise<string>): Promise<CountryMappings> {
    const csv = await csvLoader();
    const lines = csv.trim().split('\n');
    if(lines.length > 0 && lines[0].length > 2) {
      // Not a 2-character country code, so assume first line is header and remove it
      lines.shift();
    }
    const forwardMap = new Map<string, CountryRow>();
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
  const testEnvironment = TestEnvironment('DATA_MAPPER_COUNTRY');

  // For testing purposes, load the countries and log the map
  CountryLookup.loadCountries().then(map => {
    console.log('Loaded countries map:');
    for(const [key, value] of map.forwardMap.entries()) {
      console.log(`${key} => ${JSON.stringify(value)}`);
    }
  }).catch(error => {
    console.error('Error loading countries map:', error);
  });
}
