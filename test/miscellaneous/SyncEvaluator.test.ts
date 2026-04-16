import { FieldSet } from 'integration-core';
import { SourcePerson, SourcePersonParms, TargetPersonParms } from '../../src/miscellaneous/SyncEvaluator';
import { Config } from '../../src/config/Config';
import { DataMapper, ReverseDataMapper } from '../../src/data-mapper/DataMapper';
import { BuCdmPersonDataSource } from '../../src/data-source/PersonDataSource';
import { ReadPerson } from '../../src/data-target/crud/ReadPerson';
import { HuronPerson } from '../../src/data-target/crud/Person';
import { FieldFilter } from '../../src/data-mapper/FieldFilter';

// Mock dependencies
jest.mock('../../src/data-source/PersonDataSource');
jest.mock('../../src/data-target/crud/ReadPerson');

const mockBuCdmPersonDataSource = BuCdmPersonDataSource as jest.MockedClass<typeof BuCdmPersonDataSource>;
const mockReadPerson = ReadPerson as jest.MockedClass<typeof ReadPerson>;

describe('SyncEvaluator - Lookup Expression Handling', () => {
  let mockConfig: Config;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      personApi: {
        urlPattern: 'http://example.com',
        requestsPerSecond: 10
      }
    } as unknown as Config;
  });

  describe('FieldFilter integration with SourcePerson', () => {
    it('should use FieldFilter to normalize lookup expressions in organization fields', () => {
      const mockStateMappings = {
        forwardMap: new Map([['MA', { huronCode: 'MA', huronName: 'Massachusetts' }]]),
        reverseMap: new Map([['MA', 'MA']])
      };

      const mockCountryMappings = {
        forwardMap: new Map([['US', { huronCode: 'US', huronName: 'United States' }]]),
        reverseMap: new Map([['US', 'US']])
      };

      const mockOrgMappings = {
        forwardMap: new Map([['10003827', 'urn:dco:organization:10003827']]),
        reverseMap: new Map([['urn:dco:organization:10003827', '10003827']])
      };

      // Test that lookup expression is normalized to the same value as static HRN
      const fieldSetWithLookup: FieldSet = {
        fieldValues: [
          {
            employer: {
              hrn: 'lookup:sourceIdentifier:10003827',
              name: 'Test Org'
            }
          }
        ]
      };

      const fieldSetWithStaticHrn: FieldSet = {
        fieldValues: [
          {
            employer: {
              hrn: 'urn:dco:organization:10003827',
              name: 'Test Org'
            }
          }
        ]
      };

      const filterParams1 = {
        fieldSet: fieldSetWithLookup,
        stateMappings: mockStateMappings,
        countryMappings: mockCountryMappings,
        orgMappings: mockOrgMappings
      };

      const filterParams2 = {
        fieldSet: fieldSetWithStaticHrn,
        stateMappings: mockStateMappings,
        countryMappings: mockCountryMappings,
        orgMappings: mockOrgMappings
      };

      const result1 = new FieldFilter(filterParams1).filter();
      const result2 = new FieldFilter(filterParams2).filter();

      // Both should normalize to the same value (10003827)
      expect(result1.fieldValues[0]).toEqual({ employer: '10003827' });
      expect(result2.fieldValues[0]).toEqual({ employer: '10003827' });
      expect(result1.fieldValues).toEqual(result2.fieldValues);
    });

    it('should normalize multiple organization fields with lookup expressions', () => {
      const mockOrgMappings = {
        forwardMap: new Map(),
        reverseMap: new Map()
      };

      const fieldSet: FieldSet = {
        fieldValues: [
          {
            employer: {
              hrn: 'lookup:sourceIdentifier:12345',
              name: 'Employer'
            }
          },
          {
            secondaryUnit: {
              hrn: 'lookup:sourceIdentifier:54321',
              name: 'Secondary'
            }
          },
          {
            additionalUnit: {
              hrn: 'lookup:sourceIdentifier:99999',
              name: 'Additional'
            }
          }
        ]
      };

      const filterParams = {
        fieldSet,
        stateMappings: { forwardMap: new Map(), reverseMap: new Map() },
        countryMappings: { forwardMap: new Map(), reverseMap: new Map() },
        orgMappings: mockOrgMappings
      };

      const result = new FieldFilter(filterParams).filter();

      expect(result.fieldValues).toHaveLength(3);
      expect(result.fieldValues[0]).toEqual({ employer: '12345' });
      expect(result.fieldValues[1]).toEqual({ secondaryUnit: '54321' });
      expect(result.fieldValues[2]).toEqual({ additionalUnit: '99999' });
    });

    it('should normalize state and country lookup expressions', () => {
      const mockStateMappings = {
        forwardMap: new Map(),
        reverseMap: new Map()
      };

      const mockCountryMappings = {
        forwardMap: new Map(),
        reverseMap: new Map()
      };

      const fieldSet: FieldSet = {
        fieldValues: [
          {
            contactInformation: {
              stateProvince: {
                hrn: 'lookup:name:MA',
                name: 'MA'
              },
              country: {
                hrn: 'lookup:name:US',
                name: 'US'
              }
            }
          }
        ]
      };

      const filterParams = {
        fieldSet,
        stateMappings: mockStateMappings,
        countryMappings: mockCountryMappings
      };

      const result = new FieldFilter(filterParams).filter();

      expect(result.fieldValues[0].contactInformation).toEqual({
        stateProvince: 'MA',
        country: 'US'
      });
    });

    it('should handle mixed lookup and static HRNs consistently', () => {
      const mockStateMappings = {
        forwardMap: new Map([['MA', { huronCode: 'MA', huronName: 'Massachusetts' }]]),
        reverseMap: new Map([['MA', 'MA']])
      };

      const mockCountryMappings = {
        forwardMap: new Map([['US', { huronCode: 'US', huronName: 'United States' }]]),
        reverseMap: new Map([['US', 'US']])
      };

      const mockOrgMappings = {
        forwardMap: new Map([['10003827', 'urn:dco:organization:10003827']]),
        reverseMap: new Map([['urn:dco:organization:10003827', '10003827']])
      };

      // One fieldSet with all lookup expressions
      const fieldSet1: FieldSet = {
        fieldValues: [
          {
            employer: {
              hrn: 'lookup:sourceIdentifier:10003827',
              name: 'Employer'
            }
          },
          {
            contactInformation: {
              stateProvince: {
                hrn: 'lookup:name:MA',
                name: 'MA'
              },
              country: {
                hrn: 'lookup:name:US',
                name: 'US'
              }
            }
          }
        ]
      };

      // Another fieldSet with all static HRNs
      const fieldSet2: FieldSet = {
        fieldValues: [
          {
            employer: {
              hrn: 'urn:dco:organization:10003827',
              name: 'Employer'
            }
          },
          {
            contactInformation: {
              stateProvince: {
                hrn: 'hrn:hrs:lists:states/MA',
                name: 'Massachusetts'
              },
              country: {
                hrn: 'hrn:hrs:lists:countries/US',
                name: 'United States'
              }
            }
          }
        ]
      };

      const filterParams1 = {
        fieldSet: fieldSet1,
        stateMappings: mockStateMappings,
        countryMappings: mockCountryMappings,
        orgMappings: mockOrgMappings
      };

      const filterParams2 = {
        fieldSet: fieldSet2,
        stateMappings: mockStateMappings,
        countryMappings: mockCountryMappings,
        orgMappings: mockOrgMappings
      };

      const result1 = new FieldFilter(filterParams1).filter();
      const result2 = new FieldFilter(filterParams2).filter();

      // Both should normalize to exactly the same values
      expect(result1.fieldValues).toEqual(result2.fieldValues);
      expect(result1.fieldValues[0]).toEqual({ employer: '10003827' });
      expect(result1.fieldValues[1].contactInformation).toEqual({
        stateProvince: 'MA',
        country: 'US'
      });
    });
  });

  describe('Data lookup scenarios', () => {
    const mockCurrentTerms = [
      {
        term: '2261',
        termDescription: 'Spring 2026',
        academicCareer: 'GRAD',
        termBeginDate: '20260120',
        termEndDate: '20260508',
        currentInd: 'Y'
      }
    ];

    it('should fetch source data when only buid provided', async () => {
      const mockCdmPerson = {
        personid: 'U12345678',
        personBasic: {
          names: [{ firstName: 'John', lastName: 'Doe', nameType: 'PRI' }]
        }
      };

      const mockFetchRaw = jest.fn().mockResolvedValue([mockCdmPerson]);
      mockBuCdmPersonDataSource.mockImplementation(() => ({
        fetchRaw: mockFetchRaw
      } as any));

      const sourceDataMapper = new DataMapper({
        currentTerms: mockCurrentTerms,
        idpName: 'test-idp'
      });

      const sourcePersonParms: SourcePersonParms = {
        config: mockConfig,
        buid: 'U12345678',
        sourceDataMapper
      };

      const sourcePerson = new SourcePerson(sourcePersonParms);
      const input = await sourcePerson['getInputFromSource'](sourcePersonParms);

      expect(mockFetchRaw).toHaveBeenCalled();
      expect(input).toBeDefined();
      expect(input?.fieldSets).toHaveLength(1);
    });

    it('should throw error when neither buid nor cdmPerson provided', async () => {
      const sourceDataMapper = new DataMapper({
        currentTerms: mockCurrentTerms,
        idpName: 'test-idp'
      });

      const sourcePersonParms: SourcePersonParms = {
        config: mockConfig,
        sourceDataMapper
      };

      const sourcePerson = new SourcePerson(sourcePersonParms);

      await expect(
        sourcePerson['getInputFromSource'](sourcePersonParms)
      ).rejects.toThrow('Either buid or cdmPerson must be provided to generate hash');
    });

    it('should throw error when neither hrn, buid, nor huronPerson provided for target', async () => {
      const targetDataMapper = new ReverseDataMapper();

      const targetPersonParms: TargetPersonParms = {
        config: mockConfig,
        targetDataMapper
      };

      const mockCdmPerson = {
        personid: 'U12345678',
        personBasic: {
          names: [{ firstName: 'John', lastName: 'Doe', nameType: 'PRI' }]
        }
      };

      const sourceDataMapper = new DataMapper({
        currentTerms: mockCurrentTerms,
        idpName: 'test-idp'
      });

      const sourcePersonParms: SourcePersonParms = {
        config: mockConfig,
        cdmPerson: [mockCdmPerson],
        sourceDataMapper
      };

      const sourcePerson = new SourcePerson(sourcePersonParms);

      await expect(
        sourcePerson['getInputFromTarget'](targetPersonParms)
      ).rejects.toThrow('Either hrn, buid, or huronPerson must be provided to generate hash');
    });
  });
});

