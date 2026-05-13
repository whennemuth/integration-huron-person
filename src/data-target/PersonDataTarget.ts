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
import { ApiClientForJWT, EndpointConfigForJWT, ErrorEventDetails, TargetApiErrorEventProcessor } from './ApiClientForJWT';
import { HuronPerson } from './crud/Person';
import { ReadPerson } from './crud/ReadPerson';
import { HuronSchemaBroker, Method, SchemaPath } from './SchemaBroker';

/**
 * Request format for pushing person data to Huron API
 */
export interface PersonPushRequest {
  operation: 'create' | 'update' | 'delete';
  deleteType?: TargetPersonDeleteType;
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
  private hrn: string | undefined;
  private errorEventProcessor

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

    // Validate the record before attempting to push
    const validationFailure = this.getValidationFailure({ record: data, crud });
    if (validationFailure) {
      return validationFailure;
    }

    /**
     * Get all keys that could potentially identify a person record, and return those that are present.
     * @param data 
     * @returns 
     */
    const getPersonIdentifierInfo = (data: any): string => {
      const { hrn, id, userId, sourceIdentifier, employeeId } = data || {};
      const retvalObj = {
        hrn: hrn || undefined,
        id: id || undefined,
        userId: userId || undefined,
        sourceIdentifier: sourceIdentifier || undefined,
        employeeId: employeeId || undefined
      }
      return Object.values(retvalObj).find(v => v !== undefined) ?
        JSON.stringify(retvalObj) : 
        'unknown';
    };
    
    try {
      // Convert FieldSet to API request format
      const personRequest = HuronPersonDataTarget.convertFieldSetToRequest(data, crud);
      
      let response;
      let endpoint = this.config.dataTarget.personsPath;

      if( dryRun ) {
        console.log(`[DRY RUN] Would perform ${crud} operation on endpoint ${endpoint} with data:`, personRequest.data);
      }
      else {

        if (crud === CrudOperation.CREATE) {
          console.log(`Pushing single person record with CREATE operation:`, getPersonIdentifierInfo(personRequest.data));
          // CREATE: Use POST to /api/v2/persons
          this.apiClient.setErrorEventDetails({ message: 'Huron creation error', object: { 
            hrn: personRequest.data?.hrn,
            sourceIdentifier: personRequest.data?.sourceIdentifier 
          }});
          response = await this.apiClient.post<PersonPushResponse>(endpoint, personRequest.data);
        } else if (crud === CrudOperation.UPDATE) {
          // UPDATE: Use PATCH to /api/v2/persons/{hrn} if hrn is available
          console.log(`Pushing single person record with PATCH operation:`, getPersonIdentifierInfo(personRequest.data));
          if (personRequest.data?.hrn) {
            endpoint = `${endpoint}/${personRequest.data.hrn}`;
            // response = await this.apiClient.put<PersonPushResponse>(endpoint, personRequest.data);
            this.apiClient.setErrorEventDetails({ message: 'Huron patching error', object: { 
              hrn: personRequest.data?.hrn, 
              sourceIdentifier: personRequest.data?.sourceIdentifier 
            }});
            response = await this.apiClient.patch<PersonPushResponse>(endpoint, personRequest.data);
          } else {
            // Huron lookup feature not ready yet, so attempt to lookup HRN using sourceIdentifier or id from the fieldSet data
            const reader = new ReadPerson(this.config);
            const result:HuronPerson[] = await reader.readPersonByHailMary(personRequest.data?.sourceIdentifier);
            const hrn = result?.[0]?.hrn;
            if( ! hrn) {
              return {
                status: Status.FAILURE,
                message: `Cannot determine HRN for UPDATE operation for ${personRequest.data?.sourceIdentifier}`,
                timestamp: new Date(),
                primaryKey: data.fieldValues.filter((fv: any) => 'sourceIdentifier' in fv || 'id' in fv),
                crud
              };
            }

            // Perform the patch now that the hrn is known
            personRequest.data.hrn = hrn;
            endpoint = `${endpoint}/${hrn}`;
            this.apiClient.setErrorEventDetails({ message: 'Huron patching error', object: { 
              hrn, 
              sourceIdentifier: personRequest.data?.sourceIdentifier 
            }});
            response = await this.apiClient.patch<PersonPushResponse>(endpoint, personRequest.data);
          }
        } else if (crud === CrudOperation.DELETE) {
          console.log(`Soft deleting single person record with PATCH operation:`, getPersonIdentifierInfo(data));
          // DELETE: Implement as soft delete by setting active: false
          // Extract HRN from the original fieldSet data
          const hrn = data.fieldValues.find((fv: any) => fv.hrn)?.hrn;
          if (hrn) {
            const { SOFT, HARD, LOG, NONE } = TargetPersonDeleteType;
            const deleteType = personRequest.deleteType || SOFT; // Default to SOFT delete if not specified
            let patch = true;
            switch (deleteType) {
              case HARD:
                console.warn(`HARD delete requested for HRN ${hrn}. But only SOFT delete (deactivation) is allowed - deactivating instead.`);
                break;
              case LOG:
                console.log(`${hrn} not present anymore in source system. Logging this event but not deactivating in Huron as per configuration.`);
                patch = false;
                break;
              case NONE:
                patch = false;
                break;
            }
            if(patch) {
              endpoint = `${endpoint}/${hrn}`;
              // For soft delete, we only need to set active: false
              const softDeleteData = { hrn, active: false };
              this.apiClient.setErrorEventDetails({ message: 'Huron deletion error', object: { 
                hrn, 
                sourceIdentifier: data.fieldValues.find((fv: any) => fv.sourceIdentifier)?.sourceIdentifier 
              }});
              response = await this.apiClient.patch<PersonPushResponse>(endpoint, softDeleteData);
            }
          } else {
            const errorMsg = 'Cannot perform soft delete: no HRN available for person';
            console.error(`${errorMsg}:`, getPersonIdentifierInfo(data));
            return {
              status: Status.FAILURE,
              message: errorMsg,
              timestamp: new Date(),
              primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'sourceIdentifier' in fv),
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
      }
      
      const result = response?.data || { hrn: 'dryrun' };
      
      // API returns {hrn: string} on success
      return {
        status: Status.SUCCESS,
        message: `Successfully pushed person record: ${this.getResponseData(result)}`,
        timestamp: new Date(),
        primaryKey: [{ hrn: result.hrn }],
        crud
      };
    } catch (error) {
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

        const validationFailure = this.getValidationFailure({ record, crud });
        // Add to failures if validation fails. For deletes, we want to attempt the 
        // operation even if validation fails, to allow for soft-deletion of records 
        // that may no longer conform to the schema but still need to be deactivated 
        // in the target system
        if (validationFailure && crud !== DELETE) {
          // Check if this should be skipped rather than failed
          if (validationFailure.skipReason) {
            console.log(`⊘ Skipped ${crud}: ${validationFailure.skipReason}`);
            skipped.push(validationFailure);
          } else {
            failures.push(validationFailure);
          }
          continue;
        }
        
        const result = await this.pushOne({ data: record, crud });
        
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
  private getValidationFailure = (params: { record: FieldSet, crud: CrudOperation }): SinglePushResult | undefined => {
    const { record, crud } = params;
    const mappingValidator = new MappingValidator(record);
    if(crud === CrudOperation.CREATE && !mappingValidator.isValidForTarget()) {
      const pk = record.fieldValues.filter((fv: any) => 'id' in fv || 'hrn' in fv);
      const sourceIdentifier = record.fieldValues.find((fv: any) => 'sourceIdentifier' in fv)?.sourceIdentifier;
      const hrn = record.fieldValues.find((fv: any) => 'hrn' in fv)?.hrn;
      const skipReason = mappingValidator.getSkipReason();
      
      // Only log to DynamoDB if this is a genuine error (not a skip scenario)
      // Skip scenarios are expected/natural and shouldn't be tracked as errors
      if (!skipReason) {
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
      }

      return {
        status: Status.FAILURE,
        message: `Validation failed for record with primary key ${JSON.stringify(pk)}: ${mappingValidator.getViolations().join('; ')}`,
        timestamp: new Date(),
        primaryKey: pk,
        crud,
        skipReason // Pass through skip reason if present
      };
    }
    return undefined;
  }

  /**
   * Convert FieldSet to Huron API request format
   */
  public static convertFieldSetToRequest(fieldSet: any, operation: CrudOperation): PersonPushRequest {
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
        // method = Method.PUT;
        method = Method.PATCH;
        data = new HuronSchemaBroker({ path, method }).getConvertedFieldSet(fieldSet);
        // Remove userId for UPDATE operations - userId should never be changed
        if (data && 'userId' in data) {
          delete data.userId;
        }
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


