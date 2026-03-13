import { AddressMapper } from '../../src/data-mapper/DataMapperAddress';
import { StateRow, StateMappings } from '../../src/data-mapper/DataMapperState';
import { CountryRow, CountryMappings } from '../../src/data-mapper/DataMapperCountry';

describe('AddressMapper', () => {
  // Mock state and country mappings
  const mockStateMappings: StateMappings = {
    forwardMap: new Map<string, StateRow>([
      ['MA', { huronCode: 'massachusetts', huronName: 'Massachusetts' }],
      ['NY', { huronCode: 'new-york', huronName: 'New York' }],
      ['CA', { huronCode: 'california', huronName: 'California' }]
    ]),
    reverseMap: new Map<string, string>([
      ['MA', 'MA'],
      ['NY', 'NY'],
      ['CA', 'CA']
    ])
  };

  const mockCountryMappings: CountryMappings = {
    forwardMap: new Map<string, CountryRow>([
      ['US', { huronCode: 'usa', huronName: 'United States' }],
      ['CA', { huronCode: 'canada', huronName: 'Canada' }],
      ['UK', { huronCode: 'united-kingdom', huronName: 'United Kingdom' }]
    ]),
    reverseMap: new Map<string, string>([
      ['US', 'US'],
      ['CA', 'CA'],
      ['UK', 'UK']
    ])
  };

  describe('getAddressLine1', () => {
    it('should return undefined when no addresses are available', () => {
      const person = {};

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should return undefined when all address arrays are empty', () => {
      const person = {
        employeeInfo: { positions: [] },
        studentInfo: { address: [] },
        affiliateInfo: { address: [] }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should return the address from employeeInfo when available', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', line1: 'Apt 1' }
              }]
            }
          }]
        },
        studentInfo: { address: [] },
        affiliateInfo: { address: [] }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should prefer street over line1', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', line1: 'Apt 1' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should use line1 when street is empty or whitespace', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '   ', line1: '456 Oak Ave' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('456 Oak Ave');
    });

    it('should return undefined when address has neither street nor line1', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { city: 'Boston', state: 'MA' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should handle addresses with undefined fields', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: undefined, line1: '123 Main St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should handle addresses with null fields', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: null, line1: '123 Main St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should trim whitespace from address fields', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '  123 Main St  ' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should NOT map student addresses by default (CSV exemption)', () => {
      const person = {
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should NOT map affiliate addresses by default (CSV exemption)', () => {
      const person = {
        affiliateInfo: {
          address: [
            { street: '789 Affiliate Rd' }
          ]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });
  });

  describe('getAddressLine1 with explicit addressTypes', () => {
    it('should map student addresses when STUDENT type is explicitly included', () => {
      const person = {
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        }
      };

      const { AddressType } = require('../../src/data-mapper/DataMapperAddressSorter');
      const addressTypes = new Set([AddressType.STUDENT]);
      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, addressTypes });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('456 College Ave');
    });

    it('should map affiliate addresses when AFFILIATE type is explicitly included', () => {
      const person = {
        affiliateInfo: {
          address: [
            { street: '789 Affiliate Rd' }
          ]
        }
      };

      const { AddressType } = require('../../src/data-mapper/DataMapperAddressSorter');
      const addressTypes = new Set([AddressType.AFFILIATE]);
      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, addressTypes });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('789 Affiliate Rd');
    });

    it('should map multiple address types when explicitly included', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Work St' }
              }]
            }
          }]
        },
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        }
      };

      const { AddressType } = require('../../src/data-mapper/DataMapperAddressSorter');
      const addressTypes = new Set([AddressType.EMPLOYEE, AddressType.STUDENT]);
      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, addressTypes });
      const result = mapper.getAddressLine1();

      // Should prioritize EMPLOYEE over STUDENT per AddressTypePriorities
      expect(result).toEqual('123 Work St');
    });

    it('should prioritize STUDENT over AFFILIATE when both are included', () => {
      const person = {
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        },
        affiliateInfo: {
          address: [
            { street: '789 Affiliate Rd' }
          ]
        }
      };

      const { AddressType } = require('../../src/data-mapper/DataMapperAddressSorter');
      const addressTypes = new Set([AddressType.STUDENT, AddressType.AFFILIATE]);
      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, addressTypes });
      const result = mapper.getAddressLine1();

      // Should prioritize STUDENT over AFFILIATE per AddressTypePriorities
      expect(result).toEqual('456 College Ave');
    });

    it('should return undefined when specified type has no addresses', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Work St' }
              }]
            }
          }]
        }
      };

      const { AddressType } = require('../../src/data-mapper/DataMapperAddressSorter');
      const addressTypes = new Set([AddressType.STUDENT]); // Only looking for student, but person has only employee
      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings, addressTypes });
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });
  });

  describe('getCity', () => {
    it('should return city from address', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', city: 'Boston' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCity();

      expect(result).toEqual('Boston');
    });

    it('should return undefined when city is missing', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCity();

      expect(result).toEqual(undefined);
    });

    it('should trim whitespace from city', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', city: '  Boston  ' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCity();

      expect(result).toEqual('Boston');
    });

    it('should return undefined when city is empty string', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', city: '' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCity();

      expect(result).toEqual(undefined);
    });
  });

  describe('getStateProvince', () => {
    it('should return state with hrn and name from state map', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', state: 'MA' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getStateProvince();

      expect(result).toEqual({
        hrn: 'hrn:hrs:lists:states/massachusetts',
        name: 'Massachusetts'
      });
    });

    it('should return undefined when state is missing', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getStateProvince();

      expect(result).toEqual(undefined);
    });

    it('should return undefined when state code not found in map', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', state: 'XX' }
              }]
            }
          }]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getStateProvince();

      expect(result).toEqual(undefined);
      expect(consoleSpy).toHaveBeenCalledWith('State code XX not found in state map');
      consoleSpy.mockRestore();
    });

    it('should handle different state codes', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '456 Office St', state: 'NY' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getStateProvince();

      expect(result).toEqual({
        hrn: 'hrn:hrs:lists:states/new-york',
        name: 'New York'
      });
    });
  });

  describe('getCountry', () => {
    it('should return country with hrn and name from country map', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', country: 'US' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCountry();

      expect(result).toEqual({
        hrn: 'hrn:hrs:lists:countries/usa',
        name: 'United States'
      });
    });

    it('should return undefined when country is missing', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCountry();

      expect(result).toEqual(undefined);
    });

    it('should return undefined when country code not found in map', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', country: 'XX' }
              }]
            }
          }]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCountry();

      expect(result).toEqual(undefined);
      expect(consoleSpy).toHaveBeenCalledWith('Country code XX not found in country map');
      consoleSpy.mockRestore();
    });

    it('should handle different country codes', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '789 Office St', country: 'CA' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCountry();

      expect(result).toEqual({
        hrn: 'hrn:hrs:lists:countries/canada',
        name: 'Canada'
      });
    });
  });

  describe('getPostalCode', () => {
    it('should return postal code from address', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', postalCode: '02115' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getPostalCode();

      expect(result).toEqual('02115');
    });

    it('should return undefined when postal code is missing', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getPostalCode();

      expect(result).toEqual(undefined);
    });

    it('should trim whitespace from postal code', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '456 Office Ave', postalCode: '  02115  ' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getPostalCode();

      expect(result).toEqual('02115');
    });

    it('should return undefined when postal code is empty string', () => {
      const person = {
        affiliateInfo: {
          address: [
            { street: '789 Affiliate Rd', postalCode: '' }
          ]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getPostalCode();

      expect(result).toEqual(undefined);
    });
  });

  describe('getCounty', () => {
    it('should return county from address', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St', county: 'Suffolk' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCounty();

      expect(result).toEqual('Suffolk');
    });

    it('should return undefined when county is missing', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: { street: '123 Main St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getCounty();

      expect(result).toEqual(undefined);
    });
  });

  describe('Complex Address Scenarios', () => {
    it('should handle complete address with all fields', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                workAddress: {
                  street: '123 Main St',
                  city: 'Boston',
                  state: 'MA',
                  country: 'US',
                  postalCode: '02115',
                  county: 'Suffolk'
                }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });

      expect(mapper.getAddressLine1()).toEqual('123 Main St');
      expect(mapper.getCity()).toEqual('Boston');
      expect(mapper.getStateProvince()).toEqual({
        hrn: 'hrn:hrs:lists:states/massachusetts',
        name: 'Massachusetts'
      });
      expect(mapper.getCountry()).toEqual({
        hrn: 'hrn:hrs:lists:countries/usa',
        name: 'United States'
      });
      expect(mapper.getPostalCode()).toEqual('02115');
      expect(mapper.getCounty()).toEqual('Suffolk');
    });

    it('should handle isPrimary flag in employee addresses', () => {
      const person = {
        employeeInfo: {
          positions: [{
            positionInfo: {
              Office: [{
                isPrimary: true,
                workAddress: { street: '123 Primary Work St' }
              }]
            }
          }]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Primary Work St');
    });

    it('should handle multiple positions in employeeInfo', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Office: [{
                  isPrimary: false,
                  workAddress: { street: '123 Secondary Office' }
                }]
              }
            },
            {
              positionInfo: {
                Office: [{
                  isPrimary: true,
                  workAddress: { street: '456 Primary Office' }
                }]
              }
            }
          ]
        }
      };

      const mapper = AddressMapper({ person, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
      // The sorter should pick the primary one
      const result = mapper.getAddressLine1();

      expect(result).toBeDefined();
    });
  });
});