import path from "path";
import fs from "fs/promises";
import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export type CountryRow = {
  huronCode: string;
  huronName: string;
}

/**
 * Utility class to load and provide access to country code and name mappings.
 * Loads data from a CSV file or S3 bucket and provides a method to get the mapping as a Map.
 * Runs in a static context so the data is loaded once and shared across instances.
 */
export class CountryLookup {

  static async loadCountries(config?: Config): Promise<Map<string, CountryRow>> {
    if( ! config ) {
      config = ConfigManager.getInstance().fromEnvironment().fromFileSystem().getConfig('none'); 
    }
    let map = await CountryLookup.loadCountriesFromS3Bucket(config);
    if(map.size === 0) {
      map = await CountryLookup.loadCountriesLocal();
    }
    return map;
  }

  static async loadCountriesLocal(): Promise<Map<string, CountryRow>> {
    const filePath = path.join(__dirname, 'csv/countries.csv');
    const csv = await fs.readFile(filePath, 'utf-8');
    return CountryLookup.loadCountriesCSV(() => Promise.resolve(csv));
  }

  static async loadCountriesFromS3Bucket(config: Config): Promise<Map<string, CountryRow>> {
    const { dataSource: { countriesCsvS3Config } = {}} = config;
    if(!countriesCsvS3Config) {
      console.log('No countriesCsvS3Config provided, skipping S3 lookup');
      return new Map<string, CountryRow>();
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
      return new Map<string, CountryRow>();
    } finally {
      // Ensure we always return a map, even if empty
    }
  }

  static async loadCountriesCSV(csvLoader: () => Promise<string>): Promise<Map<string, CountryRow>> {
    const csv = await csvLoader();
    const lines = csv.trim().split('\n');
    if(lines.length > 0 && lines[0].length > 2) {
      // Not a 2-character country code, so assume first line is header and remove it
      lines.shift();
    }
    const map = new Map<string, CountryRow>();
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
  // For testing purposes, load the countries and log the map
  CountryLookup.loadCountries().then(map => {
    console.log('Loaded countries map:');
    for(const [key, value] of map.entries()) {
      console.log(`${key} => ${JSON.stringify(value)}`);
    }
  }).catch(error => {
    console.error('Error loading countries map:', error);
  });
}
