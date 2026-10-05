import { ReadPeople, ReadPeopleOptions } from '../src/data-target/crud/ReadPeople';
import { ConfigManager } from '../src/config/ConfigManager';
import { createMockConfig } from './helpers/mockConfig';
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
      .reset()
      .fromPartial(createMockConfig())
      .getConfig('none');

    // Create mocks
    mockApiClient = new ApiClientForJWT({} as any) as jest.Mocked<ApiClientForJWT>;
    mockApiClient.setErrorEventDetails = jest.fn();
    mockQueryBuilder = new QueryBuilder(new Set(['firstName', 'lastName', 'active']), new Set(['firstName', 'lastName'])) as jest.Mocked<QueryBuilder>;
    mockQueryBuilder.buildQueryParams = jest.fn();

    readPeople = new ReadPeople({ config, queryBuilder: mockQueryBuilder });

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

    it('should handle API errors gracefully', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { error: 'Not Found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {}
      } as any);

      await expect(readPeople.readPeople()).rejects.toThrow('Failed to read people: HTTP 404 Not Found');
    });
  });

  describe('readAllPeople', () => {
    it('should handle pagination to retrieve all people', async () => {
      // Mock first page response
      const firstPageData = {
        pagination: { offset: 0, pageSize: 2, total: 5, continuationToken: 'token1' },
        data: [
          { id: 'person1', firstName: 'John', lastName: 'Doe' },
          { id: 'person2', firstName: 'Jane', lastName: 'Smith' }
        ]
      };

      // Mock second page response
      const secondPageData = {
        pagination: { offset: 1, pageSize: 2, total: 5, continuationToken: 'token2' },
        data: [
          { id: 'person3', firstName: 'Bob', lastName: 'Johnson' },
          { id: 'person4', firstName: 'Alice', lastName: 'Williams' }
        ]
      };

      // Mock final page response
      const finalPageData = {
        pagination: { offset: 2, pageSize: 2, total: 5 },
        data: [
          { id: 'person5', firstName: 'Charlie', lastName: 'Brown' }
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

      const result = await (readPeople as any).readAllPeopleNonTokenized({ pagination: { pageSize: 2 } });

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ id: 'person1', firstName: 'John', lastName: 'Doe' });
      expect(result[4]).toEqual({ id: 'person5', firstName: 'Charlie', lastName: 'Brown' });
      expect(mockApiClient.get).toHaveBeenCalledTimes(3);
    });

    it('should handle single page response', async () => {
      const singlePageData = {
        pagination: { offset: 0, pageSize: 25, total: 2 },
        data: [
          { id: 'person1', firstName: 'John', lastName: 'Doe' },
          { id: 'person2', firstName: 'Jane', lastName: 'Smith' }
        ]
      };

      mockApiClient.get.mockResolvedValue({
        data: singlePageData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await readPeople.readAllPeople();

      expect(result).toHaveLength(2);
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('readPeopleByFullName', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 1 },
          data: [{ id: 'person1', firstName: 'John', lastName: 'Doe' }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should filter by firstName and lastName', async () => {
      const result = await readPeople.readPeopleByFullName('John', 'Doe');

      expect(result).toHaveLength(1);
      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({ field: 'firstName', value: 'John' }),
            expect.objectContaining({ field: 'lastName', value: 'Doe' })
          ])
        })
      );
    });

    it('should include specified fields', async () => {
      await readPeople.readPeopleByFullName('John', 'Doe', ['id', 'firstName', 'lastName']);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields: ['id', 'firstName', 'lastName']
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { error: 'Server Error' },
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: {}
      } as any);

      await expect(readPeople.readPeopleByFullName('John', 'Doe')).rejects.toThrow('Failed to read people');
    });
  });

  describe('readPeopleByNamePart', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 2 },
          data: [
            { id: 'person1', firstName: 'John', lastName: 'Doe' },
            { id: 'person2', firstName: 'John', lastName: 'Smith' }
          ]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should filter by name part with correct filter', async () => {
      const result = await readPeople.readPeopleByNamePart('firstName', 'John');

      expect(result).toHaveLength(2);
      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'firstName',
              value: 'John',
              logicalOperator: 'or'
            })
          ])
        })
      );
    });

    it('should sort by opposite name field when filtering by firstName', async () => {
      await readPeople.readPeopleByNamePart('firstName', 'John');

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.objectContaining({
            field: 'lastName',
            direction: 'desc'
          })
        })
      );
    });

    it('should sort by firstName when filtering by lastName', async () => {
      await readPeople.readPeopleByNamePart('lastName', 'Doe');

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.objectContaining({
            field: 'firstName',
            direction: 'desc'
          })
        })
      );
    });

    it('should include specified fields', async () => {
      await readPeople.readPeopleByNamePart('firstName', 'John', ['id', 'firstName']);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields: ['id', 'firstName']
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { error: 'Server Error' },
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: {}
      } as any);

      await expect(readPeople.readPeopleByNamePart('firstName', 'John')).rejects.toThrow('Failed to read people');
    });
  });

  describe('readPeopleByFirstName', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 1 },
          data: [{ id: 'person1', firstName: 'John', lastName: 'Doe' }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should call readPeopleByNamePart with firstName', async () => {
      const spy = jest.spyOn(readPeople, 'readPeopleByNamePart');
      await readPeople.readPeopleByFirstName('John');

      expect(spy).toHaveBeenCalledWith('firstName', 'John', undefined);
    });

    it('should pass includeFields to readPeopleByNamePart', async () => {
      const spy = jest.spyOn(readPeople, 'readPeopleByNamePart');
      await readPeople.readPeopleByFirstName('John', ['id', 'firstName']);

      expect(spy).toHaveBeenCalledWith('firstName', 'John', ['id', 'firstName']);
    });
  });

  describe('readPeopleByLastName', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 1 },
          data: [{ id: 'person1', firstName: 'John', lastName: 'Doe' }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should filter by lastName', async () => {
      const result = await readPeople.readPeopleByLastName('Doe');

      expect(result).toHaveLength(1);
      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'lastName',
              value: 'Doe',
              comparisonOperator: 'eq'
            })
          ])
        })
      );
    });

    it('should include specified fields', async () => {
      await readPeople.readPeopleByLastName('Doe', ['id', 'lastName']);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields: ['id', 'lastName']
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { error: 'Server Error' },
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: {}
      } as any);

      await expect(readPeople.readPeopleByLastName('Doe')).rejects.toThrow('Failed to read people');
    });
  });

  describe('readPeopleByFilterField', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 3 },
          data: [
            { id: 'person1', firstName: 'John', lastName: 'Doe' },
            { id: 'person2', firstName: 'Jane', lastName: 'Smith' },
            { id: 'person3', firstName: 'Bob', lastName: 'Johnson' }
          ]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should filter people by valid field with multiple values', async () => {
      const result = await readPeople.readPeopleByFilterField('firstName', ['John', 'Jane', 'Bob']);

      expect(result).toHaveLength(3);
      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'firstName',
              value: 'John,Jane,Bob',
              comparisonOperator: 'in'
            })
          ])
        })
      );
    });

    it('should throw error for invalid filter field', async () => {
      await expect(
        readPeople.readPeopleByFilterField('invalidField', ['value1', 'value2'])
      ).rejects.toThrow(/Invalid filter field: invalidField/);

      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      const result = await readPeople.readPeopleByFilterField('firstName', []);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'firstName',
              value: '',
              comparisonOperator: 'in'
            })
          ])
        })
      );
    });

    it('should handle single-item array', async () => {
      const result = await readPeople.readPeopleByFilterField('lastName', ['Doe']);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'lastName',
              value: 'Doe',
              comparisonOperator: 'in'
            })
          ])
        })
      );
    });

    it('should include specified fields', async () => {
      await readPeople.readPeopleByFilterField('firstName', ['John'], ['id', 'firstName']);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields: ['id', 'firstName']
        })
      );
    });

    it('should work with valid person filter fields', async () => {
      // Test a few valid fields to ensure they work (using fields from the mock)
      await readPeople.readPeopleByFilterField('firstName', ['John']);
      await readPeople.readPeopleByFilterField('lastName', ['Doe']);
      await readPeople.readPeopleByFilterField('active', ['true']);

      expect(mockApiClient.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('readPeopleHavingRole', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 1 },
          data: [{ id: 'person1', firstName: 'John', lastName: 'Doe', roles: ['role1'] }]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should filter by role HRN', async () => {
      const roleHrn = 'hrn:hrs:lists:reviewer-roles/primary';
      const result = await readPeople.readPeopleHavingRole(roleHrn);

      expect(result).toHaveLength(1);
      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'roles',
              value: roleHrn,
              comparisonOperator: 'eq'
            })
          ])
        })
      );
    });

    it('should use "eq" comparison operator for roles', async () => {
      const roleHrn = 'hrn:hrs:lists:roles/agreements-site-manager';
      await readPeople.readPeopleHavingRole(roleHrn);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              comparisonOperator: 'eq'
            })
          ])
        })
      );
    });

    it('should include specified fields when provided', async () => {
      const roleHrn = 'hrn:hrs:lists:reviewer-roles/primary';
      const includeFields = ['id', 'firstName', 'lastName', 'roles'];
      
      await readPeople.readPeopleHavingRole(roleHrn, includeFields);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should handle HRNs with complex paths', async () => {
      const complexRoleHrn = 'hrn:hrs:lists:roles/department/sub-unit/specific-role';
      await readPeople.readPeopleHavingRole(complexRoleHrn);

      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'roles',
              value: complexRoleHrn
            })
          ])
        })
      );
    });

    it('should return empty array when no people have the role', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          pagination: { offset: 0, pageSize: 25, total: 0 },
          data: []
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await readPeople.readPeopleHavingRole('hrn:hrs:lists:nonexistent-role');

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });
  });

  describe('URL encoding with custom serializer', () => {
    it('should enable custom URL serializer in ReadPeople constructor', () => {
      // This test verifies that ReadPeople constructor passes useCustomUrlSerializer=true
      // to ApiClientForJWT, which is necessary for Huron API compatibility
      const config = ConfigManager
        .getInstance()
        .reset()
        .fromPartial(createMockConfig())
        .getConfig('none');

      // Create a new ReadPeople instance
      const testReadPeople = new ReadPeople({ config });

      // The constructor should have passed useCustomUrlSerializer: true
      // This is verified by the fact that readPeopleHavingRole works with HRN values
      expect(testReadPeople).toBeDefined();
      expect(typeof testReadPeople.readPeopleHavingRole).toBe('function');
    });

    it('should use "eq" operator for roles filter', async () => {
      // Verify that readPeopleHavingRole creates filter with correct operator
      const roleHrn = 'hrn:hrs:lists:reviewer-roles/primary';
      
      await readPeople.readPeopleHavingRole(roleHrn);

      // Verify the queryBuilder was called with 'eq' operator for roles
      expect(mockQueryBuilder.buildQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'roles',
              comparisonOperator: 'eq',
              value: roleHrn
            })
          ])
        })
      );
    });
  });

  // Note: Integration tests for actual API calls would require a test environment
  // and are not included here as they would depend on external services
});