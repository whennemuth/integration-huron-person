import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import { DataSource, Timer, TestEnvironment } from 'integration-core';
import * as readline from 'readline';
import { Readable } from 'stream';
import { Config, S3DataSourceConfig } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';
import { getLocalConfig } from '../Utils';

/**
 * DataSource implementation for reading person data from S3 NDJSON files
 * Used for processing chunked data in parallel processor tasks. Instances of this class are
 * masquerading as BuCdmPeopleDataSource when bucketName is provided instead of fetchPath, 
 * so that we can reuse the same processing logic for both API and S3 data sources.
 */
class BuS3PeopleDataSource implements DataSource {
  public readonly name: string = 'BU S3 Data Source';
  public readonly description: string = 'Reads person data from S3 NDJSON files';

  protected config: Config;
  protected params: { config: Config, buid?: string };
  protected s3Client: S3Client;

  constructor(params: { config: Config, buid?: string }) {
    this.params = params;
    this.config = params.config;

    // Extract S3 configuration
    const { people } = this.config.dataSource;
    if (!people || !('bucketName' in people)) {
      throw new Error('S3 data source requires bucketName in configuration');
    }
    
    const s3Config = people as S3DataSourceConfig;
    
    // Initialize S3 client
    this.s3Client = new S3Client({ 
      region: s3Config.region || 'us-east-1'
    });
  }

  /**
   * Fetch raw data from S3 NDJSON file
   * Each line in the file is a JSON object representing one person
   */
  async fetchRaw(): Promise<any[]> {
    const timer = new Timer();
    
    try {
      const { people } = this.config.dataSource;
      if (!people || !('bucketName' in people)) {
        throw new Error('S3 data source configuration is required');
      }
      
      const s3Config = people as S3DataSourceConfig;
      
      console.log(`Fetching data from S3: s3://${s3Config.bucketName}/${s3Config.key}...`);
      timer.start();

      // Get object from S3
      const command = new GetObjectCommand({
        Bucket: s3Config.bucketName,
        Key: s3Config.key
      });
      
      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error('S3 object body is empty');
      }

      // Convert the S3 body to a readable stream
      const stream = response.Body as Readable;
      
      // Parse NDJSON line by line
      const records: any[] = [];
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      let lineNumber = 0;
      for await (const line of rl) {
        lineNumber++;
        
        // Skip empty lines
        if (!line.trim()) {
          continue;
        }

        try {
          const record = JSON.parse(line);
          
          // Apply response filter if configured
          if (s3Config.fieldsOfInterest) {
            // Note: ResponseFilter typically works on streaming axios responses
            // For S3 data, we apply field filtering manually
            const filtered = this.filterFields(record, s3Config.fieldsOfInterest);
            records.push(filtered);
          } else {
            records.push(record);
          }
        } catch (parseError) {
          console.error(`Failed to parse line ${lineNumber}: ${line.substring(0, 100)}...`);
          throw new Error(`JSON parse error at line ${lineNumber}: ${parseError}`);
        }
      }

      timer.stop();
      timer.logElapsed(`Successfully fetched ${records.length} records from S3`);

      return records;
    } catch (error) {
      console.error(`Failed to fetch data from S3:`, error);
      throw new Error(`Failed to fetch data from S3: ${error}`);
    }
  }

  /**
   * Simple field filtering for S3 data (mirrors ResponseProcessor behavior)
   */
  private filterFields(record: any, fieldsOfInterest: string[]): any {
    if (!record || typeof record !== 'object') {
      return record;
    }

    const filtered: any = {};
    for (const field of fieldsOfInterest) {
      if (field in record) {
        filtered[field] = record[field];
      }
    }
    return filtered;
  }
}


/**
 * Main entry point
 * NOTE: Set DRYRUN=true in environment if you want the target system to remain untouched.
 * This will be the .env file if running locally. In production, set the environment variable 
 * on the container or serverless function configuration.
 */
async function main() {
  try {
    // Load configuration
    const { HURON_PERSON_CONFIG_PATH } = process.env;
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const configManager = ConfigManager.getInstance();

    // const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('people');
    const config = configManager.reset().fromFileSystem(localConfigPath).getConfig('people');

    // Output the loaded config to console.
    console.log('Loaded Configuration:', JSON.stringify(config, null, 2));

    const dataSource = new BuS3PeopleDataSource({ config });

    // Fetch data
    const timer = new Timer();
    timer.start();   
    const rawData = await dataSource.fetchRaw();
    timer.stop();
    timer.logElapsed(`Fetched people data in`);

    const recordsFull = 'fetched_people_s3_data.json';

    // Output the fetched data to console
    console.log('Fetched People Data:', JSON.stringify({ 
      recordCount: rawData.length, 
      recordsFull,
      buids: rawData.map((record: any) => record.personid) 
    }, null, 2));

    // Output all elements of the rawData array to a file as formatted JSON.
    fs.writeFileSync(recordsFull, JSON.stringify(rawData, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error fetching people data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('PEOPLE_S3_DATASOURCE');

  [
    'HURON_PERSON_CONFIG_PATH'
  ].forEach(testEnvironment.getVarOrEmptyString);

  main();
}

export { BuS3PeopleDataSource };
