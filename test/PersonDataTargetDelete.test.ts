import {
  CrudOperation,
  FieldSet,
  PushOneParms,
  Status
} from 'integration-core';
import { Config, TargetPersonDeleteType } from '../src/config/Config';
import { HuronPersonDataTargetDelete } from '../src/data-target/PersonDataTargetDelete';
import { ReadPerson } from '../src/data-target/crud/ReadPerson';
import { HuronPerson } from '../src/data-target/crud/Person';
import { ApiClientForJWT } from '../src/data-target/ApiClientForJWT';

// Mock ReadPerson
jest.mock('../src/data-target/crud/ReadPerson');

// Mock ApiClient for DELETE operations
class MockApiClient implements Partial<ApiClientForJWT> {
  private patchResponses: any[] = [];
  private patchCallCount: number = 0;
  private patchCalls: any[] = [];

  constructor(patchResponse?: any) {
    if (Array.isArray(patchResponse)) {
      this.patchResponses = patchResponse;
    } else if (patchResponse !== null && patchResponse !== undefined) {
      this.patchResponses = [patchResponse];
    } else {
      this.patchResponses = [{ success: true, message: 'Success' }];
    }
  }

  setErrorEventDetails(details: any): void {
    // No-op for mock
  }

  getUserId(): string | null {
    return null;
  }

  async patch<T = any>(url: string, data?: any): Promise<any> {
    this.patchCalls.push({ url, data });
    const response = this.patchCallCount < this.patchResponses.length 
      ? this.patchResponses[this.patchCallCount] 
      : this.patchResponses[this.patchResponses.length - 1] || { success: true };
    
    this.patchCallCount++;
    
    return {
      data: response,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    };
  }

  getPatchCalls(): any[] {
    return this.patchCalls;
  }

  getLastPatchCall(): any {
    return this.patchCalls[this.patchCalls.length - 1];
  }
}

// Helper function to create FieldSet
function createFieldSet(fields: Record<string, any>): FieldSet {
  return {
    fieldValues: Object.entries(fields).map(([key, value]) => ({ [key]: value }))
  };
}

describe('HuronPersonDataTargetDelete', () => {
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
      personsPath: '/api/v1/persons',
      organizationsPath: '/api/v1/organizations',
      personDeleteType: TargetPersonDeleteType.SOFT
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

  let mockApiClient: MockApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = new MockApiClient({ success: true, message: 'Person deactivated' });
  });

  describe('deletePerson - HRN available', () => {
    it('should successfully delete person when HRN is provided in fieldSet', async () => {
      const fieldSet = createFieldSet({
        id: 'person-1',
        sourceIdentifier: 'emp-123',
        firstName: 'John',
        lastName: 'Doe',
        hrn: 'hrn:hrs:persons:12345'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      const result = await deleter.deletePerson();

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
      expect(result.response.data.success).toBe(true);
      
      const patchCall = mockApiClient.getLastPatchCall();
      expect(patchCall.url).toContain('hrn:hrs:persons:12345');
      expect(patchCall.data).toEqual({
        hrn: 'hrn:hrs:persons:12345',
        active: false
      });
    });

    it('should call patch with correct endpoint path when HRN is present', async () => {
      const fieldSet = createFieldSet({
        id: 'test-id',
        hrn: 'hrn:hrs:persons:99999',
        sourceIdentifier: 'src-123'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      await deleter.deletePerson();

      const patchCall = mockApiClient.getLastPatchCall();
      expect(patchCall.url).toBe('/api/v1/persons/hrn:hrs:persons:99999');
    });
  });

  describe('deletePerson - sourceIdentifier fallback', () => {
    it('should successfully delete using sourceIdentifier fallback when HRN not provided', async () => {
      const mockPerson: HuronPerson = {
        id: 'person-1',
        hrn: 'hrn:hrs:persons:fallback-123',
        sourceIdentifier: 'emp-456',
        firstName: 'Jane',
        lastName: 'Smith',
        active: true,
        employer: { hrn: 'hrn:hrs:orgs:999' },
        organization: { hrn: 'hrn:hrs:orgs:888' }
      };

      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: jest.fn().mockResolvedValue([mockPerson])
      } as any));

      const fieldSet = createFieldSet({
        id: 'person-1',
        sourceIdentifier: 'emp-456',
        firstName: 'Jane',
        lastName: 'Smith'
        // Note: no hrn provided
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      const result = await deleter.deletePerson();

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
      expect(result.response.data.success).toBe(true);
      
      const patchCall = mockApiClient.getLastPatchCall();
      expect(patchCall.url).toContain('hrn:hrs:persons:fallback-123');
      expect(patchCall.data).toEqual({
        hrn: 'hrn:hrs:persons:fallback-123',
        active: false
      });
    });

    it('should return FAILURE when sourceIdentifier lookup returns no person', async () => {
      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: jest.fn().mockResolvedValue([])
      } as any));

      const fieldSet = createFieldSet({
        id: 'person-1',
        sourceIdentifier: 'emp-nonexistent',
        firstName: 'Unknown',
        lastName: 'Person'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      const result = await deleter.deletePerson();

      expect(result.result).toBeDefined();
      expect(result.result?.status).toBe(Status.FAILURE);
      expect(result.result?.message).toContain('HRN lookup by sourceIdentifier failed');
    });

    it('should return FAILURE when sourceIdentifier lookup encounters an error', async () => {
      const lookupError = new Error('Network error during lookup');
      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: jest.fn().mockRejectedValue(lookupError)
      } as any));

      const fieldSet = createFieldSet({
        id: 'person-1',
        sourceIdentifier: 'emp-123',
        firstName: 'John',
        lastName: 'Doe'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      const result = await deleter.deletePerson();

      expect(result.result).toBeDefined();
      expect(result.result?.status).toBe(Status.FAILURE);
      expect(result.result?.message).toContain('encountered an error');
    });

    it('should return FAILURE when neither HRN nor sourceIdentifier is available', async () => {
      const fieldSet = createFieldSet({
        id: 'person-1',
        firstName: 'John',
        lastName: 'Doe'
        // No hrn, no sourceIdentifier
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      const result = await deleter.deletePerson();

      expect(result.result).toBeDefined();
      expect(result.result?.status).toBe(Status.FAILURE);
      expect(result.result?.message).toContain('no HRN or sourceIdentifier available');
    });
  });

  describe('deletePerson - delete type handling', () => {
    it('should not perform patch when deleteType is LOG', async () => {
      const configWithLogDelete: Config = {
        ...mockConfig,
        dataTarget: {
          ...mockConfig.dataTarget,
          personDeleteType: TargetPersonDeleteType.LOG
        }
      };

      const fieldSet = createFieldSet({
        id: 'person-1',
        hrn: 'hrn:hrs:persons:12345'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: configWithLogDelete,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      await deleter.deletePerson();

      // Patch should not be called when deleteType is LOG
      expect(mockApiClient.getPatchCalls().length).toBe(0);
    });

    it('should not perform patch when deleteType is NONE', async () => {
      const configWithNoDelete: Config = {
        ...mockConfig,
        dataTarget: {
          ...mockConfig.dataTarget,
          personDeleteType: TargetPersonDeleteType.NONE
        }
      };

      const fieldSet = createFieldSet({
        id: 'person-1',
        hrn: 'hrn:hrs:persons:12345'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: configWithNoDelete,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      await deleter.deletePerson();

      // Patch should not be called when deleteType is NONE
      expect(mockApiClient.getPatchCalls().length).toBe(0);
    });

    it('should perform soft delete (patch) when deleteType is SOFT', async () => {
      const configWithSoftDelete: Config = {
        ...mockConfig,
        dataTarget: {
          ...mockConfig.dataTarget,
          personDeleteType: TargetPersonDeleteType.SOFT
        }
      };

      const fieldSet = createFieldSet({
        id: 'person-1',
        hrn: 'hrn:hrs:persons:12345'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: configWithSoftDelete,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      await deleter.deletePerson();

      // Patch should be called for SOFT delete
      expect(mockApiClient.getPatchCalls().length).toBe(1);
      const patchCall = mockApiClient.getLastPatchCall();
      expect(patchCall.data.active).toBe(false);
    });

    it('should treat HARD delete as SOFT delete (warning)', async () => {
      const configWithHardDelete: Config = {
        ...mockConfig,
        dataTarget: {
          ...mockConfig.dataTarget,
          personDeleteType: TargetPersonDeleteType.HARD
        }
      };

      const fieldSet = createFieldSet({
        id: 'person-1',
        hrn: 'hrn:hrs:persons:12345'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: configWithHardDelete,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await deleter.deletePerson();

      // Should still perform soft delete but log a warning
      expect(mockApiClient.getPatchCalls().length).toBe(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('HARD delete requested')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('hrn method', () => {
    it('should return HRN after successful deletion', async () => {
      const fieldSet = createFieldSet({
        id: 'person-1',
        hrn: 'hrn:hrs:persons:12345'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      await deleter.deletePerson();

      expect(deleter.hrn()).toBe('hrn:hrs:persons:12345');
    });

    it('should return HRN found via fallback lookup', async () => {
      const mockPerson: HuronPerson = {
        id: 'person-1',
        hrn: 'hrn:hrs:persons:fallback-123',
        sourceIdentifier: 'emp-456',
        firstName: 'John',
        lastName: 'Doe',
        employer: { hrn: 'hrn:hrs:orgs:999' },
        organization: { hrn: 'hrn:hrs:orgs:888' }
      };

      (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
        readPersonByHailMary: jest.fn().mockResolvedValue([mockPerson])
      } as any));

      const fieldSet = createFieldSet({
        id: 'person-1',
        sourceIdentifier: 'emp-456'
      });

      const pushOneParms: PushOneParms = {
        data: fieldSet,
        crud: CrudOperation.DELETE
      };

      const deleter = new HuronPersonDataTargetDelete({
        config: mockConfig,
        apiClient: mockApiClient as any,
        pushOneParms
      });

      await deleter.deletePerson();

      expect(deleter.hrn()).toBe('hrn:hrs:persons:fallback-123');
    });
  });
});
