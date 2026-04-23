import { FileConfig, DatabaseConfig, S3Config as S3FolderConfig } from 'integration-core';
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
  fetchSchedule?: {
    /** Enable or disable scheduled fetch */
    enabled: boolean;
    /** Cron expression for scheduling the fetch */
    cronExpression: string;
  };
  fieldsOfInterest?: string[];
};

export type S3FileConfig = {
  /** Base bucket name */
  bucketName: string;
  /** Full S3 object key (path + filename, e.g., 'data/states.csv') */
  key: string;
  /** AWS region */
  region: string;
}

export type S3CsvConfig = S3FileConfig & {}

export type S3DataSourceConfig = S3FileConfig & {
  /** Optional fields to keep during response filtering */
  fieldsOfInterest?: string[];
}

/**
 * Configuration interface for Huron Person Integration
 */
export interface Config {
  /** Execution mode for the integration */
  executionMode: ExecutionMode;
  
  /** DataSource configuration (where we fetch data from) - uses API key authentication */
  dataSource: {
    /** Configuration for single person operations */
    person?: DataSourceConfig;
    /** Configuration for bulk people operations */
    people?: DataSourceConfig | S3DataSourceConfig;
    /** Configuration for aquiring list of terms */
    terms?: DataSourceConfig;
    /** Configuration for aquiring list of states */
    statesCsvS3Config?: S3CsvConfig;
    /** Configuration for aquiring list of countries */
    countriesCsvS3Config?: S3CsvConfig;
    /** Identity provider name (for assigning UserID values) */
    idpName: string;
    /** Identity provider domain (for assigning UserID values) */
    idpDomain?: string;
  };
  
  /** DataTarget configuration (where we push data to) - uses JWT authentication */
  dataTarget: {
    /** API client configuration */
    endpointConfig: EndpointConfigForJWT;
    /** Endpoint for pushing person data updates */
    personsPath: string;
    /** Endpoint for fetching organization data */
    organizationsPath: string;
    /** Optional dryrun flag. Indicates that CRUD operation to target is logged instead of executed */
    dryRun?: boolean;
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
    config: FileConfig | DatabaseConfig | S3FolderConfig;
  };

  /** Filesystem path for cache storage of JWT tokens */
  cache?: {
    /** Enable or disable caching */
    enabled: boolean;
    /** Cache TTL in seconds */
    path?: string;
  };
}
