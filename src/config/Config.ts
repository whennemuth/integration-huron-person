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
 * Defines how person deletions are handled in the target system
 * - SOFT: Records are marked as deleted (e.g., with a 'deleted' flag) but not removed from the system
 * - HARD: Records are permanently removed from the system
 * - NONE: No deletion is performed; deleted records in the source are ignored and left unchanged in the target
 * 
 * The choice of deletion type depends on the capabilities of the target system and the desired data retention policies.
 */
export enum TargetPersonDeleteType {
  SOFT = 'soft',
  HARD = 'hard',
  LOG  = 'log',
  NONE = 'none'
}

/**
 * Defines how organization deletions are handled in the target system.
 * - SOFT: Set active: false on the organization record (default, recommended)
 * - HARD: Request hard delete (not typically supported, falls back to soft delete)
 * - LOG: Only log the deletion, don't actually deactivate the organization
 * - NONE: Don't perform any operation
 * 
 * The choice of deletion type depends on the capabilities of the target system and the desired data retention policies.
 */
export enum TargetOrganizationDeleteType {
  SOFT = 'soft',
  HARD = 'hard',
  LOG  = 'log',
  NONE = 'none'
}

/**
 * Configuration interface for Huron Person Integration
 */
export interface Config {
  /** The landscape (environment) that applies to the configuration */
  landscape: string

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
    /** Determines how person deletions are handled in the target system */
    personDeleteType?: TargetPersonDeleteType;
    /** Determines how organization deletions are handled in the target system */
    organizationDeleteType?: TargetOrganizationDeleteType;
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

  /**
   * Optional integrated delta client ID for shared baseline storage.
   * 
   * When set, delta strategies will read previous-input.ndjson from this path
   * instead of integration.clientId. This enables:
   * - Chunked processors to read from shared delta-storage while writing to chunk-specific paths
   * - Test harnesses to read from persistent delta-storage instead of transient clientId paths
   * 
   * Example: "delta-storage" points to s3://bucket/delta-storage/previous-input.ndjson
   * while integration.clientId might be "deltas/person-full/2026-06-05T12:00:00.000Z"
   */
  integratedDeltaClientId?: string;
  
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
