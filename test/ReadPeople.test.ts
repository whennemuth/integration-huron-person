import { ReadPeople, ReadPeopleOptions, FilterSpec, SortSpec } from '../src/data-target/crud/ReadPeople';
import { ConfigManager } from '../src/config/ConfigManager';
import { ApiClientForJWT } from '../src/data-target/ApiClientForJWT';

// Mock the ApiClientForJWT
jest.mock('../src/data-target/ApiClientForJWT');

describe('ReadPeople', () => {
  let readPeople: ReadPeople;
  let mockApiClient: jest.Mocked<ApiClientForJWT>;

  beforeAll(() => {
    const config = ConfigManager
      .getInstance()
      .fromEnvironment()
      .fromFileSystem()
      .getConfig();

    // Create a mock instance
    mockApiClient = new ApiClientForJWT({} as any) as jest.Mocked<ApiClientForJWT>;
    readPeople = new ReadPeople(config);

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
      const filter = ReadPeople.createFilter('firstName', 'John');

      expect(filter).toEqual({
        field: 'firstName',
        logicalOperator: 'and',
        comparisonOperator: 'eq',
        value: 'John',
        priority: 0
      });
    });

    it('should create a filter specification with custom values', () => {
      const filter = ReadPeople.createFilter('lastName', 'Doe', 1, 'or', 'neq');

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
      const sort = ReadPeople.createSort('firstName');

      expect(sort).toEqual({
        field: 'firstName',
        direction: 'desc'
      });
    });

    it('should create a sort specification with custom direction', () => {
      const sort = ReadPeople.createSort('lastName', 'asc');

      expect(sort).toEqual({
        field: 'lastName',
        direction: 'asc'
      });
    });
  });

  describe('buildQueryParams', () => {
    it('should build empty params for empty options', async () => {
      await readPeople.readPeople({});

      expect(mockApiClient.get).toHaveBeenCalledWith({
        url: '/api/v2/persons',
        params: {}
      });
    });

    it('should build pagination parameters', async () => {
      const options: ReadPeopleOptions = {
        pagination: {
          offset: 10,
          pageSize: 50,
          continuationToken: 'token123'
        }
      };

      await readPeople.readPeople(options);

      expect(mockApiClient.get).toHaveBeenCalledWith({
        url: '/api/v2/persons',
        params: {
          'pagination[offset]': 10,
          'pagination[pageSize]': 50,
          'pagination[continuationToken]': 'token123'
        }
      });
    });

    it('should build sort parameters', async () => {
      const options: ReadPeopleOptions = {
        sort: ReadPeople.createSort('firstName', 'asc')
      };

      await readPeople.readPeople(options);

      expect(mockApiClient.get).toHaveBeenCalledWith({
        url: '/api/v2/persons',
        params: {
          sort: '-firstName'
        }
      });
    });

    it('should build filter parameters', async () => {
      const options: ReadPeopleOptions = {
        filters: [
          ReadPeople.createFilter('firstName', 'John', 0, 'and', 'eq'),
          ReadPeople.createFilter('lastName', 'Doe', 1, 'or', 'neq')
        ]
      };

      await readPeople.readPeople(options);

      expect(mockApiClient.get).toHaveBeenCalledWith({
        url: '/api/v2/persons',
        params: {
          'filter[0!firstName!and]': 'eq:John',
          'filter[1!lastName!or]': 'neq:Doe'
        }
      });
    });

    it('should build include fields parameters', async () => {
      const options: ReadPeopleOptions = {
        includeFields: ['firstName', 'lastName', 'contactInformation.email']
      };

      await readPeople.readPeople(options);

      expect(mockApiClient.get).toHaveBeenCalledWith({
        url: '/api/v2/persons',
        params: {
          include: 'firstName,lastName,contactInformation.email'
        }
      });
    });

    it('should build combined parameters', async () => {
      const options: ReadPeopleOptions = {
        pagination: { pageSize: 25 },
        sort: ReadPeople.createSort('lastName', 'desc'),
        filters: [ReadPeople.createFilter('active', 'true')],
        includeFields: ['firstName', 'lastName']
      };

      await readPeople.readPeople(options);

      expect(mockApiClient.get).toHaveBeenCalledWith({
        url: '/api/v2/persons',
        params: {
          'pagination[pageSize]': 25,
          sort: 'lastName',
          'filter[0!active!and]': 'eq:true',
          include: 'firstName,lastName'
        }
      });
    });
  });

  // Note: Integration tests for actual API calls would require a test environment
  // and are not included here as they would depend on external services
});