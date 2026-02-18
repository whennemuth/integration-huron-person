import { ReadOrganizations, ReadOrganizationsOptions } from '../src/data-target/crud/ReadOrganizations';
import { ConfigManager } from '../src/config/ConfigManager';
import { ApiClientForJWT } from '../src/data-target/ApiClientForJWT';
import { QueryBuilder } from '../src/data-target/QueryBuilder';

// Mock the ApiClientForJWT
jest.mock('../src/data-target/ApiClientForJWT');

describe('ReadOrganizations', () => {
  let readOrganizations: ReadOrganizations;
  let mockApiClient: jest.Mocked<ApiClientForJWT>;
  let mockQueryBuilder: jest.Mocked<QueryBuilder>;

  beforeAll(() => {
    const config = ConfigManager
      .getInstance()
      .fromEnvironment()
      .fromFileSystem()
      .getConfig('nobody');

    // Create mocks
    mockApiClient = new ApiClientForJWT({} as any) as jest.Mocked<ApiClientForJWT>;
    mockQueryBuilder = new QueryBuilder(new Set(['name', 'id', 'active']), new Set(['name', 'id'])) as jest.Mocked<QueryBuilder>;
    mockQueryBuilder.buildQueryParams = jest.fn();

    readOrganizations = new ReadOrganizations(config, mockQueryBuilder);

    // Replace the private apiClient with our mock
    (readOrganizations as any).apiClient = mockApiClient;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful API response
    mockApiClient.get.mockResolvedValue({
      data: { pagination: { offset: 0, pageSize: 25, total: 0 }, data: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    } as any);
  });

  describe('createFilter', () => {
    it('should create a filter specification with default values', () => {
      const filter = ReadOrganizations.createFilter({ field: 'name', value: 'Test Organization' });

      expect(filter).toEqual({
        field: 'name',
        logicalOperator: 'and',
        comparisonOperator: 'eq',
        value: 'Test Organization',
        priority: 0
      });
    });

    it('should create a filter specification with custom values', () => {
      const filter = ReadOrganizations.createFilter({ 
        field: 'id', 
        value: 'ORG123', 
        priority: 1, 
        logicalOperator: 'or', 
        comparisonOperator: 'neq' 
      });

      expect(filter).toEqual({
        field: 'id',
        logicalOperator: 'or',
        comparisonOperator: 'neq',
        value: 'ORG123',
        priority: 1
      });
    });
  });

  describe('createSort', () => {
    it('should create a sort specification with default direction', () => {
      const sort = ReadOrganizations.createSort({ field: 'name' });

      expect(sort).toEqual({
        field: 'name',
        direction: 'desc'
      });
    });

    it('should create a sort specification with custom direction', () => {
      const sort = ReadOrganizations.createSort({ field: 'id', direction: 'asc' });

      expect(sort).toEqual({
        field: 'id',
        direction: 'asc'
      });
    });
  });

  describe('readOrganizations', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockQueryBuilder.buildQueryParams.mockReturnValue({});
      // Mock successful API response
      mockApiClient.get.mockResolvedValue({
        data: { pagination: { offset: 0, pageSize: 25, total: 0 }, data: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should call queryBuilder.buildQueryParams with options', async () => {
      const options: ReadOrganizationsOptions = { pagination: { pageSize: 10 } };
      await readOrganizations.readOrganizations(options);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(options);
    });

    it('should return the response data from apiClient.get', async () => {
      const mockResponseData = {
        pagination: { offset: 0, pageSize: 25, total: 100 },
        data: [{ id: 'org1', name: 'Test Organization' }],
        links: { next: 'http://example.com/next' }
      };
      mockApiClient.get.mockResolvedValue({
        data: mockResponseData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await readOrganizations.readOrganizations();

      expect(result).toEqual(mockResponseData);
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { error: 'Not Found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {}
      } as any);

      await expect(readOrganizations.readOrganizations()).rejects.toThrow('Failed to read organizations: HTTP 404 Not Found');
    });
  });

  describe('readAllOrganizations', () => {
    it('should handle pagination to retrieve all organizations', async () => {
      // Mock first page response
      const firstPageData = {
        pagination: { offset: 0, pageSize: 2, total: 5, continuationToken: 'token1' },
        data: [
          { id: 'org1', name: 'Organization 1' },
          { id: 'org2', name: 'Organization 2' }
        ]
      };

      // Mock second page response
      const secondPageData = {
        pagination: { offset: 1, pageSize: 2, total: 5, continuationToken: 'token2' },
        data: [
          { id: 'org3', name: 'Organization 3' },
          { id: 'org4', name: 'Organization 4' }
        ]
      };

      // Mock final page response
      const finalPageData = {
        pagination: { offset: 2, pageSize: 2, total: 5 },
        data: [
          { id: 'org5', name: 'Organization 5' }
        ]
      };

      mockApiClient.get
        .mockResolvedValueOnce({
          data: firstPageData,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        } as any)
        .mockResolvedValueOnce({
          data: secondPageData,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        } as any)
        .mockResolvedValueOnce({
          data: finalPageData,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        } as any);

      const result = await (readOrganizations as any).readAllOrganizationsNonTokenized({ pagination: { pageSize: 2 } });

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ id: 'org1', name: 'Organization 1' });
      expect(result[4]).toEqual({ id: 'org5', name: 'Organization 5' });
      expect(mockApiClient.get).toHaveBeenCalledTimes(3);
    });

    it('should handle single page response', async () => {
      const singlePageData = {
        pagination: { offset: 0, pageSize: 25, total: 2 },
        data: [
          { id: 'org1', name: 'Organization 1' },
          { id: 'org2', name: 'Organization 2' }
        ]
      };

      mockApiClient.get.mockResolvedValue({
        data: singlePageData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await readOrganizations.readAllOrganizations();

      expect(result).toHaveLength(2);
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('readOrganizationsByFilterField', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Mock successful single page response
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 3 },
          data: [
            { id: 'org1', name: 'Organization 1' },
            { id: 'org2', name: 'Organization 2' },
            { id: 'org3', name: 'Organization 3' }
          ]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should filter organizations by valid field with multiple values', async () => {
      const result = await readOrganizations.readOrganizationsByFilterField('id', ['org1', 'org2', 'org3']);

      expect(result).toHaveLength(3);
      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'id',
              value: 'org1,org2,org3',
              comparisonOperator: 'in'
            })
          ])
        })
      );
    });

    it('should throw error for invalid filter field', async () => {
      await expect(
        readOrganizations.readOrganizationsByFilterField('invalidField', ['value1', 'value2'])
      ).rejects.toThrow(/Invalid filter field: invalidField/);
      
      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      const result = await readOrganizations.readOrganizationsByFilterField('name', []);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'name',
              value: '',
              comparisonOperator: 'in'
            })
          ])
        })
      );
    });

    it('should handle single-item array', async () => {
      const result = await readOrganizations.readOrganizationsByFilterField('id', ['org1']);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'id',
              value: 'org1',
              comparisonOperator: 'in'
            })
          ])
        })
      );
    });

    it('should merge with existing filters from options', async () => {
      const existingFilter = ReadOrganizations.createFilter({
        field: 'active',
        value: 'true'
      });

      const result = await readOrganizations.readOrganizationsByFilterField(
        'id',
        ['org1', 'org2'],
        { filters: [existingFilter] }
      );

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'id',
              value: 'org1,org2',
              comparisonOperator: 'in'
            }),
            existingFilter
          ])
        })
      );
      // Verify the 'in' filter comes first
      const call = mockQueryBuilder.buildQueryParams.mock.calls[0]?.[0];
      expect(call?.filters?.[0]?.field).toBe('id');
      expect(call?.filters?.[1]).toBe(existingFilter);
    });

    it('should work with valid organization filter fields', async () => {
      // Test a few valid fields to ensure they work (using fields from the mock)
      await readOrganizations.readOrganizationsByFilterField('name', ['Test Org']);
      await readOrganizations.readOrganizationsByFilterField('id', ['12345']);
      await readOrganizations.readOrganizationsByFilterField('active', ['true']);
      
      expect(mockApiClient.get).toHaveBeenCalledTimes(3);
    });
  });

  // Note: Integration tests for actual API calls would require a test environment
  // and are not included here as they would depend on external services
});