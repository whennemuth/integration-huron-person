import { AddressMapper } from '../../src/data-mapper/DataMapperAddress';

describe('AddressMapper', () => {
  describe('getAddress', () => {
    it('should return undefined when no addresses are available', () => {
      const person = {};

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should return undefined when all address arrays are empty', () => {
      const person = {
        employeeInfo: { address: [] },
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: { address: [] },
        constituentInfo: { address: [] }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should return the address from employeeInfo (priority 1) when only employeeInfo has addresses', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '123 Main St', line1: 'Apt 1' }
          ]
        },
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: { address: [] },
        constituentInfo: { address: [] }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should prefer street over line1 in employeeInfo', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '123 Main St', line1: 'Apt 1' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should use line1 when street is empty or whitespace', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '   ', line1: '456 Oak Ave' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('456 Oak Ave');
    });

    it('should return undefined when address has neither street nor line1', () => {
      const person = {
        employeeInfo: {
          address: [
            { city: 'Boston', state: 'MA' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should select employeeInfo (priority 1) over studentInfo (priority 2)', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '123 Main St' }
          ]
        },
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should select studentInfo (priority 2) over facultyInfo (priority 3)', () => {
      const person = {
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        },
        facultyInfo: {
          address: [
            { street: '789 University Dr' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('456 College Ave');
    });

    it('should select facultyInfo (priority 3) over affiliateInfo (priority 4)', () => {
      const person = {
        facultyInfo: {
          address: [
            { street: '789 University Dr' }
          ]
        },
        affiliateInfo: {
          address: [
            { street: '321 Partner Ln' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('789 University Dr');
    });

    it('should select affiliateInfo (priority 4) over constituentInfo (priority 5)', () => {
      const person = {
        affiliateInfo: {
          address: [
            { street: '321 Partner Ln' }
          ]
        },
        constituentInfo: {
          address: [
            { street: '654 Donor Rd' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('321 Partner Ln');
    });

    it('should select employeeInfo over all other sources', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '123 Main St' }
          ]
        },
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        },
        facultyInfo: {
          address: [
            { street: '789 University Dr' }
          ]
        },
        affiliateInfo: {
          address: [
            { street: '321 Partner Ln' }
          ]
        },
        constituentInfo: {
          address: [
            { street: '654 Donor Rd' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should select the first valid address from multiple addresses in one source', () => {
      const person = {
        employeeInfo: {
          address: [
            { city: 'Boston' }, // invalid
            { street: '123 Main St' }, // valid
            { street: '456 Oak Ave' } // valid but not first
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should skip sources with no valid addresses', () => {
      const person = {
        employeeInfo: {
          address: [
            { city: 'Boston' } // invalid
          ]
        },
        studentInfo: {
          address: [
            { street: '456 College Ave' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('456 College Ave');
    });

    it('should handle missing info objects gracefully', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '123 Main St' }
          ]
        }
        // missing studentInfo, etc.
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should handle addresses with undefined fields', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: undefined, line1: '123 Main St' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should handle addresses with null fields', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: null, line1: '123 Main St' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should trim whitespace from address fields', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '  123 Main St  ' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should return undefined when all addresses are invalid', () => {
      const person = {
        employeeInfo: {
          address: [
            { city: 'Boston' }
          ]
        },
        studentInfo: {
          address: [
            { state: 'MA' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should handle empty string in line1 when street is also empty', () => {
      const person = {
        employeeInfo: {
          address: [
            { street: '', line1: '' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should prioritize employeeInfo even when other sources have addresses', () => {
      const person = {
        constituentInfo: {
          address: [
            { street: '654 Donor Rd' }
          ]
        },
        employeeInfo: {
          address: [
            { street: '123 Main St' }
          ]
        }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual('123 Main St');
    });

    it('should handle null affiliateInfo gracefully', () => {
      const person = {
        employeeInfo: { address: [] },
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: null,
        constituentInfo: { address: [] }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });

    it('should handle null values in info objects', () => {
      const person = {
        employeeInfo: null,
        studentInfo: { address: [] },
        facultyInfo: { address: [] },
        affiliateInfo: { address: [] },
        constituentInfo: { address: [] }
      };

      const mapper = AddressMapper(person);
      const result = mapper.getAddressLine1();

      expect(result).toEqual(undefined);
    });
  });
});