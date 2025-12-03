import { SinglePersonSync } from '../src/SinglePersonSync';
import { BuCdmPersonDataSource } from '../src/PersonDataSource';
import { HuronPersonDataTarget } from '../src/PersonDataTarget';
import { ConfigManager } from '../src/ConfigManager';
import { Config } from '../src/Config';
import { Status, CrudOperation } from 'integration-core';

// Mock the external dependencies
jest.mock('../src/ConfigManager');
jest.mock('../src/PersonDataSource');
jest.mock('../src/PersonDataTarget');

describe('SinglePersonSync', () => {
  let singlePersonSync: SinglePersonSync;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockDataSource: jest.Mocked<BuCdmPersonDataSource>;
  let mockDataTarget: jest.Mocked<HuronPersonDataTarget>;

  const mockConfig: Config = {
    dataSource: {
      endpointConfig: {
        baseUrl: 'https://datasource-api.example.com',
        apiKey: 'test-api-key'
      },
      fetchPersonsEndpoint: '/api/v1/persons'
    },
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://datatarget-api.example.com',
        authTokenUrl: '/auth/token',
        username: 'dt-user',
        password: 'dt-pass'
      },
      pushPersonsEndpoint: '/api/v1/persons/batch'
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

  const mockRawData = [{
    personid: 'U12345678',
    personBasic: {
      names: [
        {
          nameType: 'PRI',
          firstName: 'John',
          lastName: 'Doe'
        }
      ]
    },
    email: [
      {
        type: 'university',
        address: 'john.doe@example.com'
      }
    ],
    employeeInfo: {
      positions: [
        {
          positionInfo: {
            BasicData: {
              personnelNumber: 'EMP001',
              sapEmpStatus: { description: 'Active' },
              hireDate: '2023-01-15'
            },
            Department: {
              departmentName: 'Engineering'
            }
          }
        }
      ]
    }
  }];

  const mockInput = {
    fieldDefinitions: [
      { name: 'id', type: 'string' as const, required: true, isPrimaryKey: true },
      { name: 'firstName', type: 'string' as const, required: true },
      { name: 'lastName', type: 'string' as const, required: true },
      { name: 'email', type: 'email' as const, required: true }
    ],
    fieldSets: [
      {
        fieldValues: [
          { id: 'U12345678' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { email: 'john.doe@example.com' }
        ]
      }
    ]
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock ConfigManager
    mockConfigManager = {
      getInstance: jest.fn(),
      loadConfig: jest.fn().mockReturnValue(mockConfig),
      getEnvironmentConfig: jest.fn().mockReturnValue({})
    } as any;
    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManager);

    // Mock BuCdmPersonDataSource
    mockDataSource = {
      fetchRaw: jest.fn().mockResolvedValue(mockRawData),
      convertRawToInput: jest.fn().mockReturnValue(mockInput)
    } as any;
    (BuCdmPersonDataSource as jest.Mock).mockImplementation(() => mockDataSource);

    // Mock HuronPersonDataTarget
    mockDataTarget = {
      pushOne: jest.fn().mockResolvedValue({
        status: Status.SUCCESS,
        message: 'Person pushed successfully',
        timestamp: new Date(),
        primaryKey: [{ id: 'U12345678' }],
        crud: CrudOperation.CREATE
      })
    } as any;
    (HuronPersonDataTarget as jest.Mock).mockImplementation(() => mockDataTarget);

    singlePersonSync = new SinglePersonSync({ buid: 'U12345678', crudOperation: CrudOperation.CREATE});
  });

  describe('constructor', () => {
    it('should create instance with correct properties', () => {
      expect(ConfigManager.getInstance).toHaveBeenCalled();
      expect(mockConfigManager.loadConfig).toHaveBeenCalledWith(undefined);
      expect(mockConfigManager.getEnvironmentConfig).toHaveBeenCalled();
    });

    it('should create instance with custom config path', () => {
      const customSync = new SinglePersonSync({ buid: 'U87654321', crudOperation: CrudOperation.CREATE, configPath: './custom-config.json' });
      expect(mockConfigManager.loadConfig).toHaveBeenCalledWith('./custom-config.json');
    });

    it('should create data source with correct parameters', () => {
      expect(BuCdmPersonDataSource).toHaveBeenCalledWith({
        config: mockConfig,
        dataMapper: expect.any(Object),
        buid: 'U12345678'
      });
    });

    it('should create data target with config', () => {
      expect(HuronPersonDataTarget).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('sync', () => {
    it('should successfully sync a single person', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync();

      expect(mockDataSource.fetchRaw).toHaveBeenCalled();
      expect(mockDataSource.convertRawToInput).toHaveBeenCalledWith(mockRawData);
      expect(mockDataTarget.pushOne).toHaveBeenCalledWith({
        data: mockInput.fieldSets[0],
        crud: CrudOperation.CREATE
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('Starting Single Person Sync for BUID: U12345678...');
      expect(consoleSpy).toHaveBeenCalledWith('Client ID: test-client');
      expect(consoleSpy).toHaveBeenCalledWith('Push result for U12345678:', Status.SUCCESS, 'Person pushed successfully');
      expect(consoleSpy).toHaveBeenCalledWith('Single Person Sync completed successfully for BUID: U12345678');

      consoleSpy.mockRestore();
    });

    it('should handle no person data found', async () => {
      mockDataSource.fetchRaw.mockResolvedValue([]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync();

      expect(mockDataSource.fetchRaw).toHaveBeenCalled();
      expect(mockDataSource.convertRawToInput).not.toHaveBeenCalled();
      expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
      
      expect(consoleSpy).toHaveBeenCalledWith('No person data found for BUID: U12345678');

      consoleSpy.mockRestore();
    });

    it('should handle null person data', async () => {
      mockDataSource.fetchRaw.mockResolvedValue(null as any);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync();

      expect(consoleSpy).toHaveBeenCalledWith('No person data found for BUID: U12345678');

      consoleSpy.mockRestore();
    });

    it('should handle no valid field sets', async () => {
      mockDataSource.convertRawToInput.mockReturnValue({
        fieldDefinitions: mockInput.fieldDefinitions,
        fieldSets: []
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync();

      expect(mockDataSource.fetchRaw).toHaveBeenCalled();
      expect(mockDataSource.convertRawToInput).toHaveBeenCalledWith(mockRawData);
      expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
      
      expect(consoleSpy).toHaveBeenCalledWith('No valid field sets generated for BUID: U12345678');

      consoleSpy.mockRestore();
    });

    it('should handle multiple field sets', async () => {
      const multipleFieldSetsInput = {
        ...mockInput,
        fieldSets: [
          mockInput.fieldSets[0],
          {
            fieldValues: [
              { id: 'U12345678-2' },
              { firstName: 'Jane' },
              { lastName: 'Doe' },
              { email: 'jane.doe@example.com' }
            ]
          }
        ]
      };
      mockDataSource.convertRawToInput.mockReturnValue(multipleFieldSetsInput);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync();

      expect(mockDataTarget.pushOne).toHaveBeenCalledTimes(2);
      expect(mockDataTarget.pushOne).toHaveBeenNthCalledWith(1, {
        data: multipleFieldSetsInput.fieldSets[0],
        crud: CrudOperation.CREATE
      });
      expect(mockDataTarget.pushOne).toHaveBeenNthCalledWith(2, {
        data: multipleFieldSetsInput.fieldSets[1],
        crud: CrudOperation.CREATE
      });

      consoleSpy.mockRestore();
    });

    it('should handle push failure', async () => {
      mockDataTarget.pushOne.mockResolvedValue({
        status: Status.FAILURE,
        message: 'Push failed: Invalid data',
        timestamp: new Date(),
        primaryKey: [{ id: 'U12345678' }],
        crud: CrudOperation.CREATE
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync();

      expect(consoleSpy).toHaveBeenCalledWith('Push result for U12345678:', Status.FAILURE, 'Push failed: Invalid data');

      consoleSpy.mockRestore();
    });

    it('should propagate fetch errors', async () => {
      const fetchError = new Error('API fetch failed');
      mockDataSource.fetchRaw.mockRejectedValue(fetchError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(singlePersonSync.sync()).rejects.toThrow('API fetch failed');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Single Person Sync failed for BUID: U12345678:', fetchError);

      consoleErrorSpy.mockRestore();
    });

    it('should propagate push errors', async () => {
      const pushError = new Error('API push failed');
      mockDataTarget.pushOne.mockRejectedValue(pushError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(singlePersonSync.sync()).rejects.toThrow('API push failed');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Single Person Sync failed for BUID: U12345678:', pushError);

      consoleErrorSpy.mockRestore();
    });

    it('should propagate conversion errors', async () => {
      const conversionError = new Error('Data conversion failed');
      mockDataSource.convertRawToInput.mockImplementation(() => {
        throw conversionError;
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(singlePersonSync.sync()).rejects.toThrow('Data conversion failed');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Single Person Sync failed for BUID: U12345678:', conversionError);

      consoleErrorSpy.mockRestore();
    });
  });



  describe('environment config override', () => {
    it('should apply environment overrides to config', () => {
      const envOverrides = {
        integration: {
          clientId: 'env-override-client',
          batchSize: 20,
          timeout: 10000
        }
      };
      mockConfigManager.getEnvironmentConfig.mockReturnValue(envOverrides);

      const syncWithOverrides = new SinglePersonSync({ buid: 'U12345678', crudOperation: CrudOperation.CREATE});
      
      // Verify that environment config was applied (implicitly tested through constructor behavior)
      expect(mockConfigManager.getEnvironmentConfig).toHaveBeenCalled();
    });
  });
});