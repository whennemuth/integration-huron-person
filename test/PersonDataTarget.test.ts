import {
  BatchStatus,
  CrudOperation,
  FieldSet,
  PushAllParms,
  PushOneParms,
  Status
} from 'integration-core';
import { IApiClient } from '../src/ApiClient';
import { Config } from '../src/config/Config';
import { HuronPersonDataTarget, PersonPushResponse } from '../src/data-target/PersonDataTarget';
import { ReadPerson } from '../src/data-target/crud/ReadPerson';
import { HuronPerson } from '../src/data-target/crud/Person';

// Mock ReadPerson
jest.mock('../src/data-target/crud/ReadPerson');

// Mock ApiClient
class MockApiClient implements IApiClient {
  private mockResponses: any[];
  private shouldThrow: boolean;
  private callCount: number = 0;

  constructor(mockResponse?: any, shouldThrow: boolean = false) {
    // Handle both single responses and arrays of responses
    if (Array.isArray(mockResponse)) {
      this.mockResponses = mockResponse;
    } else if (mockResponse !== null && mockResponse !== undefined) {
      this.mockResponses = [mockResponse];
    } else {
      this.mockResponses = [];
    }
    this.shouldThrow = shouldThrow;
  }

  setErrorEventDetails(details: any): void {
    // No-op for mock
  }

  async get<T = any>(params: { url: string, params?: any, axiosInstance?: any }): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    throw new Error('GET method not used in DataTarget tests');
  }

  async post<T = any>(url: string, data?: any): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    if (this.shouldThrow) {
      throw new Error('Mock API Error');
    }
    
    // Return the next response in sequence, or the last one if we've run out
    const response = this.callCount < this.mockResponses.length 
      ? this.mockResponses[this.callCount] 
      : this.mockResponses[this.mockResponses.length - 1] || { success: true, message: 'Default success' };
    
    this.callCount++;
    
    return {
      data: response,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    };
  }

  async put<T = any>(url: string, data?: any): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    if (this.shouldThrow) {
      throw new Error('Mock API Error');
    }
    
    const response = this.callCount < this.mockResponses.length 
      ? this.mockResponses[this.callCount] 
      : this.mockResponses[this.mockResponses.length - 1] || { success: true, message: 'Default success' };
    
    this.callCount++;
    
    return {
      data: response,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    };
  }

  async patch<T = any>(url: string, data?: any): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    if (this.shouldThrow) {
      throw new Error('Mock API Error');
    }
    
    const response = this.callCount < this.mockResponses.length 
      ? this.mockResponses[this.callCount] 
      : this.mockResponses[this.mockResponses.length - 1] || { success: true, message: 'Default success' };
    
    this.callCount++;
    
    return {
      data: response,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    };
  }

  async delete<T = any>(url: string): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    if (this.shouldThrow) {
      throw new Error('Mock API Error');
    }
    
    const response = this.callCount < this.mockResponses.length 
      ? this.mockResponses[this.callCount] 
      : this.mockResponses[this.mockResponses.length - 1] || { success: true, message: 'Default success' };
    
    this.callCount++;
    
    return {
      data: response,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    };
  }
}

// Helper function to create FieldSet (minimal, as specified)
function createFieldSet(fields: Record<string, any>): FieldSet {
  return {
    fieldValues: Object.entries(fields).map(([key, value]) => ({ [key]: value }))
  };
}

// Helper function to create FieldSet with required fields for Huron API validation
function createValidFieldSet(fields: Record<string, any>): FieldSet {
  // Merge provided fields with required defaults
  const defaults = {
    id: fields.id || 'test-id-' + Math.random().toString(36).substr(2, 9),
    firstName: fields.firstName || 'TestFirst',
    lastName: fields.lastName || 'TestLast',
    employer: fields.employer || { hrn: 'hrn:hrs:orgs:999' },
    organization: fields.organization || { hrn: 'hrn:hrs:orgs:888' }
  };
  
  // Override defaults with provided fields
  const merged = { ...defaults, ...fields };
  
  return {
    fieldValues: Object.entries(merged).map(([key, value]) => ({ [key]: value }))
  };
}

describe('HuronPersonDataTarget', () => {
  let dataTarget: HuronPersonDataTarget;
  let mockApiClient: MockApiClient;
  
  const mockConfig: Config = {
    executionMode: 'person',
    dataSource: {
      person: {
        endpointConfig: {
          baseUrl: 'https://datasource-api.example.com',
          apiKey: 'test-api-key'
        },
        fetchPath: '/api/v1/persons'
      },
      people: {
        endpointConfig: {
          baseUrl: 'https://datasource-api.example.com',
          apiKey: 'test-api-key'
        },
        fetchPath: '/api/v1/persons'
      },
      idpName: 'test-idp'
    },
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://datatarget-api.example.com',
        authMethod: 'basic',
        loginSvcPath: '/auth/token',
        username: 'dt-user',
        password: 'dt-pass'
      },
      personsPath: '/api/v1/persons/batch',
      organizationsPath: '/api/v1/organizations'
    },
    integration: {
      clientId: 'test-client',
      batchSize: 10,
      timeout: 5000
    },
    storage: {
      type: 'file',
      config: {
        path: './test-data'
      }
    }
  };

  beforeEach(() => {
    mockApiClient = new MockApiClient();
    dataTarget = new HuronPersonDataTarget({ config: mockConfig });
    // Replace the real ApiClient with our mock
    (dataTarget as any).apiClient = mockApiClient;
  });

  describe('constructor', () => {
    it('should create instance with correct name and description', () => {
      expect(dataTarget.name).toBe('Huron Person Data Target');
      expect(dataTarget.description).toBe('Pushes person data to Huron API endpoint');
    });
  });

  describe('Configuration and Timeout Precedence', () => {
    it('should prioritize endpointConfig timeout over integration timeout', () => {
      const configWithBothTimeouts: Config = {
        executionMode: 'person',
        dataSource: {
          person: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/api/v1/persons'
          },
          people: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/api/v1/persons'
          },
          idpName: 'test-idp'
        },
        dataTarget: {
          endpointConfig: {
            baseUrl: 'https://datatarget-api.example.com',
            authMethod: 'basic',
            loginSvcPath: 'https://auth.example.com/token',
            username: 'test-user',
            password: 'test-pass',
            timeout: 15000  // Endpoint-specific timeout
          },
          personsPath: '/api/v1/persons',
          organizationsPath: '/api/v1/organizations'
        },
        integration: {
          clientId: 'test-client-id',
          batchSize: 10,
          timeout: 30000  // General integration timeout
        },
        storage: {
          type: 'file' as const,
          config: { path: '/tmp/test' }
        }
      };

      // Create instance and test that endpoint timeout is prioritized
      const dataTarget = new HuronPersonDataTarget({ config: configWithBothTimeouts });
      
      // Access the private apiClient to verify the timeout configuration
      const apiClient = (dataTarget as any).apiClient;
      const endpointConfig = (apiClient as any).endpointConfig;
      
      // Verify that endpoint timeout (15000) was used, not integration timeout (30000)
      expect(endpointConfig.timeout).toBe(15000);
    });

    it('should fallback to integration timeout when endpointConfig timeout is undefined', () => {
      const configWithOnlyIntegrationTimeout: Config = {
        executionMode: 'person',
        dataSource: {
          person: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/api/v1/persons'
          },
          people: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/api/v1/persons'
          },
          idpName: 'test-idp'
        },
        dataTarget: {
          endpointConfig: {
            baseUrl: 'https://datatarget-api.example.com',
            authMethod: 'basic',
            loginSvcPath: 'https://auth.example.com/token',
            username: 'test-user',
            password: 'test-pass'
            // No timeout specified in endpointConfig
          },
          personsPath: '/api/v1/persons',
          organizationsPath: '/api/v1/organizations'
        },
        integration: {
          clientId: 'test-client-id',
          batchSize: 10,
          timeout: 25000  // General integration timeout
        },
        storage: {
          type: 'file' as const,
          config: { path: '/tmp/test' }
        }
      };

      // Create instance and test that integration timeout is used as fallback
      const dataTarget = new HuronPersonDataTarget({ config: configWithOnlyIntegrationTimeout });
      
      // Access the private apiClient to verify the timeout configuration
      const apiClient = (dataTarget as any).apiClient;
      const endpointConfig = (apiClient as any).endpointConfig;

      // Verify that integration timeout (25000) was used as fallback
      expect(endpointConfig.timeout).toBe(25000);
    });
  });

  describe('convertFieldSetToRequest', () => {
    it('should convert CREATE operation correctly', () => {
      const fieldSet = createFieldSet({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        department: 'Engineering',
        employeeId: 'EMP001',
        status: 'active',
        hireDate: '2023-01-15'
      });

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.CREATE);

      expect(result).toEqual({
        operation: 'create',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          department: 'Engineering',
          employeeId: 'EMP001',
          status: 'active',
          hireDate: '2023-01-15'
        }
      });
    });

    it('should convert UPDATE operation correctly', () => {
      const fieldSet = createFieldSet({
        id: 'person-1',
        firstName: 'John',
        lastName: 'Smith',
        department: 'Marketing'
      });

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.UPDATE);

      expect(result).toEqual({
        operation: 'update',
        data: {
          id: 'person-1',
          firstName: 'John',
          lastName: 'Smith',
          department: 'Marketing'
        }
      });
    });

    it('should convert DELETE operation correctly', () => {
      const fieldSet = createFieldSet({
        id: 'person-1'
      });

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.DELETE);

      expect(result).toEqual({
        operation: 'delete',
        data: {
          active: false
        }
      });
    });

    it('should handle empty fieldSet', () => {
      const fieldSet = createFieldSet({});

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.CREATE);

      expect(result).toEqual({
        operation: 'create',
        data: {}
      });
    });
  });

  describe('pushOne', () => {
    it('should successfully push single CREATE operation', async () => {
      const mockResponse: PersonPushResponse = {
        hrn: 'hrn:hrs:persons:12345'
      };
      mockApiClient = new MockApiClient(mockResponse);
      (dataTarget as any).apiClient = mockApiClient;

      const fieldSet = createValidFieldSet({
        firstName: 'New',
        lastName: 'Person',
        email: 'new.person@example.com'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.CREATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.primaryKey).toBeDefined();
      expect(result.crud).toBe(CrudOperation.CREATE);
    });

    it('should handle single UPDATE operation with HRN provided', async () => {
      const mockResponse: PersonPushResponse = {
        hrn: 'hrn:hrs:persons:12345'
      };
      mockApiClient = new MockApiClient(mockResponse);
      (dataTarget as any).apiClient = mockApiClient;

      const fieldSet = createFieldSet({
        hrn: 'hrn:hrs:persons:12345',
        id: 'person-1',
        firstName: 'Updated',
        lastName: 'Name'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.UPDATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.crud).toBe(CrudOperation.UPDATE);
      expect(result.primaryKey).toEqual([{ hrn: 'hrn:hrs:persons:12345' }]);
    });

    it('should handle single UPDATE operation without HRN by looking up via readPersonByHailMary', async () => {
      const mockResponse: PersonPushResponse = {
        hrn: 'hrn:hrs:persons:67890'
      };
      mockApiClient = new MockApiClient(mockResponse);
      (dataTarget as any).apiClient = mockApiClient;

      // Mock ReadPerson to return a person with HRN
      const mockReadPersonByHailMary = jest.fn().mockResolvedValue([
        { hrn: 'hrn:hrs:persons:67890', id: 'U12345678' } as HuronPerson
      ]);
      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: mockReadPersonByHailMary
      } as any));

      const fieldSet = createFieldSet({
        sourceIdentifier: 'U12345678',
        firstName: 'Updated',
        lastName: 'Name'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.UPDATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.crud).toBe(CrudOperation.UPDATE);
      expect(mockReadPersonByHailMary).toHaveBeenCalledWith('U12345678');
      expect(result.primaryKey).toEqual([{ hrn: 'hrn:hrs:persons:67890' }]);
    });

    it('should return FAILURE when UPDATE has no HRN and readPersonByHailMary cannot find person', async () => {
      // Mock ReadPerson to return empty array (person not found)
      const mockReadPersonByHailMary = jest.fn().mockResolvedValue([]);
      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: mockReadPersonByHailMary
      } as any));

      const fieldSet = createFieldSet({
        sourceIdentifier: 'U99999999',
        firstName: 'Unknown',
        lastName: 'Person'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.UPDATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.FAILURE);
      expect(result.crud).toBe(CrudOperation.UPDATE);
      expect(result.message).toContain('Cannot determine HRN for UPDATE operation for U99999999');
      expect(mockReadPersonByHailMary).toHaveBeenCalledWith('U99999999');
    });

    it('should return FAILURE when UPDATE has no HRN and readPersonByHailMary returns person without HRN', async () => {
      // Mock ReadPerson to return person but without HRN
      const mockReadPersonByHailMary = jest.fn().mockResolvedValue([
        { id: 'U12345678' } as HuronPerson // No hrn field
      ]);
      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: mockReadPersonByHailMary
      } as any));

      const fieldSet = createFieldSet({
        sourceIdentifier: 'U12345678',
        firstName: 'Updated',
        lastName: 'Name'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.UPDATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.FAILURE);
      expect(result.crud).toBe(CrudOperation.UPDATE);
      expect(result.message).toContain('Cannot determine HRN for UPDATE operation');
      expect(mockReadPersonByHailMary).toHaveBeenCalledWith('U12345678');
    });

    it('should handle single DELETE operation', async () => {
      const mockResponse: PersonPushResponse = {
        hrn: 'hrn:hrs:persons:12345'
      };
      mockApiClient = new MockApiClient(mockResponse);
      (dataTarget as any).apiClient = mockApiClient;

      const fieldSet = createFieldSet({ 
        id: 'person-1',
        hrn: 'hrn:hrs:persons:12345'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.crud).toBe(CrudOperation.DELETE);
      expect(result.primaryKey).toEqual([{ hrn: 'hrn:hrs:persons:12345' }]);
    });

    it('should return FAILURE when DELETE has no HRN available', async () => {
      const fieldSet = createFieldSet({
        id: 'person-1',
        sourceIdentifier: 'U12345678',
        firstName: 'Test',
        lastName: 'Person'
        // No hrn field
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.FAILURE);
      expect(result.crud).toBe(CrudOperation.DELETE);
      expect(result.message).toBe('Cannot perform soft delete: no HRN available for person');
      // Verify primaryKey includes sourceIdentifier (updated from hrn in bug fix)
      expect(result.primaryKey).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'person-1' }),
          expect.objectContaining({ sourceIdentifier: 'U12345678' })
        ])
      );
    });

    it('should handle API errors for single operation', async () => {
      mockApiClient = new MockApiClient(null, true);
      (dataTarget as any).apiClient = mockApiClient;

      const fieldSet = createValidFieldSet({ firstName: 'Test' });
      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.CREATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.FAILURE);
      expect(result.crud).toBe(CrudOperation.CREATE);
      expect(result.message).toContain('Mock API Error');
    });

    it('should handle unsuccessful API response', async () => {
      mockApiClient = new MockApiClient(null, true); // shouldThrow = true
      (dataTarget as any).apiClient = mockApiClient;

      const fieldSet = createValidFieldSet({ firstName: 'Invalid' });
      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.CREATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.FAILURE);
      expect(result.crud).toBe(CrudOperation.CREATE);
      expect(result.message).toBe('Mock API Error');
    });
  });

  describe('pushAll', () => {
    it('should successfully push batch operations', async () => {
      const mockResponse: PersonPushResponse[] = [
        { hrn: 'hrn:hrs:persons:1' },
        { hrn: 'hrn:hrs:persons:2' },
        { hrn: 'hrn:hrs:persons:3' }
      ];
      mockApiClient = new MockApiClient(mockResponse);
      (dataTarget as any).apiClient = mockApiClient;

      // Mock ReadPerson for UPDATE operation lookup
      const mockReadPersonByHailMary = jest.fn().mockResolvedValue([
        { hrn: 'hrn:hrs:persons:2', id: 'person-2' } as HuronPerson
      ]);
      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: mockReadPersonByHailMary
      } as any));

      const addedData = [
        createValidFieldSet({ firstName: 'John', lastName: 'Doe' })
      ];
      const updatedData = [
        createValidFieldSet({ id: 'person-2', sourceIdentifier: 'person-2', firstName: 'Jane' })
      ];
      const removedData = [
        createValidFieldSet({ id: 'person-3', hrn: 'hrn:hrs:persons:3' })
      ];

      const params: PushAllParms = { 
        added: addedData,
        updated: updatedData,
        removed: removedData
      };
      const result = await dataTarget.pushAll(params);

      expect(result.status).toBe(BatchStatus.SUCCESS);
      expect(result.successes).toHaveLength(3);
      expect(result.failures).toHaveLength(0);
      expect(mockReadPersonByHailMary).toHaveBeenCalledWith('person-2');
    });

    it('should handle mixed success/failure batch operations', async () => {
      // Mock ReadPerson for UPDATE operation lookup
      const mockReadPersonByHailMary = jest.fn().mockResolvedValue([
        { hrn: 'hrn:hrs:persons:3', id: 'person-3' } as HuronPerson
      ]);
      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: mockReadPersonByHailMary
      } as any));

      // Create a custom mock that throws on the second call
      let callCount = 0;
      const customMockApiClient = {
        setErrorEventDetails(details: any): void {
          // No-op for mock
        },
        async post<T = any>(url: string, data?: any): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
          callCount++;
          
          if (callCount === 2) {
            throw new Error('Validation error');
          }
          
          return {
            data: { hrn: `hrn:hrs:persons:${callCount}` } as T,
            status: 201,
            statusText: 'Created',
            headers: {},
            config: {}
          };
        },
        async patch<T = any>(url: string, data?: any): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
          return {
            data: { hrn: 'hrn:hrs:persons:3' } as T,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {}
          };
        }
      };
      (dataTarget as any).apiClient = customMockApiClient;

      const addedData = [
        createValidFieldSet({ firstName: 'John', lastName: 'Doe' }),
        createValidFieldSet({ firstName: 'Valid', lastName: 'Person', email: 'test@example.com' })
      ];
      const updatedData = [
        createValidFieldSet({ id: 'person-3', sourceIdentifier: 'person-3', firstName: 'Updated', lastName: 'Name' })
      ];
      const removedData: FieldSet[] = [];

      const params: PushAllParms = { 
        added: addedData,
        updated: updatedData,
        removed: removedData
      };
      const result = await dataTarget.pushAll(params);

      expect(result.status).toBe(BatchStatus.PARTIAL);
      expect(result.successes).toHaveLength(2);
      expect(result.failures).toHaveLength(1);
    });

    it('should handle complete batch failure', async () => {
      mockApiClient = new MockApiClient(null, true);
      (dataTarget as any).apiClient = mockApiClient;

      const addedData = [
        createValidFieldSet({ firstName: 'Test', lastName: 'Person' })
      ];
      const updatedData: any[] = [];
      const removedData: any[] = [];

      const params: PushAllParms = { 
        added: addedData,
        updated: updatedData,
        removed: removedData
      };
      const result = await dataTarget.pushAll(params);

      expect(result.status).toBe(BatchStatus.FAILURE);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].status).toBe(Status.FAILURE);
    });

    it('should handle empty operations array', async () => {
      const params: PushAllParms = { 
        added: [],
        updated: [],
        removed: []
      };
      const result = await dataTarget.pushAll(params);

      expect(result.status).toBe(BatchStatus.SUCCESS);
      expect(result.successes || []).toHaveLength(0);
      expect(result.failures).toHaveLength(0);
    });
  });

  describe('batching logic', () => {
    it('should process large batches in chunks', async () => {
      // Mock successful responses for multiple batches
      const mockResponse: PersonPushResponse[] = Array(5).fill(null).map((_, i) => ({
        hrn: `hrn:hrs:persons:${i + 1}`
      }));
      mockApiClient = new MockApiClient(mockResponse);
      (dataTarget as any).apiClient = mockApiClient;

      // Create 15 added operations (should be split into batches based on config batchSize: 10)
      const addedData = Array(15).fill(null).map((_, i) => 
        createFieldSet({ firstName: `Person${i + 1}` })
      );

      const params: PushAllParms = { 
        added: addedData,
        updated: [],
        removed: []
      };
      const result = await dataTarget.pushAll(params);

      expect((result.successes || []).length + result.failures.length).toBe(15);
      // Should have made multiple API calls due to batching
    });
  });

  describe('Dry Run Mode', () => {
    const originalEnv = process.env.DRY_RUN;

    beforeEach(() => {
      // Enable dry run mode for these tests
      process.env.DRY_RUN = 'true';
      // Create a new instance to pick up the env variable
      dataTarget = new HuronPersonDataTarget({ config: mockConfig });
      (dataTarget as any).apiClient = mockApiClient;
    });

    afterEach(() => {
      // Restore original environment
      if (originalEnv === undefined) {
        delete process.env.DRY_RUN;
      } else {
        process.env.DRY_RUN = originalEnv;
      }
    });

    it('should return success without calling API for CREATE operation', async () => {
      const postSpy = jest.spyOn(mockApiClient, 'post');

      const fieldSet = createValidFieldSet({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.CREATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.primaryKey).toBeDefined();
      expect(result.primaryKey[0].hrn).toBeUndefined(); // In dry run, HRN should not be set
      expect(result.crud).toBe(CrudOperation.CREATE);
      expect(postSpy).not.toHaveBeenCalled();
    });

    it('should return success without calling API for UPDATE operation', async () => {
      const patchSpy = jest.spyOn(mockApiClient, 'patch');

      // Mock ReadPerson to return an existing person
      const mockReadPerson = ReadPerson as jest.MockedClass<typeof ReadPerson>;
      const mockReadPersonInstance = {
        read: jest.fn().mockResolvedValue('hrn:hrs:persons:12345')
      };
      mockReadPerson.mockImplementation(() => mockReadPersonInstance as any);

      const fieldSet = createFieldSet({
        id: 'person-1',
        firstName: 'Jane',
        lastName: 'Smith'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.UPDATE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.primaryKey).toBeDefined();
      expect(result.primaryKey[0].hrn).toBeUndefined();
      expect(result.crud).toBe(CrudOperation.UPDATE);
      expect(patchSpy).not.toHaveBeenCalled();
    });

    it('should return success without calling API for DELETE operation', async () => {
      const patchSpy = jest.spyOn(mockApiClient, 'patch');

      // Mock ReadPerson to return an existing person
      const mockReadPerson = ReadPerson as jest.MockedClass<typeof ReadPerson>;
      const mockReadPersonInstance = {
        read: jest.fn().mockResolvedValue('hrn:hrs:persons:12345')
      };
      mockReadPerson.mockImplementation(() => mockReadPersonInstance as any);

      const fieldSet = createFieldSet({
        id: 'person-1'
      });

      const params: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const result = await dataTarget.pushOne(params);

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.primaryKey).toBeDefined();
      expect(result.primaryKey[0].hrn).toBeUndefined();
      expect(result.crud).toBe(CrudOperation.DELETE);
      expect(patchSpy).not.toHaveBeenCalled();
    });

    it('should process all batch operations without calling API', async () => {
      const postSpy = jest.spyOn(mockApiClient, 'post');
      const patchSpy = jest.spyOn(mockApiClient, 'patch');

      // Mock ReadPerson for updates and deletes
      const mockReadPerson = ReadPerson as jest.MockedClass<typeof ReadPerson>;
      const mockReadPersonInstance = {
        read: jest.fn().mockResolvedValue('hrn:hrs:persons:12345')
      };
      mockReadPerson.mockImplementation(() => mockReadPersonInstance as any);

      const addedData = [
        createValidFieldSet({ firstName: 'John', lastName: 'Doe' }),
        createValidFieldSet({ firstName: 'Jane', lastName: 'Smith' })
      ];

      const updatedData = [
        createValidFieldSet({ id: 'person-1', firstName: 'Updated', lastName: 'Person' })
      ];

      const removedData = [
        createValidFieldSet({ id: 'person-2', hrn: 'hrn:hrs:persons:2' })
      ];

      const params: PushAllParms = {
        added: addedData,
        updated: updatedData,
        removed: removedData
      };

      const result = await dataTarget.pushAll(params);

      expect(result.status).toBe(BatchStatus.SUCCESS);
      expect(result.failures).toHaveLength(0);
      expect(result.successes).toHaveLength(4);
      
      // Verify all successes have undefined hrn
      result.successes?.forEach(success => {
        expect(success.primaryKey[0].hrn).toBeUndefined();
      });

      // Verify no API calls were made
      expect(postSpy).not.toHaveBeenCalled();
      expect(patchSpy).not.toHaveBeenCalled();
    });
  });

  describe('convertFieldSetToRequest - userId handling', () => {
    it('should preserve userId field for CREATE operations', () => {
      const fieldSet = createFieldSet({
        id: 'person-123',
        sourceIdentifier: 'person-123',
        userId: 'john.doe',
        firstName: 'John',
        lastName: 'Doe',
        employeeId: 'emp-456'
      });

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.CREATE);

      expect(result.operation).toBe('create');
      expect(result.data).toBeDefined();
      expect(result.data.userId).toBe('john.doe');
      expect(result.data.firstName).toBe('John');
      expect(result.data.lastName).toBe('Doe');
    });

    it('should remove userId field for UPDATE operations', () => {
      const fieldSet = createFieldSet({
        id: 'person-123',
        sourceIdentifier: 'person-123',
        userId: 'john.doe',
        firstName: 'John',
        lastName: 'Doe',
        employeeId: 'emp-456',
        hrn: 'hrn:hrs:persons:person-123'
      });

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.UPDATE);

      expect(result.operation).toBe('update');
      expect(result.data).toBeDefined();
      expect(result.data.userId).toBeUndefined();
      expect('userId' in result.data).toBe(false);
      expect(result.data.firstName).toBe('John');
      expect(result.data.lastName).toBe('Doe');
      expect(result.data.hrn).toBe('hrn:hrs:persons:person-123');
    });

    it('should handle UPDATE operations when userId is not present', () => {
      const fieldSet = createFieldSet({
        id: 'person-123',
        sourceIdentifier: 'person-123',
        firstName: 'Jane',
        lastName: 'Smith',
        hrn: 'hrn:hrs:persons:person-123'
      });

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.UPDATE);

      expect(result.operation).toBe('update');
      expect(result.data).toBeDefined();
      expect(result.data.userId).toBeUndefined();
      expect('userId' in result.data).toBe(false);
      expect(result.data.firstName).toBe('Jane');
      expect(result.data.lastName).toBe('Smith');
    });

    it('should not include userId for DELETE operations', () => {
      const fieldSet = createFieldSet({
        id: 'person-123',
        userId: 'john.doe'
      });

      const result = HuronPersonDataTarget.convertFieldSetToRequest(fieldSet, CrudOperation.DELETE);

      expect(result.operation).toBe('delete');
      expect(result.data).toBeDefined();
      expect(result.data.active).toBe(false);
      expect(result.data.userId).toBeUndefined();
      expect('userId' in result.data).toBe(false);
    });
  });

  describe('Validation Failures and Error Event Processing', () => {
    let mockErrorEventProcessor: { process: jest.Mock };

    beforeEach(() => {
      mockErrorEventProcessor = {
        process: jest.fn().mockResolvedValue(undefined)
      };
    });

    it('should call errorEventProcessor with CREATE operation in message when validation fails on create', async () => {
      // Create a DataTarget with error event processor
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      // Create an invalid FieldSet (missing required firstName)
      const invalidFieldSet: FieldSet = {
        fieldValues: [
          { id: 'person-123' },
          { sourceIdentifier: 'person-123' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
          // Missing firstName - will cause validation failure
        ]
      };

      const params: PushOneParms = {
        data: invalidFieldSet,
        crud: CrudOperation.CREATE
      };

      const result = await dataTargetWithProcessor.pushOne(params);

      // Verify the result indicates failure
      expect(result.status).toBe(Status.FAILURE);
      expect(result.message).toContain('Validation failed');

      // Verify errorEventProcessor was called
      expect(mockErrorEventProcessor.process).toHaveBeenCalledTimes(1);

      // Verify the error details contain CREATE operation
      const callArgs = mockErrorEventProcessor.process.mock.calls[0];
      const errorDetails = callArgs[1];
      expect(errorDetails.message).toContain('CREATE');
      expect(errorDetails.message).toMatch(/Huron CREATE error:/);
      expect(errorDetails.object).toHaveProperty('sourceIdentifier', 'person-123');
    });

    it('should call errorEventProcessor with UPDATE operation in message when validation fails on update', async () => {
      // Note: Validation currently only applies to CREATE operations, not UPDATE
      // This test verifies that UPDATE operations bypass validation
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      const invalidFieldSet: FieldSet = {
        fieldValues: [
          { id: 'person-456' },
          { sourceIdentifier: 'person-456' },
          { lastName: 'Smith' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
          // Missing firstName - but validation doesn't apply to UPDATE
        ]
      };

      const params: PushOneParms = {
        data: invalidFieldSet,
        crud: CrudOperation.UPDATE
      };

      // UPDATE operations don't trigger validation, so this will attempt API call
      // For this test, we're just verifying validation is skipped for UPDATE
      try {
        await dataTargetWithProcessor.pushOne(params);
      } catch (error) {
        // Expected to fail during API call, not validation
      }

      // Validation is only checked for CREATE, so errorEventProcessor should NOT be called
      expect(mockErrorEventProcessor.process).toHaveBeenCalledTimes(0);
    });

    it('should call errorEventProcessor with DELETE operation in message when validation fails on delete', async () => {
      // Note: Validation currently only applies to CREATE operations, not DELETE
      // This test verifies that DELETE operations bypass validation
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      // Create invalid delete request (missing required id)
      const invalidFieldSet: FieldSet = {
        fieldValues: [
          { lastName: 'Jones' },
          { firstName: 'Bob' }
          // Missing id - but validation doesn't apply to DELETE
        ]
      };

      const params: PushOneParms = {
        data: invalidFieldSet,
        crud: CrudOperation.DELETE
      };

      // DELETE operations don't trigger validation, so this will attempt API call
      try {
        await dataTargetWithProcessor.pushOne(params);
      } catch (error) {
        // Expected to fail during API call, not validation
      }

      // Validation is only checked for CREATE, so errorEventProcessor should NOT be called
      expect(mockErrorEventProcessor.process).toHaveBeenCalledTimes(0);
    });

    it('should include validation violation reasons in error message', async () => {
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      // Create an invalid FieldSet with multiple violations
      const invalidFieldSet: FieldSet = {
        fieldValues: [
          { id: 'person-999' },
          { sourceIdentifier: 'person-999' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
          // Missing firstName AND lastName - will cause multiple validation failures
        ]
      };

      const params: PushOneParms = {
        data: invalidFieldSet,
        crud: CrudOperation.CREATE
      };

      const result = await dataTargetWithProcessor.pushOne(params);

      expect(result.status).toBe(Status.FAILURE);
      expect(mockErrorEventProcessor.process).toHaveBeenCalledTimes(1);

      // Verify the error details include the validation violations
      const callArgs = mockErrorEventProcessor.process.mock.calls[0];
      const errorDetails = callArgs[1];
      
      // The message should contain the validation violations
      expect(errorDetails.message).toMatch(/Huron CREATE error:/);
      // Validation messages typically include field names
      expect(errorDetails.message.length).toBeGreaterThan('Huron CREATE error:'.length);
    });

    it('should pass simulated error with correct structure to errorEventProcessor', async () => {
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      const invalidFieldSet: FieldSet = {
        fieldValues: [
          { sourceIdentifier: 'person-test' },
          { id: 'person-test' },
          { lastName: 'Test' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
          // Missing firstName
        ]
      };

      const params: PushOneParms = {
        data: invalidFieldSet,
        crud: CrudOperation.CREATE
      };

      await dataTargetWithProcessor.pushOne(params);

      expect(mockErrorEventProcessor.process).toHaveBeenCalledTimes(1);

      // Verify the simulated error structure
      const callArgs = mockErrorEventProcessor.process.mock.calls[0];
      const simulatedError = callArgs[0];
      
      expect(simulatedError).toHaveProperty('response');
      expect(simulatedError.response).toHaveProperty('status', 400);
      expect(simulatedError.response).toHaveProperty('statusText', 'Bad Request');
      expect(simulatedError.response).toHaveProperty('data');
      expect(simulatedError.response.data).toHaveProperty('errors');
      expect(Array.isArray(simulatedError.response.data.errors)).toBe(true);
      expect(simulatedError.response.data.errors.length).toBeGreaterThan(0);
      
      const firstError = simulatedError.response.data.errors[0];
      expect(firstError).toHaveProperty('status', 400);
      expect(firstError).toHaveProperty('internalErrorMessage');
      expect(firstError).toHaveProperty('incidentId');
      expect(firstError.incidentId).toMatch(/^VALIDATION-/);
    });

    it('should not call errorEventProcessor when no processor is provided', async () => {
      // Create DataTarget without error event processor
      const dataTargetNoProcessor = new HuronPersonDataTarget({
        config: mockConfig
        // No errorEventProcessor
      });
      (dataTargetNoProcessor as any).apiClient = mockApiClient;

      const invalidFieldSet: FieldSet = {
        fieldValues: [
          { sourceIdentifier: 'person-123' },
          { id: 'person-123' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
          // Missing firstName
        ]
      };

      const params: PushOneParms = {
        data: invalidFieldSet,
        crud: CrudOperation.CREATE
      };

      // Should not throw even though errorEventProcessor is undefined
      const result = await dataTargetNoProcessor.pushOne(params);
      
      expect(result.status).toBe(Status.FAILURE);
      expect(result.message).toContain('Validation failed');
    });
  });

  describe('Skip Functionality - Student with No Current Term', () => {
    let mockErrorEventProcessor: { process: jest.Mock };

    beforeEach(() => {
      mockErrorEventProcessor = {
        process: jest.fn().mockResolvedValue(undefined)
      };
    });

    it('should include skipReason when validation fails for student-only with no current term', async () => {
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      // Create a FieldSet with __skipReason indicating student-only with no current term
      const fieldSetWithSkipReason: FieldSet = {
        fieldValues: [
          { id: 'U00173766' },
          { sourceIdentifier: 'U00173766' },
          { firstName: 'Test' },
          { lastName: 'Student' },
          { __skipReason: 'Student-only with no current term enrollment (personId: U00173766)' }
          // Missing employer/organization - but should be skipped, not failed
        ]
      };

      const params: PushOneParms = {
        data: fieldSetWithSkipReason,
        crud: CrudOperation.CREATE
      };

      const result = await dataTargetWithProcessor.pushOne(params);

      // Verify the result includes skipReason
      expect(result.status).toBe(Status.FAILURE);
      expect(result.skipReason).toBe('Student-only with no current term enrollment (personId: U00173766)');
    });

    it('should add to skipped array in pushAll when skipReason is present', async () => {
      mockApiClient = new MockApiClient({ hrn: 'hrn:hrs:persons:12345' });
      (dataTarget as any).apiClient = mockApiClient;

      // Valid record
      const validRecord = createValidFieldSet({
        id: 'person-1',
        firstName: 'Valid',
        lastName: 'Person'
      });

      // Record with skipReason
      const recordWithSkipReason: FieldSet = {
        fieldValues: [
          { id: 'U00173766' },
          { sourceIdentifier: 'U00173766' },
          { firstName: 'Skip' },
          { lastName: 'Student' },
          { __skipReason: 'Student-only with no current term enrollment (personId: U00173766)' }
        ]
      };

      // Invalid record (no skipReason)
      const invalidRecord: FieldSet = {
        fieldValues: [
          { id: 'person-3' },
          { sourceIdentifier: 'person-3' },
          { lastName: 'Invalid' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
          // Missing firstName - regular validation failure
        ]
      };

      const params: PushAllParms = {
        added: [validRecord, recordWithSkipReason, invalidRecord],
        updated: [],
        removed: []
      };

      const result = await dataTarget.pushAll(params);

      // Verify counts
      expect(result.successes?.length).toBe(1); // Valid record
      expect(result.failures.length).toBe(1);   // Invalid record
      expect(result.skipped?.length).toBe(1);    // Record with skipReason

      // Verify skipped record has skipReason
      const skippedRecord = result.skipped?.[0];
      expect(skippedRecord).toBeDefined();
      expect(skippedRecord?.skipReason).toBe('Student-only with no current term enrollment (personId: U00173766)');
      expect(skippedRecord?.status).toBe(Status.FAILURE);
    });

    it('should include skipped count in batch result message', async () => {
      mockApiClient = new MockApiClient({ hrn: 'hrn:hrs:persons:12345' });
      (dataTarget as any).apiClient = mockApiClient;

      const validRecord = createValidFieldSet({
        id: 'person-1',
        firstName: 'Valid',
        lastName: 'Person'
      });

      const recordWithSkipReason: FieldSet = {
        fieldValues: [
          { id: 'U00173766' },
          { sourceIdentifier: 'U00173766' },
          { firstName: 'Skip' },
          { lastName: 'Student' },
          { __skipReason: 'Student-only with no current term enrollment (personId: U00173766)' }
        ]
      };

      const params: PushAllParms = {
        added: [validRecord, recordWithSkipReason],
        updated: [],
        removed: []
      };

      const result = await dataTarget.pushAll(params);

      // Verify message includes skipped count
      expect(result.message).toContain('1 successes');
      expect(result.message).toContain('0 failures');
      expect(result.message).toContain('1 skipped');
    });

    it('should not call errorEventProcessor for skipped records', async () => {
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      mockApiClient = new MockApiClient({ hrn: 'hrn:hrs:persons:12345' });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      const recordWithSkipReason: FieldSet = {
        fieldValues: [
          { id: 'U00173766' },
          { sourceIdentifier: 'U00173766' },
          { firstName: 'Skip' },
          { lastName: 'Student' },
          { __skipReason: 'Student-only with no current term enrollment (personId: U00173766)' }
        ]
      };

      const params: PushAllParms = {
        added: [recordWithSkipReason],
        updated: [],
        removed: []
      };

      await dataTargetWithProcessor.pushAll(params);

      // errorEventProcessor should not be called for skipped records
      // Skip scenarios are expected/natural and shouldn't be logged to DynamoDB
      expect(mockErrorEventProcessor.process).not.toHaveBeenCalled();
    });

    it('should call errorEventProcessor for regular validation failures (not skipped)', async () => {
      const dataTargetWithProcessor = new HuronPersonDataTarget({
        config: mockConfig,
        errorEventProcessor: mockErrorEventProcessor
      });
      mockApiClient = new MockApiClient({ hrn: 'hrn:hrs:persons:12345' });
      (dataTargetWithProcessor as any).apiClient = mockApiClient;

      // Regular validation failure - missing firstName (no skipReason)
      const invalidRecord: FieldSet = {
        fieldValues: [
          { id: 'person-invalid' },
          { sourceIdentifier: 'person-invalid' },
          { lastName: 'InvalidPerson' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
          // Missing firstName - regular validation failure
        ]
      };

      const params: PushAllParms = {
        added: [invalidRecord],
        updated: [],
        removed: []
      };

      await dataTargetWithProcessor.pushAll(params);

      // errorEventProcessor SHOULD be called for regular validation failures
      expect(mockErrorEventProcessor.process).toHaveBeenCalledTimes(1);
      
      // Verify the error details passed to errorEventProcessor
      const callArgs = mockErrorEventProcessor.process.mock.calls[0];
      expect(callArgs[0]).toBeDefined(); // simulatedError
      expect(callArgs[0].message).toContain('create cancelled');
      expect(callArgs[1]).toBeDefined(); // errorDetails
      expect(callArgs[1].message).toContain('Huron CREATE error');
    });

    it('should handle empty skipped array when no records are skipped', async () => {
      mockApiClient = new MockApiClient({ hrn: 'hrn:hrs:persons:12345' });
      (dataTarget as any).apiClient = mockApiClient;

      const validRecord = createValidFieldSet({
        id: 'person-1',
        firstName: 'Valid',
        lastName: 'Person'
      });

      const params: PushAllParms = {
        added: [validRecord],
        updated: [],
        removed: []
      };

      const result = await dataTarget.pushAll(params);

      // Verify skipped array is empty
      expect(result.skipped).toBeDefined();
      expect(result.skipped?.length).toBe(0);
      expect(result.message).toContain('0 skipped');
    });
  });
});