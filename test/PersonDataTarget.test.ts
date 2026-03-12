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

// Helper function to create FieldSet
function createFieldSet(fields: Record<string, any>): FieldSet {
  return {
    fieldValues: Object.entries(fields).map(([key, value]) => ({ [key]: value }))
  };
}

describe('HuronPersonDataTarget', () => {
  let dataTarget: HuronPersonDataTarget;
  let mockApiClient: MockApiClient;
  
  const mockConfig: Config = {
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
      }
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
          }
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
          }
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

      const fieldSet = createFieldSet({
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

      const fieldSet = createFieldSet({ firstName: 'Test' });
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

      const fieldSet = createFieldSet({ firstName: 'Invalid' });
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
        createFieldSet({ firstName: 'John', lastName: 'Doe' })
      ];
      const updatedData = [
        createFieldSet({ id: 'person-2', sourceIdentifier: 'person-2', firstName: 'Jane' })
      ];
      const removedData = [
        createFieldSet({ id: 'person-3', hrn: 'hrn:hrs:persons:3' })
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
        createFieldSet({ firstName: 'John' }),
        createFieldSet({ email: 'invalid-email' })
      ];
      const updatedData = [
        createFieldSet({ id: 'person-3', sourceIdentifier: 'person-3', firstName: 'Updated' })
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
        createFieldSet({ firstName: 'Test' })
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
});