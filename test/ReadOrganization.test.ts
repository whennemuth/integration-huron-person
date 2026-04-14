import { ReadOrganization } from '../src/data-target/crud/ReadOrganization';
import { ConfigManager } from '../src/config/ConfigManager';
import { ApiClientForJWT } from '../src/data-target/ApiClientForJWT';
import { ReadOrganizations } from '../src/data-target/crud/ReadOrganizations';
import { HuronOrganization } from '../src/data-target/crud/Organization';
import { createMockConfig } from './helpers/mockConfig';

// Mock the dependencies
jest.mock('../src/data-target/ApiClientForJWT');
jest.mock('../src/data-target/crud/ReadOrganizations');

describe('ReadOrganization', () => {
  let readOrganization: ReadOrganization;
  let mockApiClient: jest.Mocked<ApiClientForJWT>;

  beforeAll(() => {
    const config = ConfigManager
      .getInstance()
      .reset()
      .fromPartial(createMockConfig())
      .getConfig('none');

    readOrganization = new ReadOrganization(config);

    // Create mocks
    mockApiClient = new ApiClientForJWT({} as any) as jest.Mocked<ApiClientForJWT>;

    // Replace the private apiClient with our mock
    (readOrganization as any).apiClient = mockApiClient;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readOrganizationByHRN', () => {
    const mockOrganizationData: HuronOrganization = {
      id: 'org1',
      hrn: 'hrn:hrs:organizations:12345',
      name: 'Test Organization'
    } as HuronOrganization;

    beforeEach(() => {
      mockApiClient.get.mockResolvedValue({
        data: { data: mockOrganizationData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should pass through HRN unchanged', async () => {
      await readOrganization.readOrganizationByHRN('hrn:hrs:organizations:67890');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v2/organizations/hrn%3Ahrs%3Aorganizations%3A67890',
          params: { includeFields: undefined }
        })
      );
    });

    it('should URL encode HRN with special characters', async () => {
      await readOrganization.readOrganizationByHRN('hrn:hrs:organizations:test@example');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v2/organizations/hrn%3Ahrs%3Aorganizations%3Atest%40example'
        })
      );
    });

    it('should return single organization object from response', async () => {
      const result = await readOrganization.readOrganizationByHRN('hrn:hrs:organizations:12345');

      expect(result).toEqual(mockOrganizationData);
      expect(Array.isArray(result)).toBe(false);
    });

    it('should pass includeFields parameter to API call', async () => {
      await readOrganization.readOrganizationByHRN('hrn:hrs:organizations:12345', ['id', 'name']);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { includeFields: ['id', 'name'] }
        })
      );
    });

    it('should handle API error with non-200 status', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { error: 'Not Found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {}
      } as any);

      await expect(readOrganization.readOrganizationByHRN('hrn:hrs:organizations:12345')).rejects.toThrow(
        'Failed to read organization hrn:hrs:organizations:12345: HTTP 404 Not Found'
      );
    });

    it('should handle API call failure gracefully', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(readOrganization.readOrganizationByHRN('hrn:hrs:organizations:12345')).rejects.toThrow(
        'Failed to read organization hrn:hrs:organizations:12345'
      );
    });
  });

  describe('readOrganizationById', () => {
    const mockOrganizationArray: HuronOrganization[] = [
      { id: 'org1', name: 'Test Organization' } as HuronOrganization
    ];
    let mockReadAllOrganizations: jest.Mock;

    beforeEach(() => {
      mockReadAllOrganizations = jest.fn().mockResolvedValue(mockOrganizationArray);
      
      (ReadOrganizations as jest.MockedClass<typeof ReadOrganizations>).mockImplementation(() => {
        return {
          readAllOrganizations: mockReadAllOrganizations
        } as any;
      });
      
      (ReadOrganizations.createFilter as jest.Mock) = jest.fn((filter) => ({
        ...filter,
        logicalOperator: filter.logicalOperator || 'and',
        comparisonOperator: filter.comparisonOperator || 'eq',
        priority: filter.priority || 0
      }));
    });

    it('should call readOrganizationBySingleFilter with id field', async () => {
      const result = await readOrganization.readOrganizationById('org123');

      expect(result).toEqual(mockOrganizationArray);
      expect(ReadOrganizations).toHaveBeenCalled();
      expect(mockReadAllOrganizations).toHaveBeenCalled();
    });

    it('should pass includeFields to readOrganizationBySingleFilter', async () => {
      const includeFields = ['id', 'name'];
      await readOrganization.readOrganizationById('org123', includeFields);

      expect(mockReadAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should verify correct filter field is used', async () => {
      await readOrganization.readOrganizationById('org123');

      expect(ReadOrganizations.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'id',
          value: 'org123'
        })
      );
      expect(mockReadAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'id',
              value: 'org123'
            })
          ])
        })
      );
    });

    it('should handle errors with method-specific message', async () => {
      mockReadAllOrganizations.mockRejectedValue(new Error('API error'));

      await expect(readOrganization.readOrganizationById('org123')).rejects.toThrow(
        'Failed to read organization by id org123'
      );
    });

    it('should return array of organizations', async () => {
      const result = await readOrganization.readOrganizationById('org123');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('readOrganizationByName', () => {
    const mockOrganizationArray: HuronOrganization[] = [
      { id: 'org1', name: 'Test Organization' } as HuronOrganization
    ];
    let mockReadAllOrganizations: jest.Mock;

    beforeEach(() => {
      mockReadAllOrganizations = jest.fn().mockResolvedValue(mockOrganizationArray);
      
      (ReadOrganizations as jest.MockedClass<typeof ReadOrganizations>).mockImplementation(() => {
        return {
          readAllOrganizations: mockReadAllOrganizations
        } as any;
      });
      
      (ReadOrganizations.createFilter as jest.Mock) = jest.fn((filter) => ({
        ...filter,
        logicalOperator: filter.logicalOperator || 'and',
        comparisonOperator: filter.comparisonOperator || 'eq',
        priority: filter.priority || 0
      }));
    });

    it('should call readOrganizationBySingleFilter with name field', async () => {
      const result = await readOrganization.readOrganizationByName('Test Org');

      expect(result).toEqual(mockOrganizationArray);
      expect(ReadOrganizations.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'name',
          value: 'Test Org'
        })
      );
      expect(mockReadAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'name',
              value: 'Test Org'
            })
          ])
        })
      );
    });

    it('should pass includeFields to readOrganizationBySingleFilter', async () => {
      const includeFields = ['id', 'name'];
      await readOrganization.readOrganizationByName('Test Org', includeFields);

      expect(mockReadAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should handle errors with method-specific message', async () => {
      mockReadAllOrganizations.mockRejectedValue(new Error('API error'));

      await expect(readOrganization.readOrganizationByName('Test Org')).rejects.toThrow(
        'Failed to read organization by name Test Org'
      );
    });

    it('should return array of organizations', async () => {
      const result = await readOrganization.readOrganizationByName('Test Org');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('readOrganizationBySourceIdentifier', () => {
    const mockOrganizationArray: HuronOrganization[] = [
      { id: 'org1', sourceIdentifier: 'source123', name: 'Test Organization' } as HuronOrganization
    ];
    let mockReadAllOrganizations: jest.Mock;

    beforeEach(() => {
      mockReadAllOrganizations = jest.fn().mockResolvedValue(mockOrganizationArray);
      
      (ReadOrganizations as jest.MockedClass<typeof ReadOrganizations>).mockImplementation(() => {
        return {
          readAllOrganizations: mockReadAllOrganizations
        } as any;
      });
      
      (ReadOrganizations.createFilter as jest.Mock) = jest.fn((filter) => ({
        ...filter,
        logicalOperator: filter.logicalOperator || 'and',
        comparisonOperator: filter.comparisonOperator || 'eq',
        priority: filter.priority || 0
      }));
    });

    it('should call readOrganizationBySingleFilter with sourceIdentifier field', async () => {
      const result = await readOrganization.readOrganizationBySourceIdentifier('source123');

      expect(result).toEqual(mockOrganizationArray);
      expect(ReadOrganizations.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'sourceIdentifier',
          value: 'source123'
        })
      );
      expect(mockReadAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'sourceIdentifier',
              value: 'source123'
            })
          ])
        })
      );
    });

    it('should pass includeFields to readOrganizationBySingleFilter', async () => {
      const includeFields = ['id', 'sourceIdentifier'];
      await readOrganization.readOrganizationBySourceIdentifier('source123', includeFields);

      expect(mockReadAllOrganizations).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should handle errors with method-specific message', async () => {
      mockReadAllOrganizations.mockRejectedValue(new Error('API error'));

      await expect(readOrganization.readOrganizationBySourceIdentifier('source123')).rejects.toThrow(
        'Failed to read organization by sourceIdentifier source123'
      );
    });

    it('should return array of organizations', async () => {
      const result = await readOrganization.readOrganizationBySourceIdentifier('source123');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });
});
