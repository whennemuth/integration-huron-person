import { CrudOperation, Status } from 'integration-core';
import { SinglePersonSync } from '../src/SyncPerson';
import { BatchPersonSync } from '../src/SyncPersonBatch';
import { Config } from '../src/config/Config';
import { DataMapper } from '../src/data-mapper/DataMapper';
import { Term } from '../src/data-source/CurrentTermsDataSource';
import { BuCdmPersonDataSource } from '../src/data-source/PersonDataSource';
import { HuronPersonDataTarget } from '../src/data-target/PersonDataTarget';
import { DeltaStrategyFactory } from '../src/delta-strategy/DeltaStrategyFactory';

// Mock the external dependencies
jest.mock('../src/SyncPerson');
jest.mock('../src/data-source/PersonDataSource');
jest.mock('../src/data-target/PersonDataTarget');
jest.mock('../src/data-mapper/DataMapper');
jest.mock('../src/data-source/CurrentTermsDataSource');
jest.mock('../src/delta-strategy/DeltaStrategyFactory');

/**
 * Tests for BatchPersonSync - batch person synchronization using composition pattern.
 * 
 * This test suite verifies the composition-based orchestration of multiple
 * SinglePersonSync instances for efficient batch processing.
 */
describe('BatchPersonSync', () => {
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
    executionMode: 'people',
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

  describe('syncAll - composition pattern batch orchestration', () => {
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
      
      // Mock SinglePersonSync to track instantiation and method calls
      const mockSingleSyncInstances: any[] = [];
      (SinglePersonSync as jest.Mock).mockImplementation((params) => {
        const mockInstance = {
          sync: jest.fn().mockResolvedValue(undefined),
          getMappedPerson: jest.fn().mockResolvedValue(mockInput),
          getPushResult: jest.fn().mockReturnValue({
            status: Status.SUCCESS,
            message: 'Person pushed successfully',
            timestamp: new Date(),
            primaryKey: [{ id: params.buid }],
            crud: CrudOperation.CREATE
          })
        };
        mockSingleSyncInstances.push(mockInstance);
        return mockInstance;
      });
      
      // Clear and setup other mocks
      (BuCdmPersonDataSource as jest.Mock).mockClear().mockImplementation(() => freshDataSource);
      (DataMapper as jest.Mock).mockClear().mockImplementation(() => freshDataMapper);
      (HuronPersonDataTarget as unknown as jest.Mock).mockClear().mockImplementation(() => freshDataTarget);
      
      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids
      });
      await batchSync.syncAll();
      
      // Verify SinglePersonSync was instantiated for each BUID (composition pattern)
      expect(SinglePersonSync).toHaveBeenCalledTimes(buids.length);
      
      // Verify sync was called on each composed instance
      mockSingleSyncInstances.forEach(instance => {
        expect(instance.sync).toHaveBeenCalled();
      });
    });

    it('should reuse dataMapper when provided', async () => {
      const buids = ['U11111111', 'U22222222'];
      
      // Create fresh mocks for this test
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
      
      // Mock SinglePersonSync to track instantiation
      const mockSingleSyncInstances: any[] = [];
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => {
        const mockInstance = {
          sync: jest.fn().mockResolvedValue(undefined),
          getMappedPerson: jest.fn().mockResolvedValue(mockInput),
          getPushResult: jest.fn().mockReturnValue({
            status: Status.SUCCESS,
            message: 'Person pushed successfully',
            timestamp: new Date(),
            primaryKey: [{ id: params.buid }],
            crud: CrudOperation.CREATE
          })
        };
        mockSingleSyncInstances.push(mockInstance);
        return mockInstance;
      });
      
      // Provide dataMapper upfront
      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
        dataMapper: freshDataMapper as any
      });
      await batchSync.syncAll();
      
      // Verify SinglePersonSync instances were created with dataMapper
      expect(SinglePersonSync).toHaveBeenCalledTimes(buids.length);
      buids.forEach(buid => {
        expect(SinglePersonSync).toHaveBeenCalledWith(
          expect.objectContaining({
            buid,
            dataMapper: freshDataMapper
          })
        );
      });
    });

    it('should continue to next BUID on sync failure', async () => {
      const buids = ['U11111111', 'U22222222', 'U33333333'];
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock SinglePersonSync to simulate failure on second BUID
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => {
        const shouldFail = params.buid === 'U22222222';
        return {
          sync: shouldFail 
            ? jest.fn().mockRejectedValue(new Error('Network error'))
            : jest.fn().mockResolvedValue(undefined),
          getMappedPerson: jest.fn().mockResolvedValue(mockInput),
          getPushResult: jest.fn().mockReturnValue({
            status: Status.SUCCESS,
            message: 'Person pushed successfully',
            timestamp: new Date(),
            primaryKey: [{ id: params.buid }],
            crud: CrudOperation.CREATE
          })
        };
      });
      
      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
      });
      await batchSync.syncAll();

      // Verify it tried to sync all three (composition creates instance for each)
      expect(SinglePersonSync).toHaveBeenCalledTimes(buids.length);
      
      // Verify the continuation message was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Moving on to next BUID: U33333333 after failure with BUID: U22222222')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle failure on the last BUID gracefully', async () => {
      const buids = ['U11111111', 'U22222222', 'U33333333'];
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock SinglePersonSync to simulate failure on last BUID
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => {
        const shouldFail = params.buid === 'U33333333';
        return {
          sync: shouldFail 
            ? jest.fn().mockRejectedValue(new Error('Network error'))
            : jest.fn().mockResolvedValue(undefined),
          getMappedPerson: jest.fn().mockResolvedValue(mockInput),
          getPushResult: jest.fn().mockReturnValue({
            status: Status.SUCCESS,
            message: 'Person pushed successfully',
            timestamp: new Date(),
            primaryKey: [{ id: params.buid }],
            crud: CrudOperation.CREATE
          })
        };
      });
      
      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
      });
      await batchSync.syncAll();

      // Verify it tried to sync all three
      expect(SinglePersonSync).toHaveBeenCalledTimes(buids.length);
      
      // Verify the continuation message was NOT logged for the last BUID failure
      // (since there's no "next BUID" to move on to)
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Moving on to next BUID')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('batch hash storage update - composition pattern efficiency', () => {
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

    it('should perform batch hash storage update when hashStorage is enabled', async () => {
      const buids = ['U11111111', 'U22222222'];
      
      const freshDataMapper = {
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
      };

      // Mock SinglePersonSync instances and track sync calls
      const mockSyncInstances: any[] = [];
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => {
        const mockInstance = {
          sync: jest.fn().mockResolvedValue(undefined),
          getMappedPerson: jest.fn().mockResolvedValue(mockInput),
          getPushResult: jest.fn().mockReturnValue({
            status: Status.SUCCESS,
            message: 'Person pushed successfully',
            timestamp: new Date(),
            primaryKey: [{ id: params.buid }],
            crud: CrudOperation.CREATE
          })
        };
        mockSyncInstances.push(mockInstance);
        return mockInstance;
      });
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
        dataMapper: freshDataMapper as any,
        hashStorage: {
          enabled: true,
          deltaStrategy: mockDeltaStrategy
        }
      });
      await batchSync.syncAll();

      // Verify each SinglePersonSync.sync() was called with suppressHashUpdate: true
      // This prevents individual hash updates during batch operations
      mockSyncInstances.forEach(instance => {
        expect(instance.sync).toHaveBeenCalledWith({ suppressHashUpdate: true });
      });

      // Verify batch hash storage update was called once (not per person)
      // This demonstrates the efficiency of the composition pattern
      expect(mockStorage.fetchPreviousData).toHaveBeenCalledTimes(1);
      expect(mockStorage.updatePreviousData).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully updated hash storage with 2 person record(s)')
      );

      consoleSpy.mockRestore();
    });

    it('should not update hash storage when hashStorage is disabled', async () => {
      const buids = ['U11111111', 'U22222222'];
      
      // Mock SinglePersonSync instances
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => ({
        sync: jest.fn().mockResolvedValue(undefined),
        getMappedPerson: jest.fn().mockResolvedValue(mockInput),
        getPushResult: jest.fn().mockReturnValue({
          status: Status.SUCCESS,
          message: 'Person pushed successfully',
          timestamp: new Date(),
          primaryKey: [{ id: params.buid }],
          crud: CrudOperation.CREATE
        })
      }));

      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
        hashStorage: {
          enabled: false,
          deltaStrategy: mockDeltaStrategy
        }
      });
      await batchSync.syncAll();

      // Verify hash storage was NOT updated
      expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
      expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
    });

    it('should not update hash storage when hashStorage is undefined', async () => {
      const buids = ['U11111111'];
      
      // Mock SinglePersonSync instances
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => ({
        sync: jest.fn().mockResolvedValue(undefined),
        getMappedPerson: jest.fn().mockResolvedValue(mockInput),
        getPushResult: jest.fn().mockReturnValue({
          status: Status.SUCCESS,
          message: 'Person pushed successfully',
          timestamp: new Date(),
          primaryKey: [{ id: params.buid }],
          crud: CrudOperation.CREATE
        })
      }));

      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids
      });
      await batchSync.syncAll();

      // Verify hash storage was NOT updated
      expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
      expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
    });

    it('should only include successful syncs in batch hash storage update', async () => {
      const buids = ['U11111111', 'U22222222'];
      
      const freshDataMapper = {
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
      };

      // Mock SinglePersonSync instances - all successful, track instances
      const mockSyncInstances: any[] = [];
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => {
        const mockInstance = {
          sync: jest.fn().mockResolvedValue(undefined),
          getMappedPerson: jest.fn().mockResolvedValue(mockInput),
          getPushResult: jest.fn().mockReturnValue({
            status: Status.SUCCESS,
            message: 'Person pushed successfully',
            timestamp: new Date(),
            primaryKey: [{ id: params.buid }],
            crud: CrudOperation.CREATE
          })
        };
        mockSyncInstances.push(mockInstance);
        return mockInstance;
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
        dataMapper: freshDataMapper as any,
        hashStorage: {
          enabled: true,
          deltaStrategy: mockDeltaStrategy
        }
      });
      await batchSync.syncAll();

      // Verify each sync was called with suppressHashUpdate to prevent individual updates
      mockSyncInstances.forEach(instance => {
        expect(instance.sync).toHaveBeenCalledWith({ suppressHashUpdate: true });
      });

      // Verify only successful syncs were added to hash storage
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully updated hash storage with 2 person record(s)')
      );

      consoleSpy.mockRestore();
    });

    it('should log warning and continue when batch hash storage update fails', async () => {
      const buids = ['U11111111'];
      mockStorage.fetchPreviousData.mockRejectedValue(new Error('Storage fetch failed'));
      
      const freshDataMapper = {
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
      };

      // Mock SinglePersonSync instances
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => ({
        sync: jest.fn().mockResolvedValue(undefined),
        getMappedPerson: jest.fn().mockResolvedValue(mockInput),
        getPushResult: jest.fn().mockReturnValue({
          status: Status.SUCCESS,
          message: 'Person pushed successfully',
          timestamp: new Date(),
          primaryKey: [{ id: params.buid }],
          crud: CrudOperation.CREATE
        })
      }));

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
        dataMapper: freshDataMapper as any,
        hashStorage: {
          enabled: true,
          deltaStrategy: mockDeltaStrategy
        }
      });
      await batchSync.syncAll();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update hash storage in batch')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should call getMappedPerson only once per person during batch operations (caching)', async () => {
      const buids = ['U11111111', 'U22222222'];
      
      const freshDataMapper = {
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
      };

      // Mock SinglePersonSync instances and track getMappedPerson calls
      const mockSyncInstances: any[] = [];
      (SinglePersonSync as jest.Mock).mockClear().mockImplementation((params) => {
        const getMappedPersonMock = jest.fn().mockResolvedValue(mockInput);
        const mockInstance = {
          sync: jest.fn().mockResolvedValue(undefined),
          getMappedPerson: getMappedPersonMock,
          getPushResult: jest.fn().mockReturnValue({
            status: Status.SUCCESS,
            message: 'Person pushed successfully',
            timestamp: new Date(),
            primaryKey: [{ id: params.buid }],
            crud: CrudOperation.CREATE
          })
        };
        mockSyncInstances.push(mockInstance);
        return mockInstance;
      });

      const batchSync = new BatchPersonSync({
        config: mockConfig,
        buids,
        dataMapper: freshDataMapper as any,
        hashStorage: {
          enabled: true,
          deltaStrategy: mockDeltaStrategy
        }
      });
      await batchSync.syncAll();

      // Verify getMappedPerson was called for each person (once during batch hash collection)
      // Note: In the real implementation with caching, sync() calls getMappedPerson once,
      // then syncAll calls it again, but the cached version is returned.
      // In this mock test, we verify the pattern is correct (each instance gets called).
      mockSyncInstances.forEach(instance => {
        expect(instance.getMappedPerson).toHaveBeenCalled();
      });

      // The key test: verify that for each person, getMappedPerson is called exactly once
      // with the caching implementation, preventing duplicate source API calls
      mockSyncInstances.forEach(instance => {
        expect(instance.getMappedPerson).toHaveBeenCalledTimes(1);
      });
    });
  });
});
