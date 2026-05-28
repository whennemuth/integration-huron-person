import { DataMapper } from '../../src/data-mapper/DataMapper';
import { Term } from '../../src/data-source/CurrentTermsDataSource';
import { StateRow, StateMappings } from '../../src/data-mapper/DataMapperState';
import { CountryRow, CountryMappings } from '../../src/data-mapper/DataMapperCountry';

describe('DataMapper', () => {
  // Mock current terms data for tests
  const mockCurrentTerms: Term[] = [
    {
      term: '2261',
      termDescription: 'Spring 2026',
      academicCareer: 'GRAD',
      termBeginDate: '20260120',
      termEndDate: '20260508',
      currentInd: 'Y'
    },
    {
      term: '2261',
      termDescription: 'Spring 2026',
      academicCareer: 'UGRD',
      termBeginDate: '20260120',
      termEndDate: '20260508',
      currentInd: 'Y'
    }
  ];

  // Mock state and country mappings for tests
  const mockStateMappings: StateMappings = {
    forwardMap: new Map<string, StateRow>([
      ['MA', { huronCode: 'MA', huronName: 'Massachusetts' }],
      ['NY', { huronCode: 'NY', huronName: 'New York' }]
    ]),
    reverseMap: new Map<string, string>([
      ['MA', 'MA'],
      ['NY', 'NY']
    ])
  };

  const mockCountryMappings: CountryMappings = {
    forwardMap: new Map<string, CountryRow>([
      ['US', { huronCode: 'US', huronName: 'United States' }],
      ['CA', { huronCode: 'CA', huronName: 'Canada' }]
    ]),
    reverseMap: new Map<string, string>([
      ['US', 'US'],
      ['CA', 'CA']
    ])
  };

  describe('map', () => {
        it('should expose mapping error count via getter', async () => {
          const mockCurrentTerms: Term[] = [];
          const mapper = new DataMapper({ currentTerms: mockCurrentTerms, idpName: 'test-idp' });
          
          // Initial mapping error count should be 0
          expect(mapper.getMappingErrorCount()).toBe(0);
          
          // Map normal data
          const person = {
            personid: '123',
            personBasic: { names: [{ firstName: 'Test', lastName: 'User' }] },
            employeeInfo: { address: [] },
            studentInfo: { address: [] },
            facultyInfo: { address: [] },
            affiliateInfo: { address: [] },
            constituentInfo: { address: [] }
          };
          
          const result = mapper.map([person]);
          
          // After mapping normal data, error count should still be 0
          expect(mapper.getMappingErrorCount()).toBe(0);
          expect(result.fieldSets).toHaveLength(1);
          
          // Test clearMappingErrorCount() method
          mapper.clearMappingErrorCount();
          expect(mapper.getMappingErrorCount()).toBe(0);
        });
    it('should map bugs.json source to bugs.json target', () => {
      const source = require('./source/bugs.json');
      const expectedTarget = require('./target/bugs.json');

      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const result = mapper.map([source]);

      // The result should have fieldSets with one item, and fieldValues should match expectedTarget
      expect(result.fieldSets).toHaveLength(1);
      const actual = result.fieldSets[0].fieldValues;
      const expected = expectedTarget;
      
      // Filter out fields with undefined/null values from actual output
      // Also filter out temporary reactivation flag __active that is used during mapping but removed before hashing
      const filteredActual = actual.filter((field: any) => {
        const key = Object.keys(field)[0];
        const value = field[key];
        // Exclude fields with undefined/null/empty values and the temporary __active field
        return value !== undefined && value !== null && value !== '' && key !== '__active';
      });
      
      expect(filteredActual).toHaveLength(expected.length);
      const sortedActual = filteredActual.sort((a: any, b: any) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]));
      const sortedExpected = expected.sort((a: any, b: any) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]));
      expect(sortedActual).toEqual(sortedExpected);
    });

    // Add more comprehensive tests here, without repeating mapper-specific tests
    it('should handle empty array', () => {
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const result = mapper.map([]);
      expect(result.fieldSets).toEqual([]);
      expect(result.fieldDefinitions).toBeDefined();
    });

    it('should set validationFailureMessage for missing personId', () => {
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const invalidPerson = { personBasic: { names: [{ firstName: 'Test', lastName: 'User' }] } };
      mapper.map([invalidPerson]);
      expect(mapper.criticalValidationErrorMessage).toContain('missing required personid');
    });

    it('should set validationFailureMessage for missing names', () => {
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const invalidPerson = { personid: '123' };
      mapper.map([invalidPerson]);
      expect(mapper.criticalValidationErrorMessage).toContain('missing required name fields');
    });

    it('should set validationFailureMessage for missing organizations', () => {
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const invalidPerson = {
        personid: '123',
        personBasic: { names: [{ firstName: 'Test', lastName: 'User', nameType: 'PRF', effectiveDate: '03052026' }] }
      };
      mapper.map([invalidPerson]);
      expect(mapper.criticalValidationErrorMessage).toContain('missing required organization field');
    });

    it('should handle multiple persons', () => {
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const person1 = {
        personid: '1',
        personBasic: { names: [{ firstName: 'First', lastName: 'User' }] },
        employeeInfo: { address: [] },
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: { address: [] },
        constituentInfo: { address: [] }
      };
      const person2 = {
        personid: '2',
        personBasic: { names: [{ firstName: 'Second', lastName: 'User' }] },
        employeeInfo: { address: [] },
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: { address: [] },
        constituentInfo: { address: [] }
      };
      const result = mapper.map([person1, person2]);
      expect(result.fieldSets).toHaveLength(2);
    });

    it('should include secondaryUnit for dual organizations', () => {
      const dualOrgPerson = {
        personid: '456',
        personBasic: { names: [{ firstName: 'Dual', lastName: 'Org' }] },
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: '20200101',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: '20200101',
                },
                Department: {
                  organizationalUnit: '20003827'
                }
              }
            }
          ]
        },
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: { address: [] },
        constituentInfo: { address: [] }
      };
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const result = mapper.map([dualOrgPerson]);
      expect(result.fieldSets).toHaveLength(1);
      const fields = result.fieldSets[0].fieldValues;
      const secondaryUnitField = fields.find((f: any) => 'secondaryUnit' in f);
      expect(secondaryUnitField).toBeDefined();
      expect(secondaryUnitField!.secondaryUnit).toBeDefined();
      expect((secondaryUnitField!.secondaryUnit as any).hrn).toBe('lookup:sourceIdentifier:20003827');
    });

    it('should expose currentTerms via getter', () => {
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      expect(mapper.currentTerms).toEqual(mockCurrentTerms);
      expect(mapper.currentTerms).toHaveLength(2);
    });

    it('should include __active field for reactivation support', () => {
      const mapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, idpName: 'test-idp' });
      const person = {
        personid: '123',
        personBasic: { names: [{ firstName: 'Test', lastName: 'User' }] },
        employeeInfo: { address: [] },
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: { address: [] },
        constituentInfo: { address: [] }
      };
      const result = mapper.map([person]);
      expect(result.fieldSets).toHaveLength(1);
      const fields = result.fieldSets[0].fieldValues;
      const activeField = fields.find((f: any) => '__active' in f);
      expect(activeField).toBeDefined();
      expect(activeField!.__active).toBe(true);
    });
  });

  describe('StaticMapUsage and dynamic lookup functionality', () => {
    it('should use dynamic lookup syntax for organization when orgMap is false', () => {
      const orgHrn = (sourceOrgId: string) => `lookup:sourceIdentifier:${sourceOrgId}`;
      const mapper = new DataMapper({ 
        currentTerms: mockCurrentTerms, 
        stateMappings: mockStateMappings, 
        countryMappings: mockCountryMappings,
        idpName: 'test-idp',
        orgHrn 
      });
      
      const result = mapper.orgHrn('12345');
      expect(result).toBe('lookup:sourceIdentifier:12345');
    });

    it('should use static map for organization when orgHrn function provided', () => {
      const orgMappings = {
        forwardMap: new Map<string, string>([
          ['12345', 'hrn:hrs:organizations/test-org']
        ]),
        reverseMap: new Map<string, string>([
          ['hrn:hrs:organizations/test-org', '12345']
        ])
      };
      const orgHrn = (sourceOrgId: string) => orgMappings.forwardMap.get(sourceOrgId);
      const mapper = new DataMapper({ 
        currentTerms: mockCurrentTerms, 
        stateMappings: mockStateMappings, 
        countryMappings: mockCountryMappings,
        idpName: 'test-idp',
        orgMappings,
        orgHrn 
      });
      
      const result = mapper.orgHrn('12345');
      expect(result).toBe('hrn:hrs:organizations/test-org');
    });

    it('should default to dynamic lookup syntax when no orgHrn function provided', () => {
      const mapper = new DataMapper({ 
        currentTerms: mockCurrentTerms, 
        stateMappings: mockStateMappings, 
        countryMappings: mockCountryMappings,
        idpName: 'test-idp'
      });
      
      const result = mapper.orgHrn('67890');
      expect(result).toBe('lookup:sourceIdentifier:67890');
    });

    it('should support state mappings being undefined', () => {
      const mapper = new DataMapper({ 
        currentTerms: mockCurrentTerms, 
        countryMappings: mockCountryMappings,
        idpName: 'test-idp'
      });
      
      expect(mapper.stateMappings).toBeUndefined();
    });

    it('should support country mappings being undefined', () => {
      const mapper = new DataMapper({ 
        currentTerms: mockCurrentTerms, 
        stateMappings: mockStateMappings,
        idpName: 'test-idp'
      });
      
      expect(mapper.countryMappings).toBeUndefined();
    });

    it('should support both state and country mappings being undefined', () => {
      const mapper = new DataMapper({ 
        currentTerms: mockCurrentTerms,
        idpName: 'test-idp'
      });
      
      expect(mapper.stateMappings).toBeUndefined();
      expect(mapper.countryMappings).toBeUndefined();
    });
  });
});