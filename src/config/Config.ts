import { FileConfig, DatabaseConfig, S3Config } from 'integration-core';
import { EndpointConfigForJWT } from '../data-target/ApiClientForJWT';
import { EndpointConfigForApiKey } from '../data-source/ApiClientForApiKey';

/**
 * Configuration interface for Huron Person Integration
 */
export interface Config {
  /** DataSource configuration (where we fetch data from) - uses API key authentication */
  dataSource: {
    /** API client configuration */
    endpointConfig: EndpointConfigForApiKey;
    /** Endpoint for fetching person data */
    fetchPersonsPath: string;
    /** Optional fields to keep during response filtering */
    fieldsToKeep?: string[];
  };
  
  /** DataTarget configuration (where we push data to) - uses JWT authentication */
  dataTarget: {
    /** API client configuration */
    endpointConfig: EndpointConfigForJWT;
    /** Endpoint for pushing person data updates */
    personsPath: string;
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
}
