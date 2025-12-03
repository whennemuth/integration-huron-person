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
import { Config } from './Config';
import { Timer } from './Timer';

/**
 * Request format for pushing person data to Huron API
 */
export interface PersonPushRequest {
  operation: 'create' | 'update' | 'delete';
  data: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    department?: string;
    employeeId?: string;
    status?: 'active' | 'inactive' | 'terminated';
    hireDate?: string;
    // Add other fields as needed
  };
}

/**
 * Response format from Huron API for person operations
 */
export interface PersonPushResponse {
  success: boolean;
  id: string;
  message?: string;
  errors?: string[];
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
      
      console.log(`Pushing single person record with ${crud} operation:`, personRequest.data.id);
      
      const response = await this.apiClient.post<PersonPushResponse>(
        this.config.dataTarget.pushPersonsEndpoint,
        personRequest
      );

      const result = response.data;
      
      if (result.success) {
        return {
          status: Status.SUCCESS,
          timestamp: new Date(),
          primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv),
          crud
        };
      } else {
        return {
          status: Status.FAILURE,
          message: result.message || 'Push operation failed',
          timestamp: new Date(),
          primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv),
          crud
        };
      }
    } catch (error) {
      console.error(`Failed to push person record:`, error);
      return {
        status: Status.FAILURE,
        message: `API request failed: ${error}`,
        timestamp: new Date(),
        primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv),
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
  private convertFieldSetToRequest(fieldSet: any, operation: 'create' | 'update' | 'delete'): PersonPushRequest {
    const data: any = {};
    
    // Extract field values from FieldSet format
    if (fieldSet.fieldValues && Array.isArray(fieldSet.fieldValues)) {
      fieldSet.fieldValues.forEach((field: any) => {
        // Merge all fields from each field object into the data object
        Object.keys(field).forEach(key => {
          data[key] = field[key];
        });
      });
    }
    
    return {
      operation,
      data
    };
  }
}