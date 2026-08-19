import {
  CrudOperation,
  DataTarget,
  FieldSet,
  PushOneParms,
  SinglePushResult,
  Status,
} from 'integration-core';
import { Config } from '../config/Config';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * Mock DataTarget implementation for testing with source simulator.
 * 
 * Purpose:
 * Simulates target system behavior by storing person records in DynamoDB instead of calling real API.
 * This allows full end-to-end testing with SourceSimulator without affecting production data.
 * 
 * Design:
 * - Writes to MockTargetStateTable (PK: personId)
 * - One record per person (overwrites on update)
 * - Supports CREATE, UPDATE, DELETE operations
 * - Records timestamps and sync run tracking
 * 
 * Configuration:
 * Enabled via flags.useMockTarget in chunk metadata. When true, processors use this
 * target instead of HuronPersonDataTarget.
 * 
 * Usage Pattern:
 * ```typescript
 * const factory = new DataTargetFactory(config, flags);
 * const target = factory.create(); // Returns MockDataTarget when flags.useMockTarget is true
 * await target.pushOne({ data: personRecord, crud: CrudOperation.CREATE });
 * ```
 */
export class MockDataTarget implements DataTarget {
  public readonly name = 'Mock Data Target (DynamoDB)';
  public readonly description = 'Simulates target system by storing person records in DynamoDB';

  private dynamoDbClient: DynamoDBClient;
  private tableName: string;
  private syncRunId: string;
  private validateOnly: boolean;

  constructor(params: { 
    config: Config;
    tableName?: string;
    syncRunId?: string;
    validateOnly?: boolean;
  }) {
    const { config, tableName, syncRunId, validateOnly = false } = params;
    
    this.tableName = tableName || process.env.DYNAMODB_MOCK_TARGET_STATE_TABLE_NAME || '';
    if (!this.tableName) {
      throw new Error('MockDataTarget requires tableName or DYNAMODB_MOCK_TARGET_STATE_TABLE_NAME environment variable');
    }

    this.syncRunId = syncRunId || new Date().toISOString();
    this.validateOnly = validateOnly;

    // Get region from storage config (type narrowing for S3/DynamoDB configs)
    let region = process.env.REGION || 'us-east-1';
    if (config.storage.type === 's3') {
      region = (config.storage.config as any).region || region;
    } else if (config.storage.type === 'dynamodb') {
      region = (config.storage.config as any).region || region;
    }
    
    this.dynamoDbClient = new DynamoDBClient({ region });
  }

  /**
   * Extract person ID from record
   */
  private getPersonId(data: FieldSet): string {
    // FieldSet.fieldValues is an array of Field objects (key-value pairs)
    const idField = data.fieldValues.find(field => 
      field.buid !== undefined || 
      field.personId !== undefined || 
      field.BUID !== undefined ||
      field.id !== undefined
    );
    
    if (!idField) {
      throw new Error('Cannot find person ID in record. Expected field: buid, personId, BUID, or id');
    }

    // Extract the ID value
    const id = idField.buid || idField.personId || idField.BUID || idField.id;
    return String(id);
  }

  /**
   * Convert FieldSet to object for DynamoDB storage
   */
  private fieldSetToObject(data: FieldSet): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const field of data.fieldValues) {
      // Each field is an object with arbitrary key-value pairs
      Object.assign(obj, field);
    }
    return obj;
  }

  /**
   * Push a single person record to mock target (DynamoDB)
   */
  async pushOne(params: PushOneParms): Promise<SinglePushResult> {
    const { data, crud } = params;
    const personId = this.getPersonId(data);

    const primaryKey = [{ personId }];
    
    // In validateOnly mode, log the operation but don't execute it
    if (this.validateOnly) {
      console.log(`[MOCK-TARGET:VALIDATE] ${crud} operation for person ${personId} (not executed)`);
      return {
        status: Status.SUCCESS,
        primaryKey,
        message: `Validation only - ${crud} operation not executed`,
        timestamp: new Date(),
      };
    }

    try {
      switch (crud) {
        case CrudOperation.CREATE:
          return await this.handleCreate(personId, data, primaryKey);
        
        case CrudOperation.UPDATE:
          return await this.handleUpdate(personId, data, primaryKey);
        
        case CrudOperation.DELETE:
          return await this.handleDelete(personId, primaryKey);
        
        default:
          throw new Error(`Unsupported CRUD operation: ${crud}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MOCK-TARGET:ERROR] ${crud} failed for person ${personId}:`, errorMessage);
      
      return {
        status: Status.FAILURE,
        primaryKey,
        message: `Mock target ${crud} failed: ${errorMessage}`,
        timestamp: new Date(),
        crud,
      };
    }
  }

  /**
   * Handle CREATE operation - insert new person record
   */
  private async handleCreate(
    personId: string, 
    data: FieldSet, 
    primaryKey: any[]
  ): Promise<SinglePushResult> {
    const timestamp = new Date().toISOString();
    const recordData = this.fieldSetToObject(data);

    const item = {
      personId,
      data: recordData,
      createdAt: timestamp,
      lastModified: timestamp,
      syncRunId: this.syncRunId,
    };

    await this.dynamoDbClient.send(new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(item),
    }));

    console.log(`[MOCK-TARGET:CREATE] ✓ Created person ${personId}`);

    return {
      status: Status.SUCCESS,
      primaryKey,
      message: `Successfully created person ${personId} in mock target`,
      timestamp: new Date(),
      crud: CrudOperation.CREATE,
    };
  }

  /**
   * Handle UPDATE operation - update existing person record
   */
  private async handleUpdate(
    personId: string, 
    data: FieldSet, 
    primaryKey: any[]
  ): Promise<SinglePushResult> {
    // Check if record exists
    const getResult = await this.dynamoDbClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ personId }),
    }));

    if (!getResult.Item) {
      console.warn(`[MOCK-TARGET:UPDATE] ⚠ Person ${personId} not found, treating as CREATE`);
      return await this.handleCreate(personId, data, primaryKey);
    }

    const existingItem = unmarshall(getResult.Item);
    const timestamp = new Date().toISOString();
    const recordData = this.fieldSetToObject(data);

    const item = {
      personId,
      data: recordData,
      createdAt: existingItem.createdAt || timestamp,
      lastModified: timestamp,
      syncRunId: this.syncRunId,
    };

    await this.dynamoDbClient.send(new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(item),
    }));

    console.log(`[MOCK-TARGET:UPDATE] ✓ Updated person ${personId}`);

    return {
      status: Status.SUCCESS,
      primaryKey,
      message: `Successfully updated person ${personId} in mock target`,
      timestamp: new Date(),
      crud: CrudOperation.UPDATE,
    };
  }

  /**
   * Handle DELETE operation - remove person record
   */
  private async handleDelete(
    personId: string, 
    primaryKey: any[]
  ): Promise<SinglePushResult> {
    await this.dynamoDbClient.send(new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ personId }),
    }));

    console.log(`[MOCK-TARGET:DELETE] ✓ Deleted person ${personId}`);

    return {
      status: Status.SUCCESS,
      primaryKey,
      message: `Successfully deleted person ${personId} from mock target`,
      timestamp: new Date(),
      crud: CrudOperation.DELETE,
    };
  }
}
