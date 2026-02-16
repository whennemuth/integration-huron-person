import { ReadPeople, ReadPeopleOptions } from '../src/data-target/crud/ReadPeople';
import { ConfigManager } from '../src/config/ConfigManager';
import { ApiClientForJWT } from '../src/data-target/ApiClientForJWT';
import { QueryBuilder } from '../src/data-target/QueryBuilder';

// Mock the ApiClientForJWT
jest.mock('../src/data-target/ApiClientForJWT');

describe('ReadPeople', () => {
  let readPeople: ReadPeople;
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
    mockQueryBuilder = new QueryBuilder(new Set(['firstName', 'lastName', 'active']), new Set(['firstName', 'lastName'])) as jest.Mocked<QueryBuilder>;
    mockQueryBuilder.buildQueryParams = jest.fn();

    readPeople = new ReadPeople(config, mockQueryBuilder);

    // Replace the private apiClient with our mock
    (readPeople as any).apiClient = mockApiClient;
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
      const filter = ReadPeople.createFilter({ field: 'firstName', value: 'John' });

      expect(filter).toEqual({
        field: 'firstName',
        logicalOperator: 'and',
        comparisonOperator: 'eq',
        value: 'John',
        priority: 0
      });
    });

    it('should create a filter specification with custom values', () => {
      const filter = ReadPeople.createFilter({ field: 'lastName', value: 'Doe', priority: 1, logicalOperator: 'or', comparisonOperator: 'neq' });

      expect(filter).toEqual({
        field: 'lastName',
        logicalOperator: 'or',
        comparisonOperator: 'neq',
        value: 'Doe',
        priority: 1
      });
    });
  });

  describe('createSort', () => {
    it('should create a sort specification with default direction', () => {
      const sort = ReadPeople.createSort({ field: 'firstName' });

      expect(sort).toEqual({
        field: 'firstName',
        direction: 'desc'
      });
    });

    it('should create a sort specification with custom direction', () => {
      const sort = ReadPeople.createSort({ field: 'lastName', direction: 'asc' });

      expect(sort).toEqual({
        field: 'lastName',
        direction: 'asc'
      });
    });
  });

  describe('readPeople', () => {
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
      const options: ReadPeopleOptions = { pagination: { pageSize: 10 } };
      await readPeople.readPeople(options);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(options);
    });

    it('should return the response data from apiClient.get', async () => {
      const mockResponseData = {
        pagination: { offset: 0, pageSize: 25, total: 100 },
        data: [{ id: 'person1', firstName: 'John' }],
        links: { next: 'http://example.com/next' }
      };
      mockApiClient.get.mockResolvedValue({
        data: mockResponseData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await readPeople.readPeople();

      expect(result).toEqual(mockResponseData);
    });
  });

  // Note: Integration tests for actual API calls would require a test environment
  // and are not included here as they would depend on external services
});