import { FileConfig, DatabaseConfig, S3Config } from 'integration-core';
import { EndpointConfigForJWT } from '../data-target/ApiClientForJWT';
import { EndpointConfigForApiKey } from '../data-source/ApiClientForApiKey';

/**
 * Execution mode for the integration
 */
export type ExecutionMode = 'person' | 'people' | 'terms' | 'none';

/**
 * Configuration for data source endpoints
 */
export type DataSourceConfig = {
  /** API client configuration */
  endpointConfig: EndpointConfigForApiKey;
  /** Endpoint for fetching person data */
  fetchPath: string;
  /** Optional fields to keep during response filtering */
  fieldsOfInterest?: string[];
};

export type S3CsvConfig = {
  /** Base bucket name */
  bucketName: string;
  /** Full S3 object key (path + filename, e.g., 'data/states.csv') */
  key: string;
  /** AWS region */
  region: string;
}

/**
 * Configuration interface for Huron Person Integration
 */
export interface Config {
  /** DataSource configuration (where we fetch data from) - uses API key authentication */
  dataSource: {
    /** Configuration for single person operations */
    person?: DataSourceConfig;
    /** Configuration for bulk people operations */
    people?: DataSourceConfig;
    /** Configuration for aquiring list of terms */
    terms?: DataSourceConfig;
    /** Configuration for aquiring list of states */
    statesCsvS3Config?: S3CsvConfig;
    /** Configuration for aquiring list of countries */
    countriesCsvS3Config?: S3CsvConfig;
  };
  
  /** DataTarget configuration (where we push data to) - uses JWT authentication */
  dataTarget: {
    /** API client configuration */
    endpointConfig: EndpointConfigForJWT;
    /** Endpoint for pushing person data updates */
    personsPath: string;
    /** Endpoint for fetching organization data */
    organizationsPath: string;
  };
  
  /** Integration settings */
  integration: {
    /** Client identifier for this integration */
    clientId: string;
    /** Batch size for data processing */
    batchSize?: number;
    /** Request timeout in milliseconds */
    timeout?: number;
  };
  
  /** Delta storage configuration */
  storage: {
    /** Storage type: 'file' | 'database' | 's3' */
    type: 'file' | 'database' | 's3';
    /** Storage-specific configuration */
    config: FileConfig | DatabaseConfig | S3Config;
  };

  /** Filesystem path for cache storage of JWT tokens */
  cache?: {
    /** Enable or disable caching */
    enabled: boolean;
    /** Cache TTL in seconds */
    path?: string;
  };
}
