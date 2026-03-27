import { DataMapper, getDataMapperMaps, StaticMapUsage } from '../../src/data-mapper/DataMapper';
import { CountryLookup } from '../../src/data-mapper/DataMapperCountry';
import { StateLookup } from '../../src/data-mapper/DataMapperState';
import { loadOrgMap } from '../../src/data-mapper/DataMapperOrg';
import { Config } from '../../src/config/Config';

// Mock the data source modules
jest.mock('../../src/data-mapper/DataMapperCountry');
jest.mock('../../src/data-mapper/DataMapperState');
jest.mock('../../src/data-mapper/DataMapperOrg');

const mockCountryLookup = CountryLookup as jest.Mocked<typeof CountryLookup>;
const mockStateLookup = StateLookup as jest.Mocked<typeof StateLookup>;
const mockLoadOrgMap = loadOrgMap as jest.MockedFunction<typeof loadOrgMap>;

describe('StaticMapUsage Integration Tests', () => {
  const mockConfig = {
    personApi: {
      urlPattern: 'http://example.com',
      requestsPerSecond: 10
    }
  } as unknown as Config;

  const mockStateMappings = {
    forwardMap: new Map([['MA', { huronCode: 'massachusetts', huronName: 'Massachusetts' }]]),
    reverseMap: new Map([['Massachusetts', 'MA']])
  };

  const mockCountryMappings = {
    forwardMap: new Map([['US', { huronCode: 'usa', huronName: 'United States' }]]),
    reverseMap: new Map([['United States', 'US']])
  };

  const mockOrgMappings = {
    forwardMap: new Map([['12345', 'hrn:hrs:organizations/test-org']]),
    reverseMap: new Map([['hrn:hrs:organizations/test-org', '12345']])
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateLookup.loadStates = jest.fn().mockResolvedValue(mockStateMappings);
    mockCountryLookup.loadCountries = jest.fn().mockResolvedValue(mockCountryMappings);
    mockLoadOrgMap.mockResolvedValue(mockOrgMappings);
  });

  describe('getDataMapperMaps with StaticMapUsage', () => {
    it('should not load state mappings when staticMapUsage.stateMap is false', async () => {
      const staticMapUsage: StaticMapUsage = { stateMap: false, countryMap: true, orgMap: true };
      
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeDefined();
      expect(result.orgMappings).toBeDefined();
      expect(mockStateLookup.loadStates).not.toHaveBeenCalled();
      expect(mockCountryLookup.loadCountries).toHaveBeenCalled();
      expect(mockLoadOrgMap).toHaveBeenCalled();
    });

    it('should not load country mappings when staticMapUsage.countryMap is false', async () => {
      const staticMapUsage: StaticMapUsage = { stateMap: true, countryMap: false, orgMap: true };
      
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.stateMappings).toBeDefined();
      expect(result.countryMappings).toBeUndefined();
      expect(result.orgMappings).toBeDefined();
      expect(mockStateLookup.loadStates).toHaveBeenCalled();
      expect(mockCountryLookup.loadCountries).not.toHaveBeenCalled();
      expect(mockLoadOrgMap).toHaveBeenCalled();
    });

    it('should not load org mappings when staticMapUsage.orgMap is false', async () => {
      const staticMapUsage: StaticMapUsage = { stateMap: true, countryMap: true, orgMap: false };
      
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.stateMappings).toBeDefined();
      expect(result.countryMappings).toBeDefined();
      expect(result.orgMappings).toBeUndefined();
      expect(mockStateLookup.loadStates).toHaveBeenCalled();
      expect(mockCountryLookup.loadCountries).toHaveBeenCalled();
      expect(mockLoadOrgMap).not.toHaveBeenCalled();
    });

    it('should not load any mappings when staticMapUsage has all false', async () => {
      const staticMapUsage: StaticMapUsage = { stateMap: false, countryMap: false, orgMap: false };
      
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
      expect(result.orgMappings).toBeUndefined();
      expect(mockStateLookup.loadStates).not.toHaveBeenCalled();
      expect(mockCountryLookup.loadCountries).not.toHaveBeenCalled();
      expect(mockLoadOrgMap).not.toHaveBeenCalled();
    });

    it('should not load any mappings when staticMapUsage is undefined', async () => {
      const result = await getDataMapperMaps(mockConfig, undefined);

      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
      expect(result.orgMappings).toBeUndefined();
      expect(mockStateLookup.loadStates).not.toHaveBeenCalled();
      expect(mockCountryLookup.loadCountries).not.toHaveBeenCalled();
      expect(mockLoadOrgMap).not.toHaveBeenCalled();
    });

    it('should not load any mappings when staticMapUsage is empty object', async () => {
      const staticMapUsage: StaticMapUsage = {};
      
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.stateMappings).toBeUndefined();
      expect(result.countryMappings).toBeUndefined();
      expect(result.orgMappings).toBeUndefined();
      expect(mockStateLookup.loadStates).not.toHaveBeenCalled();
      expect(mockCountryLookup.loadCountries).not.toHaveBeenCalled();
      expect(mockLoadOrgMap).not.toHaveBeenCalled();
    });

    it('should load all mappings when staticMapUsage has all true', async () => {
      const staticMapUsage: StaticMapUsage = { stateMap: true, countryMap: true, orgMap: true };
      
      const result = await getDataMapperMaps(mockConfig, staticMapUsage);

      expect(result.stateMappings).toBeDefined();
      expect(result.countryMappings).toBeDefined();
      expect(result.orgMappings).toBeDefined();
      expect(mockStateLookup.loadStates).toHaveBeenCalled();
      expect(mockCountryLookup.loadCountries).toHaveBeenCalled();
      expect(mockLoadOrgMap).toHaveBeenCalled();
    });
  });

  describe('DataMapper with dynamic lookup syntax', () => {
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

    describe('Country lookup syntax behavior', () => {
      it('should have undefined countryMappings when instantiated without them', () => {
        const mapper = new DataMapper({ 
          currentTerms: mockCurrentTerms,
          stateMappings: mockStateMappings,
          countryMappings: undefined  // Simulates countryMap: false
        });

        expect(mapper.countryMappings).toBeUndefined();
        expect(mapper.stateMappings).toBeDefined();
      });
    });

    describe('State lookup syntax behavior', () => {
      it('should have undefined stateMappings when instantiated without them', () => {
        const mapper = new DataMapper({ 
          currentTerms: mockCurrentTerms,
          stateMappings: undefined,  // Simulates stateMap: false
          countryMappings: mockCountryMappings
        });

        expect(mapper.stateMappings).toBeUndefined();
        expect(mapper.countryMappings).toBeDefined();
      });
    });

    describe('Organization lookup syntax when orgMap is false', () => {
      it('should return lookup:sourceIdentifier:XX format when orgHrn is undefined', () => {
        const mapper = new DataMapper({ 
          currentTerms: mockCurrentTerms,
          // No orgHrn provided - simulates orgMap: false
        });

        const orgHrn = mapper.orgHrn('99999');
        expect(orgHrn).toBe('lookup:sourceIdentifier:99999');
      });

      it('should use static map when orgHrn function is provided', () => {
        const orgMappings = {
          forwardMap: new Map([['12345', 'hrn:hrs:organizations/bu']]),
          reverseMap: new Map([['hrn:hrs:organizations/bu', '12345']])
        };

        const mapper = new DataMapper({ 
          currentTerms: mockCurrentTerms,
          orgHrn: (id: string) => orgMappings.forwardMap.get(id),
          orgMappings
        });

        const orgHrn = mapper.orgHrn('12345');
        expect(orgHrn).toBe('hrn:hrs:organizations/bu');
      });

      it('should return undefined for unmapped org when orgHrn function provided', () => {
        const orgMappings = {
          forwardMap: new Map([['12345', 'hrn:hrs:organizations/bu']]),
          reverseMap: new Map([['hrn:hrs:organizations/bu', '12345']])
        };

        const mapper = new DataMapper({ 
          currentTerms: mockCurrentTerms,
          orgHrn: (id: string) => orgMappings.forwardMap.get(id),
          orgMappings
        });

        // Request an org ID that's not in the map - returns undefined (not lookup syntax)
        const orgHrn = mapper.orgHrn('99999');
        expect(orgHrn).toBeUndefined();
      });
    });

    describe('Mixed scenarios - verification of mapper state', () => {
      it('should have all mappings undefined when none provided', () => {
        const mapper = new DataMapper({ 
          currentTerms: mockCurrentTerms
          // No static maps provided
        });

        expect(mapper.stateMappings).toBeUndefined();
        expect(mapper.countryMappings).toBeUndefined();
        expect(mapper.orgMappings).toBeUndefined();
        
        // All should use lookup syntax
        expect(mapper.orgHrn('54321')).toBe('lookup:sourceIdentifier:54321');
      });

      it('should have exactly the mappings that were provided', () => {
        const mapper = new DataMapper({ 
          currentTerms: mockCurrentTerms,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        });

        expect(mapper.stateMappings).toBeDefined();
        expect(mapper.countryMappings).toBeDefined();
        expect(mapper.orgMappings).toBeDefined();
        expect(mapper.stateMappings?.forwardMap.size).toBe(1);
        expect(mapper.countryMappings?.forwardMap.size).toBe(1);
        expect(mapper.orgMappings?.forwardMap.size).toBe(1);
      });
    });
  });
});
