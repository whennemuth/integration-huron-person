import { NameMapper } from '../../src/data-mapper/DataMapperName';

describe('NameMapper', () => {
  describe('getName', () => {
    it('should return empty object when no names are available', () => {
      const person = {
        personBasic: {
          names: []
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    it('should return empty object when personBasic is missing', () => {
      const person = {};

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    it('should return empty object when personBasic.names is missing', () => {
      const person = {
        personBasic: {}
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    it('should return the single name mapped to Huron structure', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should select PRI from SAP (priority 1) over PRF from Campus Solutions (priority 2)', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRF',
              source: 'Campus Solutions',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should select PRF from Campus Solutions (priority 2) over PRI from Campus Solutions (priority 3)', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'Campus Solutions',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'PRF',
              source: 'Campus Solutions',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should select PRI from SAP (priority 1) over PRI from Campus Solutions (priority 3)', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'Campus Solutions',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should return first name when no names match defined types', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'UNK',
              source: 'Unknown Source',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'OTH',
              source: 'Other Source',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'Jane',
        middleName: 'R',
        lastName: 'Smith'
      });
    });

    it('should match names with correct type but no source requirement', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'Some Other Source',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'UNK',
              source: 'Unknown',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'Jane',
        middleName: 'R',
        lastName: 'Smith'
      });
    });

    it('should prioritize exact source matches over type-only matches', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'Some Other Source',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should handle names with missing source field', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'UNK',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'PRI',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      // Both names don't match defined NameTypes (UNK not defined, PRI has no source but all PRI entries require source)
      // So both get MAX_VALUE priority, and first name in array is selected
      expect(result).toEqual({
        firstName: 'Jane',
        middleName: 'R',
        lastName: 'Smith'
      });
    });

    it('should handle names with missing middleName and lastName', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'John'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: undefined,
        lastName: undefined
      });
    });

    it('should handle multiple names with same priority by selecting first in sorted order', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'Campus Solutions',
              firstName: 'Jane',
              middleName: 'R',
              lastName: 'Smith'
            },
            {
              nameType: 'PRI',
              source: 'Campus Solutions',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      // Both have same priority (3), should return first one after sorting
      expect(result).toEqual({
        firstName: 'Jane',
        middleName: 'R',
        lastName: 'Smith'
      });
    });

    it('should handle mixed matching and non-matching names', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'UNK',
              source: 'Unknown',
              firstName: 'Unknown',
              middleName: 'U',
              lastName: 'User'
            },
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'John',
              middleName: 'Q',
              lastName: 'Doe'
            },
            {
              nameType: 'OTH',
              source: 'Other',
              firstName: 'Other',
              middleName: 'O',
              lastName: 'Name'
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should handle empty strings in name fields', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: '',
              middleName: '',
              lastName: ''
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: '',
        middleName: '',
        lastName: ''
      });
    });

    it('should handle null values in name fields', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: null,
              middleName: null,
              lastName: null
            }
          ]
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: undefined,
        middleName: undefined,
        lastName: undefined
      });
    });

    it('should handle null personBasic property', () => {
      const person = {
        personBasic: null
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    it('should handle null names array', () => {
      const person = {
        personBasic: {
          names: null
        }
      };

      const mapper = NameMapper(person);
      const result = mapper.getName();

      expect(result).toEqual({});
    });
  });
});
