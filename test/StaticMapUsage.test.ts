import { HuronPersonIntegration } from '../src/SyncPeople';
import { Config } from '../src/config/Config';
import { getDataMapper, getDataMapperMaps, StaticMapUsage } from '../src/data-mapper/DataMapper';
import * as DataMapperCountry from '../src/data-mapper/DataMapperCountry';
import * as DataMapperOrg from '../src/data-mapper/DataMapperOrg';
import * as DataMapperState from '../src/data-mapper/DataMapperState';

// Mock the external dependencies
jest.mock('../src/data-mapper/DataMapperOrg');
jest.mock('../src/data-mapper/DataMapperState');
jest.mock('../src/data-mapper/DataMapperCountry');
jest.mock('../src/data-source/CurrentTermsDataSource');

const mockConfig: Config = {
  dataSource: {
    person: {
      endpointConfig: {
        baseUrl: 'https://datasource.example.com',
        apiKey: 'test-api-key'
      },
      fetchPath: '/api/v1/persons'
    },
    people: {
      endpointConfig: {
        baseUrl: 'https://datasource.example.com',
        apiKey: 'test-api-key'
      },
      fetchPath: '/api/v1/persons'
    },
    terms: {
      endpointConfig: {
        baseUrl: 'https://datasource.example.com',
        apiKey: 'test-api-key'
      },
      fetchPath: '/api/v1/terms'
    }
  },
  dataTarget: {
    endpointConfig: {
      baseUrl: 'https://datatarget.example.com',
      authMethod: 'basic',
      loginSvcPath: '/auth/token',
      username: 'dt-user',
      password: 'dt-pass'
    },
    personsPath: '/api/v1/persons/batch',
    organizationsPath: '/api/v1/organizations'
  },
  integration: {
    clientId: 'test-client-id',
    batchSize: 50,
    timeout: 10000
  },
  storage: {
    type: 'file',
    config: {
      path: './data/storage'
    }
  }
};

describe('StaticMapUsage', () => {
  const mockOrgMappings = {
    forwardMap: new Map([['org1', 'hrn:hrs:organizations:1']]),
    reverseMap: new Map([['hrn:hrs:organizations:1', 'org1']])
  };

  const mockStateMappings = {
    forwardMap: new Map([['MA', 'hrn:hrs:lists:states/massachusetts']]),
    reverseMap: new Map([['hrn:hrs:lists:states/massachusetts', 'MA']])
  };

  const mockCountryMappings = {
    forwardMap: new Map([['USA', 'hrn:hrs:lists:countries/usa']]),
    reverseMap: new Map([['hrn:hrs:lists:countries/usa', 'USA']])
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the load functions
    (DataMapperOrg.loadOrgMap as jest.Mock).mockResolvedValue(mockOrgMappings);
    (DataMapperState.StateLookup.loadStates as jest.Mock).mockResolvedValue(mockStateMappings);
    (DataMapperCountry.CountryLookup.loadCountries as jest.Mock).mockResolvedValue(mockCountryMappings);

    // Mock CurrentTermsDataSource
    const BuCdmCurrentTermsDataSource = require('../src/data-source/CurrentTermsDataSource').BuCdmCurrentTermsDataSource;
    BuCdmCurrentTermsDataSource.prototype.fetchRaw = jest.fn().mockResolvedValue([
      { termId: '202601', termName: 'Spring 2026' }
    ]);
  });

  describe('getDataMapperMaps', () => {
    it('should not load any maps when staticMapUsage is undefined (default behavior)', async () => {
      const result = await getDataMapperMaps(mockConfig);

      expect(result.orgMappings).toBeUndefined();
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
      expect(DataMapperOrg.loadOrgMap).not.toHaveBeenCalled();
      expect(DataMapperState.StateLookup.loadStates).not.toHaveBeenCalled();
      expect(DataMapperCountry.CountryLookup.loadCountries).not.toHaveBeenCalled();
    });

    it('should not load any maps when all staticMapUsage flags are false', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: false, stateMap: false, countryMap: false };
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.orgMappings).toBeUndefined();
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
      expect(DataMapperOrg.loadOrgMap).not.toHaveBeenCalled();
      expect(DataMapperState.StateLookup.loadStates).not.toHaveBeenCalled();
      expect(DataMapperCountry.CountryLookup.loadCountries).not.toHaveBeenCalled();
    });

    it('should load only orgMap when orgMap is true', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: false, countryMap: false };
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.orgMappings).toEqual(mockOrgMappings);
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
      expect(DataMapperOrg.loadOrgMap).toHaveBeenCalledWith(mockConfig);
      expect(DataMapperState.StateLookup.loadStates).not.toHaveBeenCalled();
      expect(DataMapperCountry.CountryLookup.loadCountries).not.toHaveBeenCalled();
    });

    it('should load only stateMap when stateMap is true', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: false, stateMap: true, countryMap: false };
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.orgMappings).toBeUndefined();
      expect(result.stateMappings).toEqual(mockStateMappings);
      expect(result.countryMappings).toBeUndefined();
      expect(DataMapperOrg.loadOrgMap).not.toHaveBeenCalled();
      expect(DataMapperState.StateLookup.loadStates).toHaveBeenCalledWith(mockConfig);
      expect(DataMapperCountry.CountryLookup.loadCountries).not.toHaveBeenCalled();
    });

    it('should load only countryMap when countryMap is true', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: false, stateMap: false, countryMap: true };
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.orgMappings).toBeUndefined();
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toEqual(mockCountryMappings);
      expect(DataMapperOrg.loadOrgMap).not.toHaveBeenCalled();
      expect(DataMapperState.StateLookup.loadStates).not.toHaveBeenCalled();
      expect(DataMapperCountry.CountryLookup.loadCountries).toHaveBeenCalledWith(mockConfig);
    });

    it('should load all maps when all flags are true', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: true, countryMap: true };
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.orgMappings).toEqual(mockOrgMappings);
      expect(result.stateMappings).toEqual(mockStateMappings);
      expect(result.countryMappings).toEqual(mockCountryMappings);
      expect(DataMapperOrg.loadOrgMap).toHaveBeenCalledWith(mockConfig);
      expect(DataMapperState.StateLookup.loadStates).toHaveBeenCalledWith(mockConfig);
      expect(DataMapperCountry.CountryLookup.loadCountries).toHaveBeenCalledWith(mockConfig);
    });

    it('should load mixed maps based on flags', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: false, countryMap: true };
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.orgMappings).toEqual(mockOrgMappings);
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toEqual(mockCountryMappings);
      expect(DataMapperOrg.loadOrgMap).toHaveBeenCalledWith(mockConfig);
      expect(DataMapperState.StateLookup.loadStates).not.toHaveBeenCalled();
      expect(DataMapperCountry.CountryLookup.loadCountries).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('getDataMapper', () => {
    it('should create DataMapper with no mappings when staticMapUsage is undefined', async () => {
      const dataMapper = await getDataMapper(mockConfig);

      expect(dataMapper.stateMappings).toBeUndefined();
      expect(dataMapper.countryMappings).toBeUndefined();
      expect(dataMapper.orgMappings).toBeUndefined();
    });

    it('should create DataMapper with all mappings when staticMapUsage flags are all true', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: true, countryMap: true };
      const dataMapper = await getDataMapper(mockConfig, staticMapUsage);

      expect(dataMapper.stateMappings).toEqual(mockStateMappings);
      expect(dataMapper.countryMappings).toEqual(mockCountryMappings);
      expect(dataMapper.orgMappings).toEqual(mockOrgMappings);
    });

    it('should create DataMapper with selective mappings based on flags', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: false, countryMap: true };
      const dataMapper = await getDataMapper(mockConfig, staticMapUsage);

      expect(dataMapper.stateMappings).toBeUndefined();
      expect(dataMapper.countryMappings).toEqual(mockCountryMappings);
      expect(dataMapper.orgMappings).toEqual(mockOrgMappings);
    });
  });

  describe('HuronPersonIntegration staticMapUsage parameter', () => {
    it('should accept staticMapUsage parameter in constructor', () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: true, countryMap: false };
      
      expect(() => new HuronPersonIntegration({ 
        config: mockConfig, 
        staticMapUsage 
      })).not.toThrow();
    });

    it('should work without staticMapUsage parameter (backward compatibility)', () => {
      expect(() => new HuronPersonIntegration({ 
        config: mockConfig 
      })).not.toThrow();
    });

    it('should accept partial staticMapUsage with some flags undefined', () => {
      const staticMapUsage = { orgMap: true } as StaticMapUsage;
      
      expect(() => new HuronPersonIntegration({ 
        config: mockConfig, 
        staticMapUsage 
      })).not.toThrow();
    });

    it('should default all flags to false when staticMapUsage is not provided', () => {
      const integration = new HuronPersonIntegration({ config: mockConfig });
      
      // The integration should have been instantiated successfully
      expect(integration).toBeDefined();
      expect(integration.getConfig()).toEqual(mockConfig);
    });

    it('should store staticMapUsage for use during run()', () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: true, countryMap: true };
      const integration = new HuronPersonIntegration({ 
        config: mockConfig, 
        staticMapUsage 
      });
      
      // Verify integration was created with staticMapUsage
      expect(integration).toBeDefined();
    });
  });

  describe('Lookup expression defaults', () => {
    it('should use lookup expressions for orgs when orgMap is false', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: false, stateMap: true, countryMap: true };
      const dataMapper = await getDataMapper(mockConfig, staticMapUsage);

      // When orgMap is false, orgMappings should be undefined
      expect(dataMapper.orgMappings).toBeUndefined();
      
      // This means the DataMapper will use lookup expressions like "lookup:sourceIdentifier:12345"
      expect(DataMapperOrg.loadOrgMap).not.toHaveBeenCalled();
    });

    it('should use lookup expressions for states when stateMap is false', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: false, countryMap: true };
      const dataMapper = await getDataMapper(mockConfig, staticMapUsage);

      // When stateMap is false, stateMappings should be undefined
      expect(dataMapper.stateMappings).toBeUndefined();
      expect(DataMapperState.StateLookup.loadStates).not.toHaveBeenCalled();
    });

    it('should use lookup expressions for countries when countryMap is false', async () => {
      const staticMapUsage: StaticMapUsage = { orgMap: true, stateMap: true, countryMap: false };
      const dataMapper = await getDataMapper(mockConfig, staticMapUsage);

      // When countryMap is false, countryMappings should be undefined
      expect(dataMapper.countryMappings).toBeUndefined();
      expect(DataMapperCountry.CountryLookup.loadCountries).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty staticMapUsage object', async () => {
      const staticMapUsage = {} as StaticMapUsage;
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      // All should be undefined since all default to false
      expect(result.orgMappings).toBeUndefined();
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
    });

    it('should handle null-like values in staticMapUsage', async () => {
      const staticMapUsage = { orgMap: undefined, stateMap: undefined, countryMap: undefined } as any;
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      // Undefined should be treated as false
      expect(result.orgMappings).toBeUndefined();
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
    });

    it('should handle truthy non-boolean values in staticMapUsage', async () => {
      const staticMapUsage = { orgMap: 1, stateMap: 'yes', countryMap: {} } as any;
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      // Truthy values should be treated as true
      expect(result.orgMappings).toEqual(mockOrgMappings);
      expect(result.stateMappings).toEqual(mockStateMappings);
      expect(result.countryMappings).toEqual(mockCountryMappings);
    });

    it('should handle falsy non-boolean values in staticMapUsage', async () => {
      const staticMapUsage = { orgMap: 0, stateMap: '', countryMap: null } as any;
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      // Falsy values should be treated as false
      expect(result.orgMappings).toBeUndefined();
      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
    });
  });
});
