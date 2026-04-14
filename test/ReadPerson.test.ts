import { ReadPerson } from '../src/data-target/crud/ReadPerson';
import { ConfigManager } from '../src/config/ConfigManager';
import { createMockConfig } from './helpers/mockConfig';
import { ApiClientForJWT } from '../src/data-target/ApiClientForJWT';
import { ReadPeople } from '../src/data-target/crud/ReadPeople';
import { HuronPerson } from '../src/data-target/crud/Person';
import { QueryBuilder } from '../src/data-target/QueryBuilder';

// Mock the dependencies
jest.mock('../src/data-target/ApiClientForJWT');
jest.mock('../src/data-target/crud/ReadPeople');

describe('ReadPerson', () => {
  let readPerson: ReadPerson;
  let mockApiClient: jest.Mocked<ApiClientForJWT>;
  let mockReadPeople: jest.Mocked<ReadPeople>;

  beforeAll(() => {
    const config = ConfigManager
      .getInstance()
      .reset()
      .fromPartial(createMockConfig())
      .getConfig('none');

    readPerson = new ReadPerson(config);

    // Create mocks
    mockApiClient = new ApiClientForJWT({} as any) as jest.Mocked<ApiClientForJWT>;
    mockReadPeople = new ReadPeople(config) as jest.Mocked<ReadPeople>;

    // Replace the private apiClient with our mock
    (readPerson as any).apiClient = mockApiClient;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readPersonByHRN', () => {
    const mockPersonData: HuronPerson = {
      id: 'person1',
      hrn: 'hrn:hrs:persons:12345',
      firstName: 'John',
      lastName: 'Doe'
    } as HuronPerson;

    beforeEach(() => {
      mockApiClient.get.mockResolvedValue({
        data: { data: mockPersonData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);
    });

    it('should convert numeric string to full HRN format', async () => {
      await readPerson.readPersonByHRN('12345');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v2/persons/hrn%3Ahrs%3Apersons%3A12345',
          params: { includeFields: undefined }
        })
      );
    });

    it('should pass through full HRN unchanged', async () => {
      await readPerson.readPersonByHRN('hrn:hrs:persons:67890');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v2/persons/hrn%3Ahrs%3Apersons%3A67890',
          params: { includeFields: undefined }
        })
      );
    });

    it('should URL encode HRN with special characters', async () => {
      await readPerson.readPersonByHRN('hrn:hrs:persons:test@example');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v2/persons/hrn%3Ahrs%3Apersons%3Atest%40example'
        })
      );
    });

    it('should return single person object from response', async () => {
      const result = await readPerson.readPersonByHRN('12345');

      expect(result).toEqual(mockPersonData);
      expect(Array.isArray(result)).toBe(false);
    });

    it('should pass includeFields parameter to API call', async () => {
      await readPerson.readPersonByHRN('12345', ['id', 'firstName', 'lastName']);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { includeFields: ['id', 'firstName', 'lastName'] }
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

      await expect(readPerson.readPersonByHRN('12345')).rejects.toThrow(
        'Failed to read person hrn:hrs:persons:12345: HTTP 404 Not Found'
      );
    });

    it('should handle API call failure gracefully', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(readPerson.readPersonByHRN('12345')).rejects.toThrow(
        'Failed to read person hrn:hrs:persons:12345'
      );
    });
  });

  describe('readPersonById', () => {
    const mockPersonArray: HuronPerson[] = [
      { id: 'person1', firstName: 'John', lastName: 'Doe' } as HuronPerson
    ];
    let mockReadAllPeople: jest.Mock;

    beforeEach(() => {
      mockReadAllPeople = jest.fn().mockResolvedValue(mockPersonArray);
      
      // Mock the ReadPeople class and its static method
      (ReadPeople as jest.MockedClass<typeof ReadPeople>).mockImplementation(() => {
        return {
          readAllPeople: mockReadAllPeople
        } as any;
      });
      
      // Mock the static createFilter method
      (ReadPeople.createFilter as jest.Mock) = jest.fn((filter) => ({
        ...filter,
        logicalOperator: filter.logicalOperator || 'and',
        comparisonOperator: filter.comparisonOperator || 'eq',
        priority: filter.priority || 0
      }));
    });

    it('should call readPersonBySingleFilter with id field', async () => {
      const result = await readPerson.readPersonById('person123');

      expect(result).toEqual(mockPersonArray);
      expect(ReadPeople).toHaveBeenCalled();
      expect(mockReadAllPeople).toHaveBeenCalled();
    });

    it('should pass includeFields to readPersonBySingleFilter', async () => {
      const includeFields = ['id', 'firstName', 'lastName'];
      await readPerson.readPersonById('person123', includeFields);

      expect(mockReadAllPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should verify correct filter field is used', async () => {
      await readPerson.readPersonById('person123');

      expect(ReadPeople.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'id',
          value: 'person123'
        })
      );
      expect(mockReadAllPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'id',
              value: 'person123'
            })
          ])
        })
      );
    });

    it('should handle errors with method-specific message', async () => {
      mockReadAllPeople.mockRejectedValue(new Error('API error'));

      await expect(readPerson.readPersonById('person123')).rejects.toThrow(
        'Failed to read person by id person123'
      );
    });

    it('should return array of persons', async () => {
      const result = await readPerson.readPersonById('person123');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('readPersonByEmail', () => {
    const mockPersonArray: HuronPerson[] = [
      { id: 'person1', firstName: 'John', lastName: 'Doe', contactInformation: { email: 'john@example.com' } } as any
    ];
    let mockReadAllPeople: jest.Mock;

    beforeEach(() => {
      mockReadAllPeople = jest.fn().mockResolvedValue(mockPersonArray);
      
      (ReadPeople as jest.MockedClass<typeof ReadPeople>).mockImplementation(() => {
        return {
          readAllPeople: mockReadAllPeople
        } as any;
      });
      
      (ReadPeople.createFilter as jest.Mock) = jest.fn((filter) => ({
        ...filter,
        logicalOperator: filter.logicalOperator || 'and',
        comparisonOperator: filter.comparisonOperator || 'eq',
        priority: filter.priority || 0
      }));
    });

    it('should call readPersonBySingleFilter with contactInformation.email field', async () => {
      const result = await readPerson.readPersonByEmail('john@example.com');

      expect(result).toEqual(mockPersonArray);
      expect(ReadPeople.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'contactInformation.email',
          value: 'john@example.com'
        })
      );
      expect(mockReadAllPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'contactInformation.email',
              value: 'john@example.com'
            })
          ])
        })
      );
    });

    it('should pass includeFields to readPersonBySingleFilter', async () => {
      const includeFields = ['id', 'contactInformation.email'];
      await readPerson.readPersonByEmail('john@example.com', includeFields);

      expect(mockReadAllPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should handle errors with method-specific message', async () => {
      mockReadAllPeople.mockRejectedValue(new Error('API error'));

      await expect(readPerson.readPersonByEmail('john@example.com')).rejects.toThrow(
        'Failed to read person by email john@example.com'
      );
    });

    it('should return array of persons', async () => {
      const result = await readPerson.readPersonByEmail('john@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('readPersonByUserId', () => {
    const mockPersonArray: HuronPerson[] = [
      { id: 'person1', userId: 'user123', firstName: 'John', lastName: 'Doe' } as HuronPerson
    ];
    let mockReadAllPeople: jest.Mock;

    beforeEach(() => {
      mockReadAllPeople = jest.fn().mockResolvedValue(mockPersonArray);
      
      (ReadPeople as jest.MockedClass<typeof ReadPeople>).mockImplementation(() => {
        return {
          readAllPeople: mockReadAllPeople
        } as any;
      });
      
      (ReadPeople.createFilter as jest.Mock) = jest.fn((filter) => ({
        ...filter,
        logicalOperator: filter.logicalOperator || 'and',
        comparisonOperator: filter.comparisonOperator || 'eq',
        priority: filter.priority || 0
      }));
    });

    it('should call readPersonBySingleFilter with userId field', async () => {
      const result = await readPerson.readPersonByUserId('user123');

      expect(result).toEqual(mockPersonArray);
      expect(ReadPeople.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'userId',
          value: 'user123'
        })
      );
      expect(mockReadAllPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              field: 'userId',
              value: 'user123'
            })
          ])
        })
      );
    });

    it('should pass includeFields to readPersonBySingleFilter', async () => {
      const includeFields = ['id', 'userId'];
      await readPerson.readPersonByUserId('user123', includeFields);

      expect(mockReadAllPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should handle errors with method-specific message', async () => {
      mockReadAllPeople.mockRejectedValue(new Error('API error'));

      await expect(readPerson.readPersonByUserId('user123')).rejects.toThrow(
        'Failed to read person by userId user123'
      );
    });

    it('should return array of persons', async () => {
      const result = await readPerson.readPersonByUserId('user123');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('readPersonBySourceIdentifier', () => {
    const mockPersonArray: HuronPerson[] = [
      { id: 'person1', sourceIdentifier: 'source123', firstName: 'John', lastName: 'Doe' } as HuronPerson
    ];
    let mockReadAllPeople: jest.Mock;

    beforeEach(() => {
      mockReadAllPeople = jest.fn().mockResolvedValue(mockPersonArray);
      
      (ReadPeople as jest.MockedClass<typeof ReadPeople>).mockImplementation(() => {
        return {
          readAllPeople: mockReadAllPeople
        } as any;
      });
      
      (ReadPeople.createFilter as jest.Mock) = jest.fn((filter) => ({
        ...filter,
        logicalOperator: filter.logicalOperator || 'and',
        comparisonOperator: filter.comparisonOperator || 'eq',
        priority: filter.priority || 0
      }));
    });

    it('should call readPersonBySingleFilter with sourceIdentifier field', async () => {
      const result = await readPerson.readPersonBySourceIdentifier('source123');

      expect(result).toEqual(mockPersonArray);
      expect(ReadPeople.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          field: 'sourceIdentifier',
          value: 'source123'
        })
      );
      expect(mockReadAllPeople).toHaveBeenCalledWith(
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

    it('should pass includeFields to readPersonBySingleFilter', async () => {
      const includeFields = ['id', 'sourceIdentifier'];
      await readPerson.readPersonBySourceIdentifier('source123', includeFields);

      expect(mockReadAllPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFields
        })
      );
    });

    it('should handle errors with method-specific message', async () => {
      mockReadAllPeople.mockRejectedValue(new Error('API error'));

      await expect(readPerson.readPersonBySourceIdentifier('source123')).rejects.toThrow(
        'Failed to read person by sourceIdentifier source123'
      );
    });

    it('should return array of persons', async () => {
      const result = await readPerson.readPersonBySourceIdentifier('source123');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });
});
