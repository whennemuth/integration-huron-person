import {
  BatchPushResult,
  BatchStatus,
  CrudOperation,
  DataTarget,
  FieldSet,
  PushAllParms,
  PushOneParms,
  SinglePushResult,
  Status,
  Timer
} from 'integration-core';
import { Cache } from '../Cache';
import { Config, TargetPersonDeleteType } from '../config/Config';
import { MappingValidator } from '../data-mapper/MappingValidator';
import { deepClone } from '../Utils';
import { ApiClientForJWT, EndpointConfigForJWT, ErrorEventDetails, TargetApiErrorEventProcessor } from './ApiClientForJWT';
import { DeletePersonResult, HuronPersonDataTargetDelete } from './PersonDataTargetDelete';
import { HuronPersonDataTargetUpdate, UpdatePersonResult } from './PersonDataTargetUpdate';
import { HuronSchemaBroker, Method, SchemaPath } from './SchemaBroker';

/**
 * Request format for pushing person data to Huron API
 */
export interface PersonPushRequest {
  operation: 'create' | 'update' | 'delete';
  deleteType?: TargetPersonDeleteType;
  fullData?: any; // The complete data payload for the person record, used for validation and logging
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
  private static readonly PAYLOAD_INTERNAL_FIELD_ALLOWLIST = new Set(['__arrayFieldOperations']);

  private apiClient: ApiClientForJWT;
  private config: Config;
  private hrn: string | undefined;
  private errorEventProcessor: TargetApiErrorEventProcessor | undefined;
  private lastValidationResult: { result?: SinglePushResult | undefined, deactivate: boolean };

  constructor(params: { config: Config, cache?: Cache<string, string>, hrn?: string, errorEventProcessor?: TargetApiErrorEventProcessor }) {
  // constructor(config: Config, cache?: Cache<string, string>) {
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
   * Push a single person record to Huron API
   */
  async pushOne(params: PushOneParms): Promise<SinglePushResult> {
    const { data, crud } = params;
    const { DRY_RUN='false' } = process.env;
    const dryRun = DRY_RUN.toLowerCase().trim() === 'true';
    const { CREATE, UPDATE, DELETE } = CrudOperation;

    // Validate the record before attempting to push
    this.lastValidationResult = this.getValidationFailure({ record: data, crud }) ?? {};
    const { result:failure, deactivate } = this.lastValidationResult;
    // CREATE validation failures (including skip/deactivate scenarios) must not proceed to API calls.
    if (failure && crud === CREATE) {
      const action = deactivate ? 'Skipped' : 'Cancelled';
      console.log(`⊘ ${action} ${crud}: ${failure.skipReason}`);
      return failure;
    }

    // UPDATE validation failures only short-circuit when they are not deactivation scenarios.
    if (failure && crud === UPDATE && !deactivate) {
      console.log(`⊘ Cancelled ${crud}: ${failure.skipReason}`);
      return failure;
    }

    try {
      // Convert FieldSet to API request format
      const personRequest = HuronPersonDataTarget.convertFieldSetToRequest(data, crud);
      
      let response;
      let endpoint = this.config.dataTarget.personsPath;
      let _hrn: string | undefined;

      if( dryRun ) {
        console.log(`[DRY RUN] Would perform ${crud} operation on endpoint ${endpoint} with data:`, personRequest.data);
      }
      else {
        let retval: UpdatePersonResult | DeletePersonResult | undefined;

        const createPerson = async () => {
          console.log(`Pushing single person record with CREATE operation:`, getPersonIdentifierInfo(personRequest.data));
          // CREATE: Use POST to /api/v2/persons
          this.apiClient.setErrorEventDetails({ message: 'Huron creation error', object: { 
            hrn: personRequest.data?.hrn,
            sourceIdentifier: personRequest.data?.sourceIdentifier 
          }});
          response = await this.apiClient.post<PersonPushResponse>(endpoint, personRequest.data);
          retval = { response };          
        }

        const updatePerson = async () => {
          const updater = new HuronPersonDataTargetUpdate({
            config: this.config, apiClient: this.apiClient, pushOneParms: params 
          });
          retval = await updater.updatePerson();
          _hrn = updater.hrn();
        }

        const deactivatePerson = async () => {
          const deleter = new HuronPersonDataTargetDelete({
            config: this.config, apiClient: this.apiClient, pushOneParms: params 
          });
          retval = await deleter.deletePerson();
          _hrn = deleter.hrn();
        }

        switch(crud) {

          case CREATE:
            await createPerson();
            break;

          case UPDATE:
            if(deactivate) {
              await deactivatePerson();
            }
            else {
              await updatePerson();
            }
            break;

          case DELETE:
            await deactivatePerson();
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
        message: `Successfully pushed person record: ${this.getResponseData(result)}`,
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
   * Push multiple person records to Huron API in batch
   */
  async pushAll(params: PushAllParms): Promise<BatchPushResult> {
    const { added = [], updated = [], removed = [] } = params;
    const allRecords = [...added, ...updated, ...removed];
    const timer = new Timer();
    
    console.log(`Starting batch push of ${allRecords.length} person records...`);
    
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
        const { result: failure, deactivate } = this.lastValidationResult || {};

        /**
         * Add to failures if validation fails. For deletes, we want to attempt the
         * operation even if validation fails, to allow for soft-deletion of records
         * that may no longer conform to the schema but still need to be deactivated
         * in the target system
         */
        if(failure && crud === UPDATE && !deactivate) {
          failures.push(failure);
          continue;
        }
        if(failure && crud === CREATE && !deactivate) {
          failures.push(failure);
          continue;
        }
        if(deactivate && crud === CREATE) {
          skipped.push(failure!);
          continue;
        }

        if (result.status === Status.SUCCESS) {
          console.log(`✓ Successfull ${crud} for: ${JSON.stringify(result)}`);
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
   * The prospective CRUD operation cannot be carried out with a record that would cause the
   * Huron API to reject the request due to validation errors. In this case, we preemptively 
   * fail the push of this record and log the validation violations AS IF the API had 
   * rejected the request.
   * @param params 
   * @returns 
   */
  private getValidationFailure = (params: { record: FieldSet, crud: CrudOperation }): { result?: SinglePushResult | undefined, deactivate: boolean } => {
    const { record, crud } = params;
    const mappingValidator = new MappingValidator(record);
    let deactivate: boolean = false;

    if(!mappingValidator.isValidForTarget()) {
      const shouldValidate = crud === CrudOperation.CREATE || crud === CrudOperation.UPDATE;
      if(!shouldValidate) {
        return { deactivate };
      }

      const pk = record.fieldValues.filter((fv: any) => 'id' in fv || 'hrn' in fv);
      const sourceIdentifier = record.fieldValues.find((fv: any) => 'sourceIdentifier' in fv)?.sourceIdentifier;
      const hrn = record.fieldValues.find((fv: any) => 'hrn' in fv)?.hrn;
      const skipReason = mappingValidator.getSkipReason();
      
      // Only log to DynamoDB if this is a genuine error (not a skip scenario)
      // Skip scenarios are expected/natural and shouldn't be tracked as errors
      if (skipReason) {
        deactivate = skipReason.toUpperCase().startsWith('DEACTIVATE');

        // UPDATE validation should only convert to deactivation for explicit DEACTIVATE reasons.
        // For non-deactivate UPDATE violations, allow update flow to continue (partial PATCH semantics).
        if (crud === CrudOperation.UPDATE && !deactivate) {
          return { deactivate: false };
        }
      }
      else if (crud === CrudOperation.UPDATE) {
        // UPDATEs may legitimately be partial and fail CREATE-level validation checks.
        // Do not block UPDATE unless there is an explicit deactivation reason.
        return { deactivate: false };
      }

      if (crud === CrudOperation.UPDATE && deactivate) {
        return {
          result: {
            status: Status.FAILURE,
            message: `Validation indicates UPDATE should be deactivated for primary key ${JSON.stringify(pk)}: ${mappingValidator.getViolations().join('; ')}`,
            timestamp: new Date(),
            primaryKey: pk,
            crud,
            skipReason
          },
          deactivate
        };
      }

      if (crud === CrudOperation.CREATE && skipReason) {
        return {
          result: {
            status: Status.FAILURE,
            message: `Validation skipped CREATE for record with primary key ${JSON.stringify(pk)}: ${mappingValidator.getViolations().join('; ')}`,
            timestamp: new Date(),
            primaryKey: pk,
            crud,
            skipReason
          },
          deactivate
        };
      }

      if (crud === CrudOperation.CREATE) {
        // Log the validation error only for genuine failures (not skips)
        const errMsg = `✗ ${crud} cancelled!`;
        const info = {
          primaryKey: pk,
          reason: '✗ Validation failed',
          violations: mappingValidator.getViolations()
        }
        console.error(`${errMsg}: ${JSON.stringify(info)}`);
        
        // Simulate a 400 Bad Request error structure that matches what ApiErrorTracking expects
        const simulatedError = {
          message: errMsg,
          response: {
            status: 400,
            statusText: 'Bad Request',
            data: {
              errors: [
                {
                  status: 400,
                  internalErrorMessage: mappingValidator.getViolations().join('; '),
                  incidentId: `VALIDATION-${sourceIdentifier || hrn || 'UNKNOWN'}`,
                  detail: mappingValidator.getViolations()
                }
              ]
            }
          }
        };

        const errorDetails: ErrorEventDetails = {
          message: `Huron ${crud.toUpperCase()} error: ${mappingValidator.getViolations().join('; ')}`,
          object: { 
            hrn, 
            sourceIdentifier 
          }
        };

        // Process the simulated error through errorEventProcessor (logs to console and DynamoDB)
        this.errorEventProcessor?.process(simulatedError, errorDetails);

        return {
          result: {
            status: Status.FAILURE,
            message: `Validation failed for record with primary key ${JSON.stringify(pk)}: ${mappingValidator.getViolations().join('; ')}`,
            timestamp: new Date(),
            primaryKey: pk,
            crud,
            skipReason
          },
          deactivate
        };
      }

      return { deactivate: false };
    }

    return { deactivate };
  }

  /**
   * Convert FieldSet to Huron API request format
   */
  private static stripInternalFields(payload: any): any {
    if (Array.isArray(payload)) {
      return payload.map(item => HuronPersonDataTarget.stripInternalFields(item));
    }

    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    return Object.entries(payload).reduce((acc: any, [key, value]) => {
      if (
        key.startsWith('__') &&
        !HuronPersonDataTarget.PAYLOAD_INTERNAL_FIELD_ALLOWLIST.has(key)
      ) {
        return acc;
      }
      acc[key] = HuronPersonDataTarget.stripInternalFields(value);
      return acc;
    }, {});
  }

  public static convertFieldSetToRequest(fieldSet: any, operation: CrudOperation): PersonPushRequest {
    // Determine the correct API path and method based on operation
    let path: SchemaPath;
    let method: Method;
    let data: any;
    let fullData: any;
    
    switch (operation) {
      case CrudOperation.CREATE:
        path = SchemaPath.PERSONS;
        method = Method.POST;
        data = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        fullData = deepClone(data);
        break;
      case CrudOperation.UPDATE:
        path = SchemaPath.PERSONS_BY_HRN;
        // method = Method.PUT;
        method = Method.PATCH;
        data = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        fullData = deepClone(data);
        // Remove userId for UPDATE operations - userId should never be changed
        if (data && 'userId' in data) {
          delete data.userId;
        }
        // For reactivation: extract __active flag and explicitly set active=true in the request
        // This ensures that reactivating a person explicitly sets the person to active status
        const activeField = fieldSet.fieldValues.find((fv: any) => '__active' in fv);
        if (activeField && '__active' in activeField && activeField.__active === true) {
          data.active = true;
        }
        break;
      case CrudOperation.DELETE:
        // DELETE: Implement as soft delete by setting active: false
        path = SchemaPath.PERSONS_BY_HRN;
        method = Method.PATCH;
        data = { active: false };
        fullData = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        break;
      default:
        throw new Error(`Unsupported CRUD operation: ${operation}`);
    }

    data = HuronPersonDataTarget.stripInternalFields(data);

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
 * Get all keys that could potentially identify a person record, and return those that are present.
 * @param data 
 * @returns 
 */
export const getPersonIdentifierInfo = (data: any): string => {
  const { hrn, id, userId, sourceIdentifier, employeeId } = data || {};
  const retvalObj = {
    hrn: hrn || undefined,
    id: id || undefined,
    userId: userId || undefined,
    sourceIdentifier: sourceIdentifier || undefined,
    employeeId: employeeId || undefined,
    active: 'active' in data ? data.active : undefined
  }
  return Object.values(retvalObj).find(v => v !== undefined) ?
    JSON.stringify(retvalObj) : 
    'unknown';
};

