import { Field, FieldSet } from 'integration-core';
import { FieldFilter, FieldFilterParams } from '../../src/data-mapper/FieldFilter';
import { StateMappings } from '../../src/data-mapper/DataMapperState';
import { CountryMappings } from '../../src/data-mapper/DataMapperCountry';
import { OrgMappings } from '../../src/data-mapper/DataMapperOrg';

describe('FieldFilter', () => {
  // Mock mappings
  const mockStateMappings: StateMappings = {
    forwardMap: new Map([
      ['NY', { huronCode: 'NY', huronName: 'New York' }],
      ['MA', { huronCode: 'MA', huronName: 'Massachusetts' }],
      ['CA', { huronCode: 'CA', huronName: 'California' }]
    ]),
    reverseMap: new Map([
      ['NY', 'NY'],
      ['MA', 'MA'],
      ['CA', 'CA']
    ])
  };

  const mockCountryMappings: CountryMappings = {
    forwardMap: new Map([
      ['US', { huronCode: 'US', huronName: 'United States' }],
      ['CA', { huronCode: 'CA', huronName: 'Canada' }],
      ['UK', { huronCode: 'UK', huronName: 'United Kingdom' }]
    ]),
    reverseMap: new Map([
      ['US', 'US'],
      ['CA', 'CA'],
      ['UK', 'UK']
    ])
  };

  const mockOrgMappings: OrgMappings = {
    forwardMap: new Map([
      ['10003827', 'urn:dco:organization:10003827'],
      ['10006404', 'urn:dco:organization:10006404'],
      ['10002309', 'urn:dco:organization:10002309']
    ]),
    reverseMap: new Map([
      ['urn:dco:organization:10003827', '10003827'],
      ['urn:dco:organization:10006404', '10006404'],
      ['urn:dco:organization:10002309', '10002309']
    ])
  };

  describe('filter', () => {
    it('should remove excluded fields (userId, roles, __arrayFieldOperations)', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'U12345678' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { userId: 'jdoe' },  // Should be removed
          { roles: ['employee', 'manager'] },  // Should be removed
          { __arrayFieldOperations: { add: [], remove: [] } }  // Should be removed
        ]
      };

      const params: FieldFilterParams = {
        fieldSet,
        stateMappings: mockStateMappings,
        countryMappings: mockCountryMappings,
        orgMappings: mockOrgMappings
      };

      const filter = new FieldFilter(params);
      const result = filter.filter();

      expect(result.fieldValues).toHaveLength(3);
      expect(result.fieldValues).toEqual([
        { id: 'U12345678' },
        { firstName: 'John' },
        { lastName: 'Doe' }
      ]);
      expect(result.fieldValues.some(fv => 'userId' in fv)).toBe(false);
      expect(result.fieldValues.some(fv => 'roles' in fv)).toBe(false);
      expect(result.fieldValues.some(fv => '__arrayFieldOperations' in fv)).toBe(false);
    });

    it('should filter out objects with only undefined/null properties', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'U12345678' },
          { firstName: 'John' },
          { middleName: undefined },  // Should be removed entirely
          { lastName: 'Doe' },
          { title: '' }  // Empty string - should be removed entirely
        ]
      };

      const params: FieldFilterParams = {
        fieldSet,
        stateMappings: mockStateMappings,
        countryMappings: mockCountryMappings,
        orgMappings: mockOrgMappings
      };

      const filter = new FieldFilter(params);
      const result = filter.filter();

      expect(result.fieldValues).toHaveLength(3);
      expect(result.fieldValues).toEqual([
        { id: 'U12345678' },
        { firstName: 'John' },
        { lastName: 'Doe' }
      ]);
    });

    describe('Organization normalization', () => {
      it('should normalize employer with id (source system scenario)', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { 
              employer: { 
                id: '10003827',
                name: 'Res. Adm., Web and .NET'
              } 
            }
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        const employerField = result.fieldValues.find(fv => 'employer' in fv);
        expect(employerField).toBeDefined();
        expect(employerField?.employer).toBe('10003827');
      });

      it('should normalize employer with hrn using reverseMap (target system scenario)', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { 
              employer: { 
                hrn: 'urn:dco:organization:10003827',
                name: 'Res. Adm., Web and .NET'
              } 
            }
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        const employerField = result.fieldValues.find(fv => 'employer' in fv);
        expect(employerField).toBeDefined();
        expect(employerField?.employer).toBe('10003827');
      });

      it('should handle employer with neither id nor hrn (edge case)', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { 
              employer: { 
                name: 'Unknown Organization'
              } 
            }
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        // Employer field with undefined value should be removed entirely
        const employerField = result.fieldValues.find(fv => 'employer' in fv);
        expect(employerField).toBeUndefined();
      });

      it('should normalize all org fields (employer, organization, secondaryUnit, additionalUnit)', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { employer: { id: '10003827' } },
            { organization: { hrn: 'urn:dco:organization:10006404' } },
            { secondaryUnit: { id: '10002309' } },
            { additionalUnit: { hrn: 'urn:dco:organization:10003827' } }
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        expect(result.fieldValues).toContainEqual({ employer: '10003827' });
        expect(result.fieldValues).toContainEqual({ organization: '10006404' });
        expect(result.fieldValues).toContainEqual({ secondaryUnit: '10002309' });
        expect(result.fieldValues).toContainEqual({ additionalUnit: '10003827' });
      });
    });

    describe('State and Country normalization', () => {
      it('should normalize state and country with hrn (target system scenario)', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            {
              contactInformation: {
                email: 'john.doe@example.com',
                addressLine1: '123 Main St',
                city: 'Boston',
                stateProvince: {
                  hrn: 'urn:dco:location:state/MA'
                },
                postalCode: '02115',
                country: {
                  hrn: 'urn:dco:location:country/US'
                }
              }
            }
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        const contactInfoField = result.fieldValues.find(fv => 'contactInformation' in fv);
        expect(contactInfoField).toBeDefined();
        
        const contactInfo = contactInfoField?.contactInformation as any;
        expect(contactInfo.stateProvince).toBe('MA');
        expect(contactInfo.country).toBe('US');
        expect(contactInfo.email).toBe('john.doe@example.com');
        expect(contactInfo.city).toBe('Boston');
      });

      it('should handle missing contactInformation field', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { firstName: 'John' },
            { lastName: 'Doe' }
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        // Spy on console.error to verify error logging
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const filter = new FieldFilter(params);
        const result = filter.filter();

        // Should log error about missing contactInformation
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('No contactInformation field found')
        );

        // Result should not include state or country fields
        const contactInfoField = result.fieldValues.find(fv => 'contactInformation' in fv);
        expect(contactInfoField).toBeUndefined();

        consoleErrorSpy.mockRestore();
      });

      it('should handle contactInformation with already normalized state/country (primitives)', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            {
              contactInformation: {
                email: 'john.doe@example.com',
                stateProvince: 'MA',  // Already normalized
                country: 'US'  // Already normalized
              }
            }
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        const contactInfoField = result.fieldValues.find(fv => 'contactInformation' in fv);
        const contactInfo = contactInfoField?.contactInformation as any;
        
        // Should remain unchanged since they're already primitives
        expect(contactInfo.stateProvince).toBe('MA');
        expect(contactInfo.country).toBe('US');
      });
    });

    describe('Source vs Target comparison', () => {
      it('should produce identical output for equivalent source and target data', () => {
        // Source system data (has BUID/id, no hrn)
        const sourceFieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { employeeId: 'E12345' },
            { firstName: 'John' },
            { lastName: 'Doe' },
            { title: 'Software Engineer' },
            { employer: { id: '10003827', name: 'Res. Adm., Web and .NET' } },
            { organization: { id: '10006404', name: 'Health, Faculty and Student Ancillary' } },
            { secondaryUnit: { id: '10002309', name: 'General Applications' } },
            {
              contactInformation: {
                email: 'john.doe@bu.edu',
                addressLine1: '123 Main St',
                city: 'Boston',
                stateProvince: 'MA',  // Already normalized in source
                postalCode: '02115',
                country: 'US'  // Already normalized in source
              }
            }
          ]
        };

        // Target system data (has hrn, no id)
        const targetFieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { employeeId: 'E12345' },
            { firstName: 'John' },
            { lastName: 'Doe' },
            { title: 'Software Engineer' },
            { 
              employer: { 
                hrn: 'urn:dco:organization:10003827',
                name: 'Res. Adm., Web and .NET' 
              } 
            },
            { 
              organization: { 
                hrn: 'urn:dco:organization:10006404',
                name: 'Health, Faculty and Student Ancillary' 
              } 
            },
            { 
              secondaryUnit: { 
                hrn: 'urn:dco:organization:10002309',
                name: 'General Applications' 
              } 
            },
            {
              contactInformation: {
                email: 'john.doe@bu.edu',
                addressLine1: '123 Main St',
                city: 'Boston',
                stateProvince: {
                  hrn: 'urn:dco:location:state/MA'
                },
                postalCode: '02115',
                country: {
                  hrn: 'urn:dco:location:country/US'
                }
              }
            }
          ]
        };

        const sourceParams: FieldFilterParams = {
          fieldSet: sourceFieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const targetParams: FieldFilterParams = {
          fieldSet: targetFieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const sourceFilter = new FieldFilter(sourceParams);
        const targetFilter = new FieldFilter(targetParams);

        const sourceResult = sourceFilter.filter();
        const targetResult = targetFilter.filter();

        // Both should produce identical normalized output
        expect(sourceResult.fieldValues).toEqual(targetResult.fieldValues);
      });

      it('should detect differences when data is truly different', () => {
        const sourceFieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { firstName: 'John' },
            { lastName: 'Doe' },
            { employer: { id: '10003827' } }
          ]
        };

        const targetFieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { firstName: 'John' },
            { lastName: 'Smith' },  // Different last name
            { employer: { hrn: 'urn:dco:organization:10003827' } }
          ]
        };

        const sourceParams: FieldFilterParams = {
          fieldSet: sourceFieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const targetParams: FieldFilterParams = {
          fieldSet: targetFieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const sourceFilter = new FieldFilter(sourceParams);
        const targetFilter = new FieldFilter(targetParams);

        const sourceResult = sourceFilter.filter();
        const targetResult = targetFilter.filter();

        // Should NOT be equal due to different last names
        expect(sourceResult.fieldValues).not.toEqual(targetResult.fieldValues);
      });
    });

    describe('Integration scenarios', () => {
      it('should handle complex real-world scenario with multiple normalizations and empty value removal', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U70801118' },
            { employeeId: 'U70801118' },
            { sourceIdentifier: 'U70801118' },
            { firstName: 'Bugs' },
            { middleName: undefined },  // Should be removed
            { lastName: 'Bunny' },
            { title: 'Lead Analyst, Programmer' },
            { 
              employer: { 
                hrn: 'urn:dco:organization:10003827',
                name: 'Res. Adm., Web and .NET' 
              } 
            },
            { 
              organization: { 
                id: '10003827',
                name: 'Res. Adm., Web and .NET' 
              } 
            },
            { secondaryUnit: { name: 'No ID or HRN' } },  // Should be removed
            {
              contactInformation: {
                email: 'bugs.bunny@looneytunes.org',
                addressLine1: '1116 Farm Road',
                city: 'Roosterville',
                stateProvince: {
                  hrn: 'urn:dco:location:state/NY'
                },
                postalCode: '67890',
                country: {
                  hrn: 'urn:dco:location:country/US'
                }
              }
            },
            { userId: 'bbunny' },  // Should be excluded
            { roles: ['employee'] },  // Should be excluded
            { __arrayFieldOperations: {} }  // Should be excluded
          ]
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        // Verify excluded fields are removed
        expect(result.fieldValues.some(fv => 'userId' in fv)).toBe(false);
        expect(result.fieldValues.some(fv => 'roles' in fv)).toBe(false);
        expect(result.fieldValues.some(fv => '__arrayFieldOperations' in fv)).toBe(false);

        // Verify empty value fields are removed
        expect(result.fieldValues.some(fv => 'middleName' in fv)).toBe(false);
        expect(result.fieldValues.some(fv => 'secondaryUnit' in fv)).toBe(false);

        // Verify org normalization
        const employerField = result.fieldValues.find(fv => 'employer' in fv);
        const organizationField = result.fieldValues.find(fv => 'organization' in fv);
        expect(employerField?.employer).toBe('10003827');
        expect(organizationField?.organization).toBe('10003827');

        // Verify state/country normalization
        const contactInfoField = result.fieldValues.find(fv => 'contactInformation' in fv);
        const contactInfo = contactInfoField?.contactInformation as any;
        expect(contactInfo.stateProvince).toBe('NY');
        expect(contactInfo.country).toBe('US');

        // Verify expected field count (9 fields after filtering)
        expect(result.fieldValues).toHaveLength(9);
      });

      it('should preserve original fieldSet properties other than fieldValues', () => {
        const fieldSet: FieldSet = {
          fieldValues: [
            { id: 'U12345678' },
            { firstName: 'John' }
          ],
          validationMessages: new Map([['id', 'Valid ID']]),
          hash: 'abc123'
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        expect(result.validationMessages).toBe(fieldSet.validationMessages);
        expect(result.hash).toBe('abc123');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty fieldValues array', () => {
        const fieldSet: FieldSet = {
          fieldValues: []
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        // Empty array remains empty array (not undefined)after fix for hash compatibility
        expect(result.fieldValues).toEqual([]);
      });

      it('should handle fieldSet with no fieldValues property', () => {
        const fieldSet: FieldSet = {} as any;

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        // Empty array becomes empty array (not undefined) after fix for hash compatibility
        expect(result.fieldValues).toEqual([]);
      });

      it('should not mutate the original fieldValues array', () => {
        const originalFieldValues: Field[] = [
          { id: 'U12345678' },
          { employer: { id: '10003827', name: 'Test Org' } },
          { userId: 'test' }
        ];

        const fieldSet: FieldSet = {
          fieldValues: originalFieldValues
        };

        const params: FieldFilterParams = {
          fieldSet,
          stateMappings: mockStateMappings,
          countryMappings: mockCountryMappings,
          orgMappings: mockOrgMappings
        };

        const filter = new FieldFilter(params);
        const result = filter.filter();

        // Original should remain unchanged
        expect(originalFieldValues).toHaveLength(3);
        expect(originalFieldValues[1]).toEqual({ employer: { id: '10003827', name: 'Test Org' } });
        expect(originalFieldValues[2]).toEqual({ userId: 'test' });

        // Result should be different
        expect(result.fieldValues).toHaveLength(2);
        expect(result.fieldValues[1]).toEqual({ employer: '10003827' });
      });
    });

    describe('Lookup expression handling', () => {
      describe('Organization lookup expressions', () => {
        it('should extract ID from organization lookup expression', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                organization: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:99999',
                  name: 'Unknown Org'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues).toHaveLength(1);
          expect(result.fieldValues[0]).toEqual({ organization: '99999' });
        });

        it('should extract ID from employer lookup expression', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                employer: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:12345',
                  name: 'Employer Org'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues).toHaveLength(1);
          expect(result.fieldValues[0]).toEqual({ employer: '12345' });
        });

        it('should extract ID from secondaryUnit lookup expression', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                secondaryUnit: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:54321',
                  name: 'Secondary Unit'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues).toHaveLength(1);
          expect(result.fieldValues[0]).toEqual({ secondaryUnit: '54321' });
        });

        it('should extract ID from additionalUnit lookup expression', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                additionalUnit: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:11111',
                  name: 'Additional Unit'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues).toHaveLength(1);
          expect(result.fieldValues[0]).toEqual({ additionalUnit: '11111' });
        });

        it('should handle mixed HRN types (lookup and regular)', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                employer: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:12345',
                  name: 'Employer'
                }
              },
              {
                organization: {
                  id: undefined,
                  hrn: 'urn:dco:organization:10003827',
                  name: 'Regular HRN Org'
                }
              },
              {
                secondaryUnit: {
                  id: '99999',
                  hrn: 'lookup:sourceIdentifier:88888',
                  name: 'Secondary'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues).toHaveLength(3);
          expect(result.fieldValues[0]).toEqual({ employer: '12345' });
          expect(result.fieldValues[1]).toEqual({ organization: '10003827' });
          expect(result.fieldValues[2]).toEqual({ secondaryUnit: '99999' }); // Prefers id field
        });

        it('should prefer id field over lookup expression', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                employer: {
                  id: '12345',
                  hrn: 'lookup:sourceIdentifier:99999',
                  name: 'Employer'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues[0]).toEqual({ employer: '12345' });
        });

        it('should handle lookup expression with colons in the ID', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                organization: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:org:with:colons:123',
                  name: 'Complex Org'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          // Should extract everything after the second colon
          expect(result.fieldValues[0]).toEqual({ organization: 'org:with:colons:123' });
        });
      });

      describe('State lookup expressions', () => {
        it('should extract state code from state lookup expression', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                contactInformation: {
                  stateProvince: {
                    hrn: 'lookup:name:MA',
                    name: 'MA'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues[0].contactInformation).toEqual({
            stateProvince: 'MA'
          });
        });

        it('should handle state with regular HRN', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                contactInformation: {
                  stateProvince: {
                    hrn: 'hrn:hrs:lists:states/NY',
                    name: 'New York'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues[0].contactInformation).toEqual({
            stateProvince: 'NY'
          });
        });

        it('should handle state lookup expression for unmapped state', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                contactInformation: {
                  stateProvince: {
                    hrn: 'lookup:name:TX',
                    name: 'TX'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          // Should still extract the code even if not in mapping
          expect(result.fieldValues[0].contactInformation).toEqual({
            stateProvince: 'TX'
          });
        });
      });

      describe('Country lookup expressions', () => {
        it('should extract country code from country lookup expression', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                contactInformation: {
                  country: {
                    hrn: 'lookup:name:US',
                    name: 'US'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues[0].contactInformation).toEqual({
            country: 'US'
          });
        });

        it('should handle country with regular HRN', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                contactInformation: {
                  country: {
                    hrn: 'hrn:hrs:lists:countries/CA',
                    name: 'Canada'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues[0].contactInformation).toEqual({
            country: 'CA'
          });
        });

        it('should handle country lookup expression for unmapped country', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                contactInformation: {
                  country: {
                    hrn: 'lookup:name:MX',
                    name: 'MX'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          // Should still extract the code even if not in mapping
          expect(result.fieldValues[0].contactInformation).toEqual({
            country: 'MX'
          });
        });
      });

      describe('Combined lookup expressions', () => {
        it('should handle both state and country lookup expressions together', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                contactInformation: {
                  stateProvince: {
                    hrn: 'lookup:name:NY',
                    name: 'NY'
                  },
                  country: {
                    hrn: 'lookup:name:US',
                    name: 'US'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues[0].contactInformation).toEqual({
            stateProvince: 'NY',
            country: 'US'
          });
        });

        it('should handle mixed lookup and regular HRNs for address fields', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              { id: 'U12345678' },
              {
                contactInformation: {
                  stateProvince: {
                    hrn: 'lookup:name:NY',
                    name: 'NY'
                  },
                  country: {
                    hrn: 'hrn:hrs:lists:countries/CA',
                    name: 'Canada'
                  }
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues).toHaveLength(2);
          expect(result.fieldValues[0]).toEqual({ id: 'U12345678' });
          expect(result.fieldValues[1].contactInformation).toEqual({
            stateProvince: 'NY',
            country: 'CA'
          });
        });

        it('should handle all field types with lookup expressions together', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              { id: 'U12345678' },
              {
                employer: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:12345',
                  name: 'Employer'
                }
              },
              {
                organization: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:67890',
                  name: 'Org'
                }
              },
              {
                secondaryUnit: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:99999',
                  name: 'Secondary'
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

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          expect(result.fieldValues).toHaveLength(5);
          expect(result.fieldValues[0]).toEqual({ id: 'U12345678' });
          expect(result.fieldValues[1]).toEqual({ employer: '12345' });
          expect(result.fieldValues[2]).toEqual({ organization: '67890' });
          expect(result.fieldValues[3]).toEqual({ secondaryUnit: '99999' });
          expect(result.fieldValues[4].contactInformation).toEqual({
            stateProvince: 'MA',
            country: 'US'
          });
        });
      });

      describe('Edge cases', () => {
        it('should handle malformed lookup expression (too few parts)', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                employer: {
                  id: undefined,
                  hrn: 'lookup:invalid',
                  name: 'Bad Lookup'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          // Should be removed as undefined (empty values removed)
          expect(result.fieldValues).toEqual([]);
        });

        it('should not treat regular strings as lookup expressions', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                employer: {
                  id: undefined,
                  hrn: 'not-a-lookup-expression',
                  name: 'Some Org'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          // Should not find in mapping, result in undefined, removed
          expect(result.fieldValues).toEqual([]);
        });

        it('should handle empty lookup expression value', () => {
          const fieldSet: FieldSet = {
            fieldValues: [
              {
                organization: {
                  id: undefined,
                  hrn: 'lookup:sourceIdentifier:',
                  name: 'Empty ID'
                }
              }
            ]
          };

          const params: FieldFilterParams = {
            fieldSet,
            stateMappings: mockStateMappings,
            countryMappings: mockCountryMappings,
            orgMappings: mockOrgMappings
          };

          const result = new FieldFilter(params).filter();

          // Empty string is removed as empty value
          expect(result.fieldValues).toEqual([]);
        });
      });
    });
  });
});
