import { 
  DataTarget, 
  PushOneParms, 
  PushAllParms, 
  SinglePushResult, 
  BatchPushResult, 
  Status,
  BatchStatus,
  CrudOperation
} from 'integration-core';
import { ApiClientForJWT, EndpointConfigForJWT } from './ApiClientForJWT';
import { Config } from '../config/Config';
import { Timer } from '../utils/Timer';
import { HuronSchemaBroker, Method, SchemaPath } from './SchemaBroker';

/**
 * Request format for pushing person data to Huron API
 */
export interface PersonPushRequest {
  operation: 'create' | 'update' | 'delete';
  data: any;
}

/**
 * Response format from Huron API for person operations
 */
export interface PersonPushResponse {
  hrn: string;
}

/**
 * DataTarget implementation for pushing person data to Huron API
 */
export class HuronPersonDataTarget implements DataTarget {
  public readonly name = 'Huron Person Data Target';
  public readonly description = 'Pushes person data to Huron API endpoint';

  private apiClient: ApiClientForJWT;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout
    };
    this.apiClient = new ApiClientForJWT(endpointConfig);
  }

  /**
   * Push a single person record to Huron API
   */
  async pushOne(params: PushOneParms): Promise<SinglePushResult> {
    const { data, crud } = params;
    
    try {
      // Convert FieldSet to API request format
      const personRequest = this.convertFieldSetToRequest(data, crud);
      
      console.log(`Pushing single person record with ${crud} operation:`, personRequest.data?.id || 'unknown');
      
      let response;
      let endpoint = this.config.dataTarget.personsPath;
      
      if (crud === CrudOperation.CREATE) {
        // CREATE: Use POST to /api/v2/persons
        response = await this.apiClient.post<PersonPushResponse>(endpoint, personRequest.data);
      } else if (crud === CrudOperation.UPDATE) {
        // UPDATE: Use PUT to /api/v2/persons/{hrn} if hrn is available
        if (personRequest.data?.hrn) {
          endpoint = `${endpoint}/${personRequest.data.hrn}`;
          response = await this.apiClient.put<PersonPushResponse>(endpoint, personRequest.data);
        } else {
          // No HRN available for update, treat as create
          console.warn(`No HRN provided for UPDATE operation, treating as CREATE for person:`, personRequest.data?.id);
          response = await this.apiClient.post<PersonPushResponse>(endpoint, personRequest.data);
        }
      } else if (crud === CrudOperation.DELETE) {
        // DELETE: Implement as soft delete by setting active: false
        // Extract HRN from the original fieldSet data
        const hrn = data.fieldValues.find((fv: any) => fv.hrn)?.hrn;
        if (hrn) {
          endpoint = `${endpoint}/${hrn}`;
          // For soft delete, we only need to set active: false
          const softDeleteData = { active: false };
          response = await this.apiClient.patch<PersonPushResponse>(endpoint, softDeleteData);
        } else {
          return {
            status: Status.FAILURE,
            message: 'Cannot perform soft delete: no HRN available for person',
            timestamp: new Date(),
            primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'hrn' in fv),
            crud
          };
        }
      } else {
        return {
          status: Status.FAILURE,
          message: `Unsupported CRUD operation: ${crud}`,
          timestamp: new Date(),
          primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'hrn' in fv),
          crud
        };
      }
      
      const result = response.data;
      
      // API returns {hrn: string} on success
      return {
        status: Status.SUCCESS,
        timestamp: new Date(),
        primaryKey: [{ hrn: result.hrn }],
        crud
      };
    } catch (error) {
      console.error(`Failed to push person record:`, error);
      return {
        status: Status.FAILURE,
        message: `API request failed: ${error}`,
        timestamp: new Date(),
        primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'hrn' in fv),
        crud
      };
    }
  }

  /**
   * Push multiple person records to Huron API in batch
   */
  async pushAll(params: PushAllParms): Promise<BatchPushResult> {
    const { added = [], updated = [], removed = [] } = params;
    const allRecords = [...added, ...updated, ...removed];
    const timer = new Timer();
    
    console.log(`Starting batch push of ${allRecords.length} person records...`);
    
    const successes: SinglePushResult[] = [];
    const failures: SinglePushResult[] = [];
    
    // Process records in batches based on configuration
    const batchSize = this.config.integration.batchSize || 10;
    
    timer.start();

    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allRecords.length / batchSize)}`);
      
      // Process batch records
      for (const record of batch) {
        let crud: CrudOperation;
        
        // Determine CRUD operation based on which array the record came from
        if (added.includes(record)) {
          crud = CrudOperation.CREATE;
        } else if (updated.includes(record)) {
          crud = CrudOperation.UPDATE;
        } else {
          crud = CrudOperation.DELETE;
        }
        
        const result = await this.pushOne({ data: record, crud });
        
        if (result.status === Status.SUCCESS) {
          successes.push(result);
        } else {
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
    
    timer.logElapsed(`Batch push completed: ${successes.length} successes, ${failures.length} failures`);

    return {
      status: batchStatus,
      successes,
      failures,
      timestamp: new Date(),
      message: `Batch push completed: ${successes.length} successes, ${failures.length} failures`
    };
  }

  /**
   * Convert FieldSet to Huron API request format
   */
  private convertFieldSetToRequest(fieldSet: any, operation: CrudOperation): PersonPushRequest {
    // Determine the correct API path and method based on operation
    let path: SchemaPath;
    let method: Method;
    let data: any;
    
    switch (operation) {
      case CrudOperation.CREATE:
        path = SchemaPath.PERSONS;
        method = Method.POST;
        data = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        break;
      case CrudOperation.UPDATE:
        path = SchemaPath.PERSONS_BY_HRN;
        method = Method.PUT;
        data = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        break;
      case CrudOperation.DELETE:
        // DELETE: Implement as soft delete by setting active: false
        path = SchemaPath.PERSONS_BY_HRN;
        method = Method.PATCH;
        data = { active: false };
        break;
      default:
        throw new Error(`Unsupported CRUD operation: ${operation}`);
    }

    return { operation, data };
  }
}