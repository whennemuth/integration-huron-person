import {
  BatchPushResult,
  BatchStatus,
  CrudOperation,
  DataTarget,
  PushAllParms,
  PushOneParms,
  SinglePushResult,
  Status,
  TestEnvironment,
  Timer
} from 'integration-core';
import { BasicCache, Cache } from '../Cache';
import { Config } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';
import { ReverseDataMapper } from '../data-mapper/DataMapper';
import { deepClone, getLocalConfig } from '../Utils';
import { ApiClientForJWT, EndpointConfigForJWT, TargetApiErrorEventProcessor } from './ApiClientForJWT';
import { HuronOrganization } from './crud/Organization';
import { DeleteOrganizationResult, HuronOrganizationDataTargetDelete } from './OrganizationDataTargetDelete';
import { HuronOrganizationDataTargetUpdate, UpdateOrganizationResult } from './OrganizationDataTargetUpdate';
import { HuronSchemaBroker, Method, SchemaPath } from './SchemaBroker';

/**
 * Request format for pushing organization data to Huron API
 */
export interface OrganizationPushRequest {
  operation: 'create' | 'update' | 'delete';
  fullData?: any; // The complete data payload for the organization record, used for validation and logging
  data: any;
}

/**
 * Response format from Huron API for organization operations
 */
export interface OrganizationPushResponse {
  hrn: string;
}

[
  {
    "name": "AFFILIATE",
    "id": "AFFILIATE",
    "sourceIdentifier": "AFFILIATE",
    "active": true
  },
  {
    "name": "UNASSIGNED",
    "id": "UNASSIGNED",
    "sourceIdentifier": "UNASSIGNED",
    "active": true
  }
]
/**
 * DataTarget implementation for pushing organization data to Huron API
 * 
 * TEST HARNESS USAGE:
 * 
 * Set environment variables in .env file. Example:
 * 
 *  - ORGANIZATION_DATA_TARGET_TASK=create
 *  - ORGANIZATION_DATA_TARGET_JSON_VALUE='[{"name":"AFFILIATE", "id":"AFFILIATE", "sourceIdentifier":"AFFILIATE", "active":true},{"name":"UNASSIGNED", "id":"UNASSIGNED", "sourceIdentifier":"UNASSIGNED", "active":true}]'
 *  - ORGANIZATION_DATA_TARGET_JSON_FILE_PATH=./organization-data.json
 *  - ORGANIZATION_DATA_TARGET_HURON_PERSON_CONFIG_PATH=
 *  - ORGANIZATION_DATA_TARGET_SECRET_ARN=arn:aws:secretsmanager:us-east-2:770203350335:secret:huron-person-fargate-processor/integration/_config/staging-VNYpqv
 *  - ORGANIZATION_DATA_TARGET_CACHE_ENABLED=true
 *  - ORGANIZATION_DATA_TARGET_CACHE_PATH=.
 * 
 * Then run in launch configuration.
 * 
 * TODO: Introduce "upsert" capability.
 */
export class HuronOrganizationDataTarget implements DataTarget {
  public readonly name = 'Huron Organization Data Target';
  public readonly description = 'Pushes organization data to Huron API endpoint';
  private static readonly PAYLOAD_INTERNAL_FIELD_ALLOWLIST = new Set(['__arrayFieldOperations']);

  private apiClient: ApiClientForJWT;
  private config: Config;
  private hrn: string | undefined;
  private errorEventProcessor: TargetApiErrorEventProcessor | undefined;

  constructor(params: { config: Config, cache?: Cache<string, string>, hrn?: string, errorEventProcessor?: TargetApiErrorEventProcessor }) {
    const { config, cache, hrn, errorEventProcessor } = params;
    this.config = config;
    this.hrn = hrn;
    this.errorEventProcessor = errorEventProcessor || config.dataTarget.endpointConfig.errorEventProcessor;
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout,
      errorEventProcessor: this.errorEventProcessor
    };
    
    // Create cache instance if caching is enabled
    this.apiClient = new ApiClientForJWT(endpointConfig, cache);
  }

  private getResponseData = (data: any): string | undefined => {
    if(!data) return undefined;
    if (typeof data === 'string') {
      return data;
    } else if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data);
    }
    return String(data);
  }

  /**
   * Push a single organization record to Huron API
   */
  async pushOne(params: PushOneParms): Promise<SinglePushResult> {
    const { data, crud } = params;
    const { DRY_RUN='false' } = process.env;
    const dryRun = DRY_RUN.toLowerCase().trim() === 'true';
    const { CREATE, UPDATE, DELETE } = CrudOperation;

    try {
      // Convert FieldSet to API request format
      const organizationRequest = HuronOrganizationDataTarget.convertFieldSetToRequest(data, crud);
      
      let response;
      let endpoint = this.config.dataTarget.organizationsPath;
      let _hrn: string | undefined;

      if( dryRun ) {
        console.log(`[DRY RUN] Would perform ${crud} operation on endpoint ${endpoint} with data:`, organizationRequest.data);
      }
      else {
        let retval: UpdateOrganizationResult | DeleteOrganizationResult | undefined;

        const createOrganization = async () => {
          console.log(`Pushing single organization record with CREATE operation:`, getOrganizationIdentifierInfo(organizationRequest.data));
          // CREATE: Use POST to /api/v2/organizations
          this.apiClient.setErrorEventDetails({ message: 'Huron organization creation error', object: { 
            hrn: organizationRequest.data?.hrn,
            sourceIdentifier: organizationRequest.data?.sourceIdentifier 
          }});
          response = await this.apiClient.post<OrganizationPushResponse>(endpoint, organizationRequest.data);
          retval = { response };          
        }

        const updateOrganization = async () => {
          const updater = new HuronOrganizationDataTargetUpdate({
            config: this.config, apiClient: this.apiClient, pushOneParms: params 
          });
          retval = await updater.updateOrganization();
          _hrn = updater.hrn();
        }

        const deactivateOrganization = async () => {
          const deleter = new HuronOrganizationDataTargetDelete({
            config: this.config, apiClient: this.apiClient, pushOneParms: params 
          });
          retval = await deleter.deleteOrganization();
          _hrn = deleter.hrn();
        }

        switch(crud) {

          case CREATE:
            await createOrganization();
            break;

          case UPDATE:
            await updateOrganization();
            break;

          case DELETE:
            await deactivateOrganization();
            break;

          default:
            retval = {
              result: {
                status: Status.FAILURE,
                message: `Unsupported CRUD operation: ${crud}`,
                timestamp: new Date(),
                primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'hrn' in fv),
                crud
              }
            };
        }

        const { result, response: resp } = retval || {};
        if(result) {
          return result;
        }
        response = resp;
      }
      
      const { data:rspData, status, statusText } = response || {};
      const hrn = _hrn || this.hrn;
      const result = { status, statusText, hrn, data: rspData }; 
      
      // API returns {hrn: string} on success
      return {
        status: Status.SUCCESS,
        message: `Successfully pushed organization record: ${this.getResponseData(result)}`,
        timestamp: new Date(),
        primaryKey: [{ hrn }],
        crud
      };
    } 
    catch (error) {
      const { response } = error as any || {};      
      return {
        status: Status.FAILURE,
        message: this.getResponseData(response?.data) || (error instanceof Error ? error.message : String(error)),
        timestamp: new Date(),
        primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'hrn' in fv),
        crud
      };
    }
  }

  /**
   * Push multiple organization records to Huron API in batch
   */
  async pushAll(params: PushAllParms): Promise<BatchPushResult> {
    const { added = [], updated = [], removed = [] } = params;
    const allRecords = [...added, ...updated, ...removed];
    const timer = new Timer();
    
    console.log(`Starting batch push of ${allRecords.length} organization records...`);
    
    const successes: SinglePushResult[] = [];
    const failures: SinglePushResult[] = [];
    const skipped: SinglePushResult[] = [];
    
    // Process records in batches based on configuration
    const batchSize = this.config.integration.batchSize || 10;

    const { CREATE, UPDATE, DELETE } = CrudOperation;
    
    timer.start();

    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allRecords.length / batchSize)}`);
      
      // Process batch records
      for (const record of batch) {
        let crud: CrudOperation;
        
        // Determine CRUD operation based on which array the record came from
        if (added.includes(record)) {
          crud = CREATE;
        } else if (updated.includes(record)) {
          crud = UPDATE;
        } else {
          crud = DELETE;
        }

        const result = await this.pushOne({ data: record, crud });

        if (result.status === Status.SUCCESS) {
          console.log(`✓ Successful ${crud} for: ${JSON.stringify(result)}`);
          successes.push(result);
        } else {
          console.error(`✗ Failed ${crud} for: ${JSON.stringify(result)}`);
          failures.push(result);
        }
      }
    }

    timer.stop();

    // Determine batch status
    let batchStatus: BatchStatus;
    if (failures.length === 0) {
      batchStatus = BatchStatus.SUCCESS;
    } else if (successes.length === 0) {
      batchStatus = BatchStatus.FAILURE;
    } else {
      batchStatus = BatchStatus.PARTIAL;
    }
    
    timer.logElapsed(`Batch push completed: ${successes.length} successes, ${failures.length} failures, ${skipped.length} skipped`);

    return {
      status: batchStatus,
      successes,
      failures,
      skipped,
      timestamp: new Date(),
      message: `Batch push completed: ${successes.length} successes, ${failures.length} failures, ${skipped.length} skipped`
    };
  }

  /**
   * Convert FieldSet to Huron API request format
   */
  private static stripInternalFields(payload: any): any {
    if (Array.isArray(payload)) {
      return payload.map(item => HuronOrganizationDataTarget.stripInternalFields(item));
    }

    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    return Object.entries(payload).reduce((acc: any, [key, value]) => {
      if (
        key.startsWith('__') &&
        !HuronOrganizationDataTarget.PAYLOAD_INTERNAL_FIELD_ALLOWLIST.has(key)
      ) {
        return acc;
      }
      acc[key] = HuronOrganizationDataTarget.stripInternalFields(value);
      return acc;
    }, {});
  }

  public static convertFieldSetToRequest(fieldSet: any, operation: CrudOperation): OrganizationPushRequest {
    // Determine the correct API path and method based on operation
    let path: SchemaPath;
    let method: Method;
    let data: any;
    let fullData: any;
    
    switch (operation) {
      case CrudOperation.CREATE:
        path = SchemaPath.ORGANIZATIONS;
        method = Method.POST;
        data = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        fullData = deepClone(data);
        break;
      case CrudOperation.UPDATE:
        path = SchemaPath.ORGANIZATIONS_BY_HRN;
        method = Method.PATCH;
        data = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        fullData = deepClone(data);
        break;
      case CrudOperation.DELETE:
        // DELETE: Implement as soft delete by setting active: false
        path = SchemaPath.ORGANIZATIONS_BY_HRN;
        method = Method.PATCH;
        data = { active: false };
        fullData = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        break;
      default:
        throw new Error(`Unsupported CRUD operation: ${operation}`);
    }

    data = HuronOrganizationDataTarget.stripInternalFields(data);

    return { operation, data, fullData };
  }

  /**
   * Public method to explicitly acquire/refresh JWT token
   * Useful for ensuring token exists before starting data operations
   */
  async ensureValidToken(): Promise<void> {
    return this.apiClient.ensureValidToken();
  }

  /**
   * Get current JWT token expiry time
   */
  getTokenExpiryTime(): number {
    return this.apiClient.getTokenExpiryTime();
  }

  /**
   * Get minutes until JWT token expires
   */
  getTokenExpiryMinutes(): number {
    return this.apiClient.getTokenExpiryMinutes();
  }
}

/**
 * Get all keys that could potentially identify an organization record, and return those that are present.
 * @param data 
 * @returns 
 */
export const getOrganizationIdentifierInfo = (data: any): string => {
  const { hrn, id, sourceIdentifier } = data || {};
  const retvalObj = {
    hrn: hrn || undefined,
    id: id || undefined,
    sourceIdentifier: sourceIdentifier || undefined,
    active: 'active' in data ? data.active : undefined
  }
  return Object.values(retvalObj).find(v => v !== undefined) ?
    JSON.stringify(retvalObj) : 
    'unknown';
};


async function main() {
  const { 
    TASK, 
    JSON_VALUE, 
    JSON_FILE_PATH,
    HURON_PERSON_CONFIG_PATH,
    SECRET_ARN,
    CACHE_ENABLED,
    CACHE_PATH
  } = process.env;
  
  let task = TASK as 'create' | 'update' | 'delete';
  let json: string | undefined;

  if(JSON_VALUE) {
    console.log('Found raw JSON in environment variable');
    json = JSON_VALUE;
  }
  else if(JSON_FILE_PATH) {
    console.log(`Reading JSON from file: ${JSON_FILE_PATH}`);
    json = require('fs').readFileSync(JSON_FILE_PATH, 'utf-8');
  }

  if(!json) {
    throw new Error('No JSON data provided. Set either JSON_VALUE or JSON_FILE_PATH environment variable.');
  }

  if(!task) {
    throw new Error('No TASK provided. Set TASK environment variable to one of: create, update, delete');
  }

  // Parse the JSON data
  const parsedData = JSON.parse(json);
  const orgs = [] as HuronOrganization[];

  // Determine if parsedData is an array or standard object
  if (Array.isArray(parsedData)) {
    orgs.push(...parsedData);
  } else {
    orgs.push(parsedData);
  }

  console.log(`Processing ${orgs.length} organization(s) for ${task} operation`);

  // Load configuration
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = await configManager
    .reset()
    .fromFileSystem(localConfigPath)              // ← Local dev only
    .fromJsonString('HURON_PERSON_CONFIG_JSON')   // ← TaskDef secret injection
    .fromEnvironment()                            // ← Fallback to individual env var overrides
    .fromSecretManager(SECRET_ARN)                // ← Fallback to Secrets Manager
    .getConfigAsync('person');

  // Setup cache if enabled
  let cache: BasicCache | undefined;
  if(CACHE_ENABLED === 'true' && CACHE_PATH) {
    cache = BasicCache.getInstance(config);
    console.log('Token caching enabled');
  }

  // Create DataTarget instance
  const dataTarget = new HuronOrganizationDataTarget({ config, cache });

  // Ensure valid token before starting operations
  await dataTarget.ensureValidToken();
  console.log(`Token expires in ${dataTarget.getTokenExpiryMinutes()} minutes`);

  // Create mapper for converting organization data to FieldSet
  const mapper = new ReverseDataMapper();
  
  // Define fields that can be present in organization data
  mapper.addFieldDefinition({ name: 'hrn', type: 'string' as const, required: false });
  mapper.addFieldDefinition({ name: 'name', type: 'string' as const, required: false });
  mapper.addFieldDefinition({ name: 'id', type: 'string' as const, required: false });
  mapper.addFieldDefinition({ name: 'sourceIdentifier', type: 'string' as const, required: false });
  mapper.addFieldDefinition({ name: 'active', type: 'boolean' as const, required: false });
  mapper.addFieldDefinition({ name: 'category', type: 'object' as const, required: false });
  mapper.addFieldDefinition({ name: 'parent', type: 'object' as const, required: false });
  mapper.addFieldDefinition({ name: 'functions', type: 'array' as const, required: false });
  mapper.addFieldDefinition({ name: 'alias', type: 'array' as const, required: false });
  mapper.addFieldDefinition({ name: 'tags', type: 'array' as const, required: false });
  mapper.addFieldDefinition({ name: 'contactInformation', type: 'object' as const, required: false });
  mapper.addFieldDefinition({ name: 'isInternal', type: 'boolean' as const, required: false });
  mapper.addFieldDefinition({ name: 'isForeign', type: 'boolean' as const, required: false });
  mapper.addFieldDefinition({ name: 'isPubliclyTraded', type: 'boolean' as const, required: false });
  mapper.addFieldDefinition({ name: 'notes', type: 'string' as const, required: false });
  mapper.addFieldDefinition({ name: 'customProperties', type: 'object' as const, required: false });
  mapper.addFieldDefinition({ name: 'dateModified', type: 'string' as const, required: false });
  mapper.addFieldDefinition({ name: '__arrayFieldOperations', type: 'object' as const, required: false });

  // Process organizations based on task
  const results: SinglePushResult[] = [];

  switch(task) {
    case 'create':
      console.log('\n=== CREATE OPERATION ===');
      for (const org of orgs) {
        console.log(`\nCreating organization: ${org.name || org.id || 'unknown'}`);
        const input = mapper.map([org], CrudOperation.CREATE);
        const result = await dataTarget.pushOne({
          crud: CrudOperation.CREATE,
          data: input.fieldSets[0]
        });
        results.push(result);
        console.log(`Result: ${result.status} - ${result.message}`);
      }
      break;

    case 'update':
      console.log('\n=== UPDATE OPERATION ===');
      for (const org of orgs) {
        console.log(`\nUpdating organization: ${org.hrn || org.sourceIdentifier || org.id || 'unknown'}`);
        const input = mapper.map([org], CrudOperation.UPDATE);
        const result = await dataTarget.pushOne({
          crud: CrudOperation.UPDATE,
          data: input.fieldSets[0]
        });
        results.push(result);
        console.log(`Result: ${result.status} - ${result.message}`);
      }
      break;

    case 'delete':
      console.log('\n=== DELETE (DEACTIVATE) OPERATION ===');
      for (const org of orgs) {
        console.log(`\nDeleting (deactivating) organization: ${org.hrn || org.sourceIdentifier || org.id || 'unknown'}`);
        const input = mapper.map([org], CrudOperation.DELETE);
        const result = await dataTarget.pushOne({
          crud: CrudOperation.DELETE,
          data: input.fieldSets[0]
        });
        results.push(result);
        console.log(`Result: ${result.status} - ${result.message}`);
      }
      break;

    default:
      throw new Error(`Unsupported task: ${task}`);
  }

  // Summary
  console.log('\n=== OPERATION SUMMARY ===');
  const successCount = results.filter(r => r.status === Status.SUCCESS).length;
  const failureCount = results.filter(r => r.status === Status.FAILURE).length;
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failure: ${failureCount}`);

  if(failureCount > 0) {
    console.log('\nFailed operations:');
    results.filter(r => r.status === Status.FAILURE).forEach(r => {
      console.log(`  - ${JSON.stringify(r.primaryKey)}: ${r.message}`);
    });
  }
}


// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('ORGANIZATION_DATA_TARGET');

  [
    'TASK',
    'JSON_VALUE',
    'JSON_FILE_PATH',
    'HURON_PERSON_CONFIG_PATH',
    'SECRET_ARN',
    'CACHE_ENABLED',
    'CACHE_PATH'
  ].forEach(testEnvironment.getVarOrEmptyString);

  main();
}
