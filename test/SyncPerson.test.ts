import { SinglePersonSync, SinglePersonSyncParams } from '../src/SyncPerson';
import { BuCdmPersonDataSource } from '../src/data-source/PersonDataSource';
import { HuronPersonDataTarget } from '../src/data-target/PersonDataTarget';
import { ConfigManager } from '../src/config/ConfigManager';
import { _fieldDefinitions, DataMapper } from '../src/data-mapper/DataMapper';
import { Config } from '../src/config/Config';
import { Status, CrudOperation, DynamoDBDeltaStorage } from 'integration-core';
import { BuCdmCurrentTermsDataSource, Term } from '../src/data-source/CurrentTermsDataSource';
import { ReadPerson } from '../src/data-target/crud/ReadPerson';
import { DeltaStrategyFactory } from '../src/delta-strategy/DeltaStrategyFactory';
import * as SyncEvaluator from '../src/delta-storage/SyncEvaluator';

// Mock the external dependencies
jest.mock('../src/config/ConfigManager');
jest.mock('../src/data-source/PersonDataSource');
jest.mock('../src/data-target/PersonDataTarget');
jest.mock('../src/data-mapper/DataMapper');
jest.mock('../src/data-source/CurrentTermsDataSource');
jest.mock('../src/data-target/crud/ReadPerson');
jest.mock('../src/delta-strategy/DeltaStrategyFactory');

describe('SinglePersonSync', () => {
  let singlePersonSync: SinglePersonSync;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockDataSource: jest.Mocked<BuCdmPersonDataSource>;
  let mockDataTarget: jest.Mocked<HuronPersonDataTarget>;
  let mockDataMapper: jest.Mocked<DataMapper>;
  let mockCurrentTermsDataSource: jest.Mocked<BuCdmCurrentTermsDataSource>;

  const mockCurrentTerms: Term[] = [
    {
      term: '2261',
      termDescription: 'Spring 2026',
      academicCareer: 'GRAD',
      termBeginDate: '20260120',
      termEndDate: '20260508',
      currentInd: 'Y'
    }
  ];

  const mockConfig: Config = {
    landscape: 'test',
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

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock ConfigManager
    mockConfigManager = {
      getInstance: jest.fn(),
      reset: jest.fn().mockReturnThis(),
      fromFileSystem: jest.fn().mockReturnThis(),
      fromEnvironment: jest.fn().mockReturnThis(),
      getConfig: jest.fn().mockReturnValue(mockConfig)
    } as any;
    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManager);

    // Mock BuCdmPersonDataSource
    mockDataSource = {
      fetchRaw: jest.fn().mockResolvedValue(mockRawData)
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
    (HuronPersonDataTarget as unknown as jest.Mock).mockImplementation(() => mockDataTarget);
    (HuronPersonDataTarget as any).convertFieldSetToRequest = jest.fn();

    // Mock DataMapper
    mockDataMapper = {
      getMappedData: jest.fn().mockReturnValue(mockInput),
      map: jest.fn().mockReturnValue(mockInput),
      currentTerms: mockCurrentTerms,
      stateMap: new Map([['MA', { Code: 'MA', ID: '25', Name: 'Massachusetts' }]]),
      countryMap: new Map([['US', { Alpha2: 'US', ID: '840', Name: 'United States' }]]),
      stateMappings: new Map([['MA', { Code: 'MA', ID: '25', Name: 'Massachusetts' }]]),
      countryMappings: new Map([['US', { Alpha2: 'US', ID: '840', Name: 'United States' }]]),
      orgHrn: jest.fn((sourceOrgId: string) => `hrn:hrs:lists:organizations/${sourceOrgId}`),
      orgMap: new Map([['ORG001', 'hrn:hrs:lists:organizations/ORG001']]),
      orgMappings: new Map([['ORG001', 'hrn:hrs:lists:organizations/ORG001']]),
      criticalValidationErrorMessage: undefined,
      infoValidationErrorMessage: undefined
    } as any;
    (DataMapper as jest.Mock).mockImplementation(() => mockDataMapper);

    // Mock CurrentTermsDataSource
    mockCurrentTermsDataSource = {
      fetchRaw: jest.fn().mockResolvedValue(mockCurrentTerms)
    } as any;
    (BuCdmCurrentTermsDataSource as jest.Mock).mockImplementation(() => mockCurrentTermsDataSource);

    // Mock ReadPerson
    (ReadPerson as jest.Mock).mockImplementation(() => ({
      readPersonById: jest.fn().mockResolvedValue([]),
      readPersonBySourceIdentifier: jest.fn().mockResolvedValue([])
    }));

    singlePersonSync =  new SinglePersonSync({ 
      buid: 'U12345678', 
      config: mockConfig,
      dataMapper: mockDataMapper
    });
  });

  describe('constructor', () => {
    it('should create instance with correct properties', () => {
      // Config is now passed directly, no ConfigManager calls expected
      expect(singlePersonSync).toBeDefined();
    });

    it('should create instance with custom config', async () => {
      const customConfig = { ...mockConfig, integration: { ...mockConfig.integration, clientId: 'custom-client' } };
      const customSync = new SinglePersonSync({ buid: 'U87654321', config: customConfig, dataMapper: mockDataMapper });
      expect(customSync).toBeDefined();
    });

    it('should create data source with correct parameters', () => {
      expect(BuCdmPersonDataSource).toHaveBeenCalledWith({
        config: mockConfig,
        responseFilter: undefined,
        buid: 'U12345678'
      });
    });

    it('should create data target with config', () => {
      expect(HuronPersonDataTarget as unknown as jest.Mock).toHaveBeenCalledWith({
        config: mockConfig,
        responseFilter: undefined,
        buid: undefined
      });
    });
  });

  describe('sync', () => {
    it('should successfully sync a single person', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE });

      expect(mockDataSource.fetchRaw).toHaveBeenCalled();
      expect(mockDataTarget.pushOne).toHaveBeenCalledWith({
        data: mockInput.fieldSets[0],
        crud: CrudOperation.CREATE
      });
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syncing U12345678'));
      expect(consoleSpy).toHaveBeenCalledWith('Client ID: test-client');
      expect(consoleSpy).toHaveBeenCalledWith('SOURCE CHECK: Looking up raw person data for BUID: U12345678 from source...');
      expect(consoleSpy).toHaveBeenCalledWith('Found U12345678 in source');
      expect(consoleSpy).toHaveBeenCalledWith('Push result for U12345678:', Status.SUCCESS, 'Person pushed successfully');
      expect(consoleSpy).toHaveBeenCalledWith('Single Person Sync completed successfully for BUID: U12345678');

      consoleSpy.mockRestore();
    });

    it('should handle no person data found', async () => {
      mockDataSource.fetchRaw.mockResolvedValue([]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE });

      expect(mockDataSource.fetchRaw).toHaveBeenCalled();
      expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syncing U12345678'));
      expect(consoleSpy).toHaveBeenCalledWith('Client ID: test-client');
      expect(consoleSpy).toHaveBeenCalledWith('SOURCE CHECK: Looking up raw person data for BUID: U12345678 from source...');
      expect(consoleSpy).toHaveBeenCalledWith('Did not find U12345678 in source');

      consoleSpy.mockRestore();
    });

    it('should handle null person data', async () => {
      mockDataSource.fetchRaw.mockResolvedValue(null as any);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syncing U12345678'));
      expect(consoleSpy).toHaveBeenCalledWith('Client ID: test-client');
      expect(consoleSpy).toHaveBeenCalledWith('SOURCE CHECK: Looking up raw person data for BUID: U12345678 from source...');
      expect(consoleSpy).toHaveBeenCalledWith('Did not find U12345678 in source');

      consoleSpy.mockRestore();
    });

    it('should handle no valid field sets', async () => {
      mockDataMapper.getMappedData.mockReturnValue({
        fieldDefinitions: mockInput.fieldDefinitions,
        fieldSets: []
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE });

      expect(mockDataSource.fetchRaw).toHaveBeenCalled();
      expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
      
      expect(consoleSpy).toHaveBeenCalledWith('No valid field sets generated for BUID: U12345678');

      consoleSpy.mockRestore();
    });

    it('should handle multiple field sets by processing only the first one', async () => {
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
      mockDataMapper.getMappedData.mockReturnValue(multipleFieldSetsInput);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE });

      // Should only push the first field set
      expect(mockDataTarget.pushOne).toHaveBeenCalledTimes(1);
      expect(mockDataTarget.pushOne).toHaveBeenCalledWith({
        data: multipleFieldSetsInput.fieldSets[0],
        crud: CrudOperation.CREATE
      });

      // Should log warning about multiple field sets
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expected exactly 1 field set for single person sync, but found 2')
      );

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
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

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE });

      expect(consoleSpy).toHaveBeenCalledWith('Push result for U12345678:', Status.FAILURE, 'Push failed: Invalid data');

      consoleSpy.mockRestore();
    });

    it('should propagate fetch errors', async () => {
      const fetchError = new Error('API fetch failed');
      mockDataSource.fetchRaw.mockRejectedValue(fetchError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(singlePersonSync.sync({ crudOperation: CrudOperation.CREATE })).rejects.toThrow('API fetch failed');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Single Person Sync failed for BUID: U12345678:', fetchError);

      consoleErrorSpy.mockRestore();
    });

    it('should propagate push errors', async () => {
      const pushError = new Error('API push failed');
      mockDataTarget.pushOne.mockRejectedValue(pushError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(singlePersonSync.sync({ crudOperation: CrudOperation.CREATE })).rejects.toThrow('API push failed');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Single Person Sync failed for BUID: U12345678:', pushError);

      consoleErrorSpy.mockRestore();
    });

    it('should propagate conversion errors', async () => {
      const conversionError = new Error('Data conversion failed');
      mockDataMapper.getMappedData.mockImplementation(() => {
        throw conversionError;
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(singlePersonSync.sync({ crudOperation: CrudOperation.CREATE })).rejects.toThrow('Data conversion failed');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Single Person Sync failed for BUID: U12345678:', conversionError);

      consoleErrorSpy.mockRestore();
    });

    it('should use provided rawData and skip fetch when rawData is supplied', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE, rawData: mockRawData });

      expect(mockDataSource.fetchRaw).not.toHaveBeenCalled();
      expect(mockDataTarget.pushOne).toHaveBeenCalledWith({
        data: mockInput.fieldSets[0],
        crud: CrudOperation.CREATE
      });
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syncing U12345678'));
      expect(consoleSpy).toHaveBeenCalledWith('Client ID: test-client');
      expect(consoleSpy).toHaveBeenCalledWith('Found U12345678 in source');
      expect(consoleSpy).toHaveBeenCalledWith('Push result for U12345678:', Status.SUCCESS, 'Person pushed successfully');
      expect(consoleSpy).toHaveBeenCalledWith('Single Person Sync completed successfully for BUID: U12345678');

      consoleSpy.mockRestore();
    });

    it('should handle empty rawData array when provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE, rawData: [] });

      expect(mockDataSource.fetchRaw).not.toHaveBeenCalled();
      expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syncing U12345678'));
      expect(consoleSpy).toHaveBeenCalledWith('Client ID: test-client');
      expect(consoleSpy).toHaveBeenCalledWith('Did not find U12345678 in source');

      consoleSpy.mockRestore();
    });

    it('should handle null rawData when provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE, rawData: null as any });

      expect(mockDataSource.fetchRaw).not.toHaveBeenCalled();
      expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syncing U12345678'));
      expect(consoleSpy).toHaveBeenCalledWith('Client ID: test-client');
      expect(consoleSpy).toHaveBeenCalledWith('Did not find U12345678 in source');

      consoleSpy.mockRestore();
    });
  });



  describe('environment config override', () => {
    it('should apply environment overrides to config', async () => {
      const envOverrides = {
        integration: {
          clientId: 'env-override-client',
          batchSize: 20,
          timeout: 10000
        }
      };

      const syncWithOverrides = new SinglePersonSync({ buid: 'U12345678', config: { ...mockConfig, ...envOverrides }, dataMapper: mockDataMapper });
      
      // Verify that the config with overrides was passed correctly
      expect(syncWithOverrides).toBeDefined();
    });
  });

  describe('hash storage update functionality', () => {
    let mockStorage: any;
    let mockDeltaStrategy: any;

    beforeEach(() => {
      // Create mock storage
      mockStorage = {
        fetchPreviousData: jest.fn().mockResolvedValue([]),
        wouldOverwritePreviousData: jest.fn().mockResolvedValue(true),
        updatePreviousData: jest.fn().mockResolvedValue(undefined)
      };

      // Create mock delta strategy
      mockDeltaStrategy = {
        storage: mockStorage
      };

      // Mock DeltaStrategyFactory to return our mock strategy
      (DeltaStrategyFactory.createStrategy as jest.Mock) = jest.fn().mockReturnValue(mockDeltaStrategy);
    });

    describe('single person sync with hash storage update', () => {
      it('should update hash storage when hashStorage is enabled and push succeeds', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const syncWithHashStorage = new SinglePersonSync({ 
          buid: 'U12345678', 
          config: mockConfig,
          dataMapper: mockDataMapper,
          hashStorage: {
            enabled: true,
            deltaStrategy: mockDeltaStrategy
          }
        });

        await syncWithHashStorage.sync({ 
          crudOperation: CrudOperation.CREATE
        });

        expect(mockDataTarget.pushOne).toHaveBeenCalled();
        expect(mockStorage.fetchPreviousData).toHaveBeenCalledWith({ 
          clientId: 'test-client' 
        });
        expect(mockStorage.updatePreviousData).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Hash storage updated successfully')
        );

        consoleSpy.mockRestore();
      });

      it('should not update hash storage when hashStorage is not enabled', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await singlePersonSync.sync({ 
          crudOperation: CrudOperation.CREATE
        });

        expect(mockDataTarget.pushOne).toHaveBeenCalled();
        expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should not update hash storage when hashStorage is undefined (default)', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await singlePersonSync.sync({ 
          crudOperation: CrudOperation.CREATE 
        });

        expect(mockDataTarget.pushOne).toHaveBeenCalled();
        expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should not update hash storage when push fails', async () => {
        mockDataTarget.pushOne.mockResolvedValue({
          status: Status.FAILURE,
          message: 'Push failed',
          timestamp: new Date(),
          primaryKey: [{ id: 'U12345678' }],
          crud: CrudOperation.CREATE
        });

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const syncWithHashStorage = new SinglePersonSync({ 
          buid: 'U12345678', 
          config: mockConfig,
          dataMapper: mockDataMapper,
          hashStorage: {
            enabled: true,
            deltaStrategy: mockDeltaStrategy
          }
        });

        await syncWithHashStorage.sync({ 
          crudOperation: CrudOperation.CREATE
        });

        expect(mockDataTarget.pushOne).toHaveBeenCalled();
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should log warning and continue when hash storage update fails', async () => {
        mockStorage.fetchPreviousData.mockRejectedValue(new Error('Storage fetch failed'));
        
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

        const syncWithHashStorage = new SinglePersonSync({ 
          buid: 'U12345678', 
          config: mockConfig,
          dataMapper: mockDataMapper,
          hashStorage: {
            enabled: true,
            deltaStrategy: mockDeltaStrategy
          }
        });

        await syncWithHashStorage.sync({ 
          crudOperation: CrudOperation.CREATE
        });

        expect(mockDataTarget.pushOne).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Single Person Sync completed successfully')
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to update hash storage')
        );

        consoleSpy.mockRestore();
        consoleWarnSpy.mockRestore();
      });

      it('should add new record to empty hash storage', async () => {
        mockStorage.fetchPreviousData.mockResolvedValue([]);
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const syncWithHashStorage = new SinglePersonSync({ 
          buid: 'U12345678', 
          config: mockConfig,
          dataMapper: mockDataMapper,
          hashStorage: {
            enabled: true,
            deltaStrategy: mockDeltaStrategy
          }
        });

        await syncWithHashStorage.sync({ 
          crudOperation: CrudOperation.CREATE
        });

        expect(mockStorage.updatePreviousData).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'test-client',
            newPreviousData: expect.arrayContaining([
              expect.objectContaining({
                fieldValues: expect.any(Array)
              })
            ])
          })
        );

        consoleSpy.mockRestore();
      });

      it('should update existing record in hash storage', async () => {
        // Existing hash storage has the same person already
        const existingCachedData = [
          {
            fieldValues: [
              { id: 'U12345678' },
              { firstName: 'Jane' }, // Different name
              { lastName: 'Smith' }
            ]
          }
        ];
        mockStorage.fetchPreviousData.mockResolvedValue(existingCachedData);
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const syncWithHashStorage = new SinglePersonSync({ 
          buid: 'U12345678', 
          config: mockConfig,
          dataMapper: mockDataMapper,
          hashStorage: {
            enabled: true,
            deltaStrategy: mockDeltaStrategy
          }
        });

        await syncWithHashStorage.sync({ 
          crudOperation: CrudOperation.UPDATE
        });

        // Verify the hash storage was updated with new data (John Doe, not Jane Smith)
        expect(mockStorage.updatePreviousData).toHaveBeenCalled();
        const updateCall = mockStorage.updatePreviousData.mock.calls[0][0];
        expect(updateCall.newPreviousData).toHaveLength(1); // Still one record
        expect(updateCall.newPreviousData[0].fieldValues).toContainEqual({ id: 'U12345678' });

        consoleSpy.mockRestore();
      });
    });
  });

  describe('getMappedPerson caching behavior', () => {
    let mockStorage: any;
    let mockDeltaStrategy: any;

    beforeEach(() => {
      // Create mock storage for hash storage tests
      mockStorage = {
        fetchPreviousData: jest.fn().mockResolvedValue([]),
        wouldOverwritePreviousData: jest.fn().mockResolvedValue(true),
        updatePreviousData: jest.fn().mockResolvedValue(undefined)
      };

      // Create mock delta strategy
      mockDeltaStrategy = {
        storage: mockStorage
      };

      // Mock DeltaStrategyFactory to return our mock strategy
      (DeltaStrategyFactory.createStrategy as jest.Mock) = jest.fn().mockReturnValue(mockDeltaStrategy);
    });

    it('should cache mapped person and not fetch from source multiple times', async () => {
      mockDataSource.fetchRaw.mockResolvedValue(mockRawData);
      mockDataMapper.getMappedData.mockReturnValue(mockInput);
      mockDataTarget.pushOne.mockResolvedValue({
        status: Status.SUCCESS,
        message: 'Person pushed successfully',
        timestamp: new Date(),
        primaryKey: [{ id: 'U12345678' }],
        crud: CrudOperation.UPDATE
      });

      const singlePersonSync = new SinglePersonSync({ 
        buid: 'U12345678', 
        config: mockConfig,
        dataMapper: mockDataMapper,
        hashStorage: {
          enabled: true,
          deltaStrategy: mockDeltaStrategy
        }
      });

      // First call to getMappedPerson - should fetch from source
      const result1 = await singlePersonSync.getMappedPerson({ 
        crudOperation: CrudOperation.UPDATE 
      });
      
      // Verify first call fetched from source
      expect(mockDataSource.fetchRaw).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(mockInput);

      // Second call to getMappedPerson - should return cached result
      const result2 = await singlePersonSync.getMappedPerson({ 
        crudOperation: CrudOperation.UPDATE 
      });
      
      // Verify source was NOT called again (still only 1 call)
      expect(mockDataSource.fetchRaw).toHaveBeenCalledTimes(1);
      expect(result2).toEqual(mockInput);
      expect(result2).toBe(result1); // Should be the same object reference
    });

    it('should clear cache on error and allow retry', async () => {
      // First call fails
      mockDataSource.fetchRaw.mockRejectedValueOnce(new Error('Network error'));
      // Second call succeeds
      mockDataSource.fetchRaw.mockResolvedValueOnce(mockRawData);
      mockDataMapper.getMappedData.mockReturnValue(mockInput);

      const singlePersonSync = new SinglePersonSync({ 
        buid: 'U12345678', 
        config: mockConfig,
        dataMapper: mockDataMapper
      });

      // First call should fail and clear cache
      await expect(singlePersonSync.getMappedPerson({ 
        crudOperation: CrudOperation.UPDATE 
      })).rejects.toThrow('Network error');
      
      expect(mockDataSource.fetchRaw).toHaveBeenCalledTimes(1);

      // Second call should retry (cache was cleared on error)
      const result = await singlePersonSync.getMappedPerson({ 
        crudOperation: CrudOperation.UPDATE 
      });
      
      expect(mockDataSource.fetchRaw).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockInput);
    });

    it('should cache result during batch operations to prevent double-fetching', async () => {
      mockDataSource.fetchRaw.mockResolvedValue(mockRawData);
      mockDataMapper.getMappedData.mockReturnValue(mockInput);
      mockDataTarget.pushOne.mockResolvedValue({
        status: Status.SUCCESS,
        message: 'Person pushed successfully',
        timestamp: new Date(),
        primaryKey: [{ id: 'U12345678' }],
        crud: CrudOperation.UPDATE
      });

      const singlePersonSync = new SinglePersonSync({ 
        buid: 'U12345678', 
        config: mockConfig,
        dataMapper: mockDataMapper,
        hashStorage: {
          enabled: true,
          deltaStrategy: mockDeltaStrategy
        }
      });

      // Simulate batch operation: sync() followed by getMappedPerson()
      // Note: sync() will call SyncEvaluator which makes its own fetch, 
      // plus getMappedPerson which makes another. That's expected.
      // We'll call it without hash storage enabled to skip SyncEvaluator
      const singlePersonSyncNoEval = new SinglePersonSync({ 
        buid: 'U12345678', 
        config: mockConfig,
        dataMapper: mockDataMapper
      });

      await singlePersonSyncNoEval.sync({ 
        suppressHashUpdate: true,
        crudOperation: CrudOperation.CREATE // CREATE skips SyncEvaluator
      });
      
      // Verify sync called fetchRaw once
      expect(mockDataSource.fetchRaw).toHaveBeenCalledTimes(1);

      // Batch operation then calls getMappedPerson to get hashed data
      const hashedResult = await singlePersonSyncNoEval.getMappedPerson({ 
        crudOperation: CrudOperation.CREATE 
      });
      
      // Verify source was NOT called again (cache reused)
      expect(mockDataSource.fetchRaw).toHaveBeenCalledTimes(1);
      expect(hashedResult).toEqual(mockInput);
    });
  });

  describe('hash storage for deactivations and DynamoDB storage', () => {
    let mockStorage: any;
    const dynamoConfig: Config = {
      ...mockConfig,
      storage: {
        type: 'dynamodb',
        config: {
          region: 'us-east-2',
          personCurrentStateTableName: 'person-current-state',
          personHistoryTableName: 'person-history',
          syncRunId: '2026-10-11T12:00:00.000Z'
        }
      }
    };

    beforeAll(() => {
      // The DataMapper module is auto-mocked, which empties its exported field definitions
      if (!(_fieldDefinitions as any[]).some(fd => fd.isPrimaryKey)) {
        (_fieldDefinitions as any[]).push({ name: 'sourceIdentifier', type: 'string', required: true, isPrimaryKey: true });
      }
    });

    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation();
      mockStorage = {
        name: 'Mock Storage',
        description: 'Mock storage for testing',
        fetchPreviousData: jest.fn().mockResolvedValue([
          { fieldValues: [{ sourceIdentifier: 'U12345678' }], hash: 'stored-hash' },
          { fieldValues: [{ sourceIdentifier: 'U00000002' }], hash: 'other-hash' }
        ]),
        wouldOverwritePreviousData: jest.fn().mockResolvedValue(true),
        updatePreviousData: jest.fn().mockResolvedValue(undefined)
      };
      (DeltaStrategyFactory.createStrategy as jest.Mock) = jest.fn().mockReturnValue({ storage: mockStorage });
      (ReadPerson as jest.Mock).mockImplementation(() => ({
        readPersonBySourceIdentifier: jest.fn().mockResolvedValue([{ hrn: 'hrn:hrs:persons:U12345678', active: true }])
      }));
    });

    afterEach(() => {
      jest.restoreAllMocks();
      delete process.env.DRY_RUN;
    });

    const goneFromSource = () => mockDataSource.fetchRaw.mockResolvedValue([]);

    const buildSync = (overrides: Partial<SinglePersonSyncParams> = {}) => new SinglePersonSync({
      buid: 'U12345678',
      config: mockConfig,
      dataMapper: mockDataMapper,
      hashStorage: { enabled: true, deltaStrategy: { storage: mockStorage } as any },
      ...overrides
    });

    describe('S3/file storage', () => {
      it('does not rewrite the baseline when the person\'s stored hash is unchanged', async () => {
        const sync = buildSync();
        const { fieldSets: [{ hash }] } = await sync.getMappedPerson({ crudOperation: CrudOperation.CREATE });
        mockStorage.fetchPreviousData.mockResolvedValue([{ fieldValues: [{ id: 'U12345678' }], hash }]);

        await sync.sync({ crudOperation: CrudOperation.CREATE });

        expect(mockDataTarget.pushOne).toHaveBeenCalled();
        expect(mockStorage.fetchPreviousData).toHaveBeenCalled();
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Hash storage unchanged for person U12345678 - baseline not rewritten'));
      });

      it('marks the stored hash of a person deactivated in the target as deleted', async () => {
        goneFromSource();
        const sync = buildSync();

        await sync.sync();

        expect(mockDataTarget.pushOne).toHaveBeenCalledWith(expect.objectContaining({ crud: CrudOperation.DELETE }));
        expect(sync.wasDeactivated()).toBe(true);
        expect(mockStorage.updatePreviousData).toHaveBeenCalledWith(expect.objectContaining({
          newPreviousData: [
            expect.objectContaining({ fieldValues: [{ sourceIdentifier: 'U12345678' }], hash: 'DELETED:stored-hash' }),
            expect.objectContaining({ fieldValues: [{ sourceIdentifier: 'U00000002' }], hash: 'other-hash' })
          ]
        }));
      });

      it('marks a person who is already inactive in the target', async () => {
        goneFromSource();
        (ReadPerson as jest.Mock).mockImplementation(() => ({
          readPersonBySourceIdentifier: jest.fn().mockResolvedValue([{ hrn: 'hrn:hrs:persons:U12345678', active: false }])
        }));
        const sync = buildSync();

        await sync.sync();

        expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
        expect(mockStorage.updatePreviousData).toHaveBeenCalled();
      });

      it('does not mark the person when the deactivation push fails', async () => {
        goneFromSource();
        mockDataTarget.pushOne.mockResolvedValue({
          status: Status.FAILURE, message: 'failed', timestamp: new Date(), primaryKey: [], crud: CrudOperation.DELETE
        });
        const sync = buildSync();

        await sync.sync();

        expect(sync.wasDeactivated()).toBe(false);
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
      });

      it('neither deactivates nor marks the person in preview mode', async () => {
        goneFromSource();
        const sync = buildSync({ preview: true });

        await sync.sync();

        expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
        expect(sync.wasDeactivated()).toBe(false);
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
      });

      it('leaves marking to the caller when suppressHashUpdate is set', async () => {
        goneFromSource();
        const sync = buildSync();

        await sync.sync({ suppressHashUpdate: true });

        expect(sync.wasDeactivated()).toBe(true);
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
      });

      it('does not rewrite the baseline when the person has no stored record', async () => {
        goneFromSource();
        mockStorage.fetchPreviousData.mockResolvedValue([
          { fieldValues: [{ sourceIdentifier: 'U00000002' }], hash: 'other-hash' }
        ]);

        await buildSync().sync();

        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
      });
    });

    describe('DynamoDB storage', () => {
      it('marks a person deactivated in the target as deleted through DynamoDBDeltaStorage', async () => {
        goneFromSource();
        const markDeleted = jest.spyOn(DynamoDBDeltaStorage.prototype, 'markDeleted').mockResolvedValue({ marked: ['U12345678'] });

        await buildSync({ config: dynamoConfig }).sync();

        expect(markDeleted).toHaveBeenCalledWith({ personIds: ['U12345678'] });
        expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
      });

      it('does not write to DynamoDB on a dry run', async () => {
        goneFromSource();
        process.env.DRY_RUN = 'true';
        const markDeleted = jest.spyOn(DynamoDBDeltaStorage.prototype, 'markDeleted').mockResolvedValue({ marked: [] });

        await buildSync({ config: dynamoConfig }).sync();

        expect(markDeleted).not.toHaveBeenCalled();
      });

      it('writes only the synced person\'s key and hash after a successful push, without reading the baseline', async () => {
        await buildSync({ config: dynamoConfig }).sync({ crudOperation: CrudOperation.CREATE });

        expect(mockDataTarget.pushOne).toHaveBeenCalled();
        expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
        expect(mockStorage.updatePreviousData).toHaveBeenCalledWith(expect.objectContaining({
          newPreviousData: [expect.objectContaining({ fieldValues: [{ id: 'U12345678' }] })]
        }));
        // DynamoDB storage decides whether to write, so the sync doesn't claim it updated anything
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Hash storage checked for person U12345678 (written only if new or changed)'));
        expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Hash storage updated successfully'));
      });
    });

    describe('stored hash in-sync check', () => {
      let liveCheck: jest.SpyInstance;

      beforeEach(() => {
        liveCheck = jest.spyOn(SyncEvaluator, 'SourcePerson').mockImplementation(() => ({
          isInSyncWith: jest.fn().mockResolvedValue(false)
        }) as any);
      });

      /** Store the hash the source person maps to (or a different one), then sync as an UPDATE */
      const syncWithStoredHash = async (hashStorageFlags: object, stored: 'same' | 'different' | 'none' | 'deleted', config = dynamoConfig) => {
        const sync = buildSync({
          config,
          hashStorage: { enabled: true, deltaStrategy: { storage: mockStorage } as any, ...hashStorageFlags }
        });
        const sourceHash = (await sync.getMappedPerson({ crudOperation: CrudOperation.UPDATE })).fieldSets[0].hash;
        const storedHash = { same: sourceHash, different: 'different-hash', deleted: `DELETED:${sourceHash}`, none: undefined }[stored];
        mockStorage.fetchPreviousData.mockResolvedValue(storedHash ? [{ fieldValues: [{ id: 'U12345678' }], hash: storedHash }] : []);
        await sync.sync({ crudOperation: CrudOperation.UPDATE });
      };

      it('compares with the target when trustPreviousStorage is not set', async () => {
        await syncWithStoredHash({}, 'same');
        expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
        expect(liveCheck).toHaveBeenCalled();
      });

      it('skips the target comparison and the push when the stored hash matches', async () => {
        await syncWithStoredHash({ trustPreviousStorage: true }, 'same');

        expect(mockStorage.fetchPreviousData).toHaveBeenCalledWith(expect.objectContaining({
          limitTo: [{ fieldValues: [{ id: 'U12345678' }] }]
        }));
        expect(liveCheck).not.toHaveBeenCalled();
        expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No push for U12345678: source and target already in sync'));
        // The matching hash is not written again
        expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
      });

      it('still writes hash storage when the target comparison finds the person in sync', async () => {
        liveCheck.mockImplementation(() => ({ isInSyncWith: jest.fn().mockResolvedValue(true) }) as any);

        await syncWithStoredHash({}, 'none');

        expect(mockDataTarget.pushOne).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No push for U12345678: source and target already in sync'));
        // Creates or repairs the stored record
        expect(mockStorage.updatePreviousData).toHaveBeenCalled();
      });

      it('pushes without the target comparison when the stored hash differs', async () => {
        await syncWithStoredHash({ trustPreviousStorage: true }, 'different');

        expect(liveCheck).not.toHaveBeenCalled();
        expect(mockDataTarget.pushOne).toHaveBeenCalledWith(expect.objectContaining({ crud: CrudOperation.UPDATE }));
      });

      it('creates the person when the stored hash differs but the person is not in the target', async () => {
        (ReadPerson as jest.Mock).mockImplementation(() => ({
          readPersonBySourceIdentifier: jest.fn().mockResolvedValue([])
        }));
        await syncWithStoredHash({ trustPreviousStorage: true }, 'different');

        expect(mockDataTarget.pushOne).toHaveBeenCalledWith(expect.objectContaining({ crud: CrudOperation.CREATE }));
      });

      it.each(['none', 'deleted'] as const)('falls back to the target comparison when the stored hash is %s', async (stored) => {
        await syncWithStoredHash({ trustPreviousStorage: true }, stored);

        expect(mockStorage.fetchPreviousData).toHaveBeenCalled();
        expect(liveCheck).toHaveBeenCalled();
      });

      it('compares with the target for S3/file storage', async () => {
        await syncWithStoredHash({ trustPreviousStorage: true }, 'same', mockConfig);

        expect(liveCheck).toHaveBeenCalled();
      });
    });
  });

  describe('supplied CRUD operation and completion logging', () => {
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(console, 'log').mockImplementation();
      warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('creates a person who is not in the target, even if UPDATE was supplied', async () => {
      await singlePersonSync.sync({ crudOperation: CrudOperation.UPDATE });

      expect(mockDataTarget.pushOne).toHaveBeenCalledWith(expect.objectContaining({ crud: CrudOperation.CREATE }));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('does not exist in target, changing operation to create'));
    });

    it('keeps a supplied UPDATE for a person who is in the target', async () => {
      (ReadPerson as jest.Mock).mockImplementation(() => ({
        readPersonBySourceIdentifier: jest.fn().mockResolvedValue([{ hrn: 'hrn:hrs:persons:U12345678', active: true }])
      }));

      await singlePersonSync.sync({ crudOperation: CrudOperation.UPDATE });

      expect(mockDataTarget.pushOne).toHaveBeenCalledWith(expect.objectContaining({ crud: CrudOperation.UPDATE }));
    });

    it('reports a failed push instead of success', async () => {
      mockDataTarget.pushOne.mockResolvedValue({
        status: Status.FAILURE, message: 'Push failed', timestamp: new Date(), primaryKey: [], crud: CrudOperation.CREATE
      });

      await singlePersonSync.sync();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('completed with a failed push for BUID: U12345678: Push failed'));
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('completed successfully'));
    });

    it('reports success after a successful push', async () => {
      await singlePersonSync.sync();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Single Person Sync completed successfully for BUID: U12345678'));
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('failed push'));
    });
  });
});
