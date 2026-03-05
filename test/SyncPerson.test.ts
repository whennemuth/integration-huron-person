import { SinglePersonSync } from '../src/SyncPerson';
import { BuCdmPersonDataSource } from '../src/data-source/PersonDataSource';
import { HuronPersonDataTarget } from '../src/data-target/PersonDataTarget';
import { ConfigManager } from '../src/config/ConfigManager';
import { DataMapper } from '../src/data-mapper/DataMapper';
import { Config } from '../src/config/Config';
import { Status, CrudOperation } from 'integration-core';
import { BuCdmCurrentTermsDataSource, Term } from '../src/data-source/CurrentTermsDataSource';
import { ReadPerson } from '../src/data-target/crud/ReadPerson';

// Mock the external dependencies
jest.mock('../src/config/ConfigManager');
jest.mock('../src/data-source/PersonDataSource');
jest.mock('../src/data-target/PersonDataTarget');
jest.mock('../src/data-mapper/DataMapper');
jest.mock('../src/data-source/CurrentTermsDataSource');
jest.mock('../src/data-target/crud/ReadPerson');

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
      orgHrn: jest.fn((sourceOrgId: string) => `hrn:hrs:lists:organizations/${sourceOrgId}`),
      orgMap: new Map([['ORG001', 'hrn:hrs:lists:organizations/ORG001']]),
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
      readPersonById: jest.fn().mockResolvedValue([])
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
      mockDataMapper.getMappedData.mockReturnValue(multipleFieldSetsInput);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await singlePersonSync.sync({ crudOperation: CrudOperation.CREATE });

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

  describe('syncAll', () => {
    it('should sync multiple BUIDs without dataMapper provided', async () => {
      const buids = ['U11111111', 'U22222222', 'U33333333'];
      
      // Create fresh mocks for this test
      const freshDataSource = {
        fetchRaw: jest.fn().mockResolvedValue(mockRawData)
      };
      const freshDataMapper = {
        getMappedData: jest.fn().mockReturnValue(mockInput),
        map: jest.fn().mockReturnValue(mockInput),
        currentTerms: mockCurrentTerms,
        stateMap: new Map([['MA', { Code: 'MA', ID: '25', Name: 'Massachusetts' }]]),
        countryMap: new Map([['US', { Alpha2: 'US', ID: '840', Name: 'United States' }]]),
        orgHrn: jest.fn((sourceOrgId: string) => `hrn:hrs:lists:organizations/${sourceOrgId}`),
        orgMap: new Map([['ORG001', 'hrn:hrs:lists:organizations/ORG001']]),
        criticalValidationErrorMessage: undefined,
        infoValidationErrorMessage: undefined
      };
      const freshDataTarget = {
        pushOne: jest.fn().mockResolvedValue({
          status: Status.SUCCESS,
          message: 'Person pushed successfully',
          timestamp: new Date(),
          primaryKey: [{ id: 'U12345678' }],
          crud: CrudOperation.CREATE
        })
      };
      
      // Clear and setup mocks
      (BuCdmPersonDataSource as jest.Mock).mockClear().mockImplementation(() => freshDataSource);
      (DataMapper as jest.Mock).mockClear().mockImplementation(() => freshDataMapper);
      (HuronPersonDataTarget as unknown as jest.Mock).mockClear().mockImplementation(() => freshDataTarget);
      
      await SinglePersonSync.syncAll({
        config: mockConfig,
        buids
      });
      
      // Verify person data was fetched for each BUID
      expect(freshDataSource.fetchRaw).toHaveBeenCalledTimes(buids.length);
    });

    it('should reuse dataMapper when provided', async () => {
      const buids = ['U11111111', 'U22222222'];
      
      // Create fresh mocks for this test
      const freshDataSource = {
        fetchRaw: jest.fn().mockResolvedValue(mockRawData)
      };
      const freshDataMapper = {
        getMappedData: jest.fn().mockReturnValue(mockInput),
        map: jest.fn().mockReturnValue(mockInput),
        currentTerms: mockCurrentTerms,
        stateMap: new Map([['MA', { Code: 'MA', ID: '25', Name: 'Massachusetts' }]]),
        countryMap: new Map([['US', { Alpha2: 'US', ID: '840', Name: 'United States' }]]),
        orgHrn: jest.fn((sourceOrgId: string) => `hrn:hrs:lists:organizations/${sourceOrgId}`),
        orgMap: new Map([['ORG001', 'hrn:hrs:lists:organizations/ORG001']]),
        criticalValidationErrorMessage: undefined,
        infoValidationErrorMessage: undefined
      };
      const freshDataTarget = {
        pushOne: jest.fn().mockResolvedValue({
          status: Status.SUCCESS,
          message: 'Person pushed successfully',
          timestamp: new Date(),
          primaryKey: [{ id: 'U12345678' }],
          crud: CrudOperation.CREATE
        })
      };
      
      // Clear and setup mocks
      (BuCdmPersonDataSource as jest.Mock).mockClear().mockImplementation(() => freshDataSource);
      (DataMapper as jest.Mock).mockClear().mockImplementation(() => freshDataMapper);
      (HuronPersonDataTarget as unknown as jest.Mock).mockClear().mockImplementation(() => freshDataTarget);
      
      // Provide dataMapper upfront
      await SinglePersonSync.syncAll({
        config: mockConfig,
        buids,
        dataMapper: freshDataMapper as any
      });
      
      // Verify syncs still happened for each BUID
      expect(freshDataSource.fetchRaw).toHaveBeenCalledTimes(buids.length);
      
      // Verify the same dataMapper was used (getMappedData called for each BUID)
      expect(freshDataMapper.getMappedData).toHaveBeenCalledTimes(buids.length);
    });

    it('should continue to next BUID on sync failure', async () => {
      const buids = ['U11111111', 'U22222222', 'U33333333'];
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Create fresh mocks for this test
      const freshDataSource = {
        fetchRaw: jest.fn()
          .mockResolvedValueOnce(mockRawData) // First BUID succeeds
          .mockRejectedValueOnce(new Error('Network error')) // Second BUID fails
          .mockResolvedValueOnce(mockRawData) // Third BUID succeeds
      };
      const freshDataMapper = {
        getMappedData: jest.fn().mockReturnValue(mockInput),
        map: jest.fn().mockReturnValue(mockInput),
        currentTerms: mockCurrentTerms,
        stateMap: new Map([['MA', { Code: 'MA', ID: '25', Name: 'Massachusetts' }]]),
        countryMap: new Map([['US', { Alpha2: 'US', ID: '840', Name: 'United States' }]]),
        orgHrn: jest.fn((sourceOrgId: string) => `hrn:hrs:lists:organizations/${sourceOrgId}`),
        orgMap: new Map([['ORG001', 'hrn:hrs:lists:organizations/ORG001']]),
        criticalValidationErrorMessage: undefined,
        infoValidationErrorMessage: undefined
      };
      const freshDataTarget = {
        pushOne: jest.fn().mockResolvedValue({
          status: Status.SUCCESS,
          message: 'Person pushed successfully',
          timestamp: new Date(),
          primaryKey: [{ id: 'U12345678' }],
          crud: CrudOperation.CREATE
        })
      };
      
      // Clear and setup mocks
      (BuCdmPersonDataSource as jest.Mock).mockClear().mockImplementation(() => freshDataSource);
      (DataMapper as jest.Mock).mockClear().mockImplementation(() => freshDataMapper);
      (HuronPersonDataTarget as unknown as jest.Mock).mockClear().mockImplementation(() => freshDataTarget);
      
      await SinglePersonSync.syncAll({
        config: mockConfig,
        buids,
        dataMapper: freshDataMapper as any
      });

      // Verify it tried to sync all three
      expect(BuCdmPersonDataSource).toHaveBeenCalledTimes(buids.length);
      
      // Verify the continuation message was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Moving on to next BUID: U33333333 after failure with BUID: U22222222')
      );
      
      consoleSpy.mockRestore();
    });
  });
});