import { EmailMapper } from '../../src/data-mapper/DataMapperEmail';

describe('EmailMapper', () => {
  describe('getEmail', () => {
    it('should return empty object when no emails are available', () => {
      const person = {
        email: []
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual(undefined);
    });

    it('should return empty object when email property is missing', () => {
      const person = {};

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual(undefined);
    });

    it('should return the single email mapped to Huron structure', () => {
      const person = {
        email: [
          {
            type: 'university',
            source: 'SAP',
            address: 'john.doe@bu.edu'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@bu.edu');
    });

    it('should select university from SAP (priority 1) over personal from SAP (priority 2)', () => {
      const person = {
        email: [
          {
            type: 'personal',
            source: 'SAP',
            address: 'john.doe@gmail.com'
          },
          {
            type: 'university',
            source: 'SAP',
            address: 'john.doe@bu.edu'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@bu.edu');
    });

    it('should select personal from SAP (priority 2) over BUEM from Campus Solutions (priority 3)', () => {
      const person = {
        email: [
          {
            type: 'BUEM',
            source: 'Campus Solutions',
            address: 'john.doe@bu.edu'
          },
          {
            type: 'personal',
            source: 'SAP',
            address: 'john.doe@gmail.com'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@gmail.com');
    });

    it('should select BUEM from Campus Solutions (priority 3) over PERS from Campus Solutions (priority 4)', () => {
      const person = {
        email: [
          {
            type: 'PERS',
            source: 'Campus Solutions',
            emailAddress: 'john.doe@gmail.com'
          },
          {
            type: 'BUEM',
            source: 'Campus Solutions',
            address: 'john.doe@bu.edu'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@bu.edu');
    });

    it('should select university from SAP (priority 1) over PERS from Campus Solutions (priority 4)', () => {
      const person = {
        email: [
          {
            type: 'PERS',
            source: 'Campus Solutions',
            address: 'john.doe@gmail.com'
          },
          {
            type: 'university',
            source: 'SAP',
            address: 'john.doe@bu.edu'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@bu.edu');
    });

    it('should return first email when no emails match defined types', () => {
      const person = {
        email: [
          {
            type: 'UNKNOWN',
            source: 'Unknown Source',
            address: 'john.doe@unknown.com'
          },
          {
            type: 'OTHER',
            source: 'Other Source',
            address: 'john.doe@other.com'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@unknown.com');
    });

    it('should match emails with correct type but no source requirement', () => {
      const person = {
        email: [
          {
            type: 'university',
            source: 'Some Other Source',
            address: 'john.doe@other.edu'
          },
          {
            type: 'UNKNOWN',
            source: 'Unknown',
            address: 'john.doe@unknown.com'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@other.edu');
    });

    it('should prioritize exact source matches over type-only matches', () => {
      const person = {
        email: [
          {
            type: 'university',
            source: 'Some Other Source',
            address: 'john.doe@other.edu'
          },
          {
            type: 'university',
            source: 'SAP',
            address: 'john.doe@bu.edu'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@bu.edu');
    });

    it('should handle emails with missing source field', () => {
      const person = {
        email: [
          {
            type: 'UNKNOWN',
            address: 'john.doe@unknown.com'
          },
          {
            type: 'university',
            address: 'john.doe@bu.edu'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      // Both emails don't match defined EmailTypes (university without source doesn't match, UNKNOWN not defined)
      // So both get MAX_VALUE priority, and first email in array is selected
      expect(result).toEqual('john.doe@unknown.com');
    });

    it('should handle emails with missing address', () => {
      const person = {
        email: [
          {
            type: 'university',
            source: 'SAP'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual(undefined);
    });

    it('should handle multiple emails with same priority by selecting first in sorted order', () => {
      const person = {
        email: [
          {
            type: 'PERS',
            source: 'Campus Solutions',
            address: 'john.doe@gmail.com'
          },
          {
            type: 'PERS',
            source: 'Campus Solutions',
            address: 'john.doe@personal.com'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      // Both have same priority (4), should return first one after sorting
      expect(result).toEqual('john.doe@gmail.com');
    });

    it('should handle mixed matching and non-matching emails', () => {
      const person = {
        email: [
          {
            type: 'UNKNOWN',
            source: 'Unknown',
            address: 'john.doe@unknown.com'
          },
          {
            type: 'university',
            source: 'SAP',
            address: 'john.doe@bu.edu'
          },
          {
            type: 'OTHER',
            source: 'Other',
            address: 'john.doe@other.com'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@bu.edu');
    });

    it('should handle empty strings in address field', () => {
      const person = {
        email: [
          {
            type: 'university',
            source: 'SAP',
            address: ''
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('');
    });

    it('should handle null values in address field', () => {
      const person = {
        email: [
          {
            type: 'university',
            source: 'SAP',
            address: null
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual(undefined);
    });

    it('should handle emails with different case in type field', () => {
      const person = {
        email: [
          {
            type: 'UNIVERSITY',
            source: 'SAP',
            address: 'john.doe@bu.edu'
          },
          {
            type: 'personal',
            source: 'SAP',
            address: 'john.doe@gmail.com'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      // UNIVERSITY (uppercase) doesn't match 'university' (lowercase) in EmailTypes
      // personal matches priority 2
      expect(result).toEqual('john.doe@gmail.com');
    });

    it('should handle emails with different case in source field', () => {
      const person = {
        email: [
          {
            type: 'university',
            source: 'sap',
            address: 'john.doe@bu.edu'
          },
          {
            type: 'personal',
            source: 'SAP',
            address: 'john.doe@gmail.com'
          }
        ]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      // university with 'sap' (lowercase) doesn't match 'SAP' in EmailTypes
      // personal with 'SAP' matches priority 2
      expect(result).toEqual('john.doe@gmail.com');
    });

    it('should handle null email property', () => {
      const person = {
        email: null
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual(undefined);
    });

    it('should handle null values in email array', () => {
      const person = {
        email: [null, { type: 'university', source: 'SAP', address: 'john.doe@bu.edu' }]
      };

      const mapper = EmailMapper(person);
      const result = mapper.getEmail();

      expect(result).toEqual('john.doe@bu.edu');
    });
  });
});