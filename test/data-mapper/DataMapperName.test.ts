import { NameMapper } from '../../src/data-mapper/DataMapperName';

describe('NameMapper', () => {
  describe('getName', () => {
    it('should return empty object when no names are available', () => {
      const person = {
        personBasic: {
          names: []
        }
      };

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    it('should return empty object when personBasic is missing', () => {
      const person = {};

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    it('should return empty object when personBasic.names is missing', () => {
      const person = {
        personBasic: {}
      };

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should select PRF from SAP (priority 1) over all other types', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'Primary',
              middleName: 'P',
              lastName: 'SAP'
            },
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'Preferred',
              middleName: 'P',
              lastName: 'SAP'
            },
            {
              nameType: 'PRF',
              source: 'Campus Solutions',
              firstName: 'Preferred',
              middleName: 'P',
              lastName: 'CS'
            }
          ]
        }
      };

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'Preferred',
        middleName: 'P',
        lastName: 'SAP'
      });
    });

    it('should select PRF from Campus Solutions (priority 2) over PRI from SAP (priority 3)', () => {
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'Jane',
        middleName: 'R',
        lastName: 'Smith'
      });
    });

    it('should select PRF from Campus Solutions (priority 2) over PRI from Campus Solutions (priority 4)', () => {
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({
        firstName: 'John',
        middleName: 'Q',
        lastName: 'Doe'
      });
    });

    it('should select PRI from SAP (priority 3) over PRI from Campus Solutions (priority 4)', () => {
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
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

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    it('should handle null names array', () => {
      const person = {
        personBasic: {
          names: null
        }
      };

      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
      const result = mapper.getName();

      expect(result).toEqual({});
    });

    describe('preferredOnly parameter', () => {
      it('should default to true when preferredOnly is omitted and filter out non-PRF names', () => {
        const person = {
          personBasic: {
            names: [
              {
                nameType: 'PRI',
                source: 'SAP',
                firstName: 'Primary',
                middleName: 'P',
                lastName: 'Name'
              },
              {
                nameType: 'PRF',
                source: 'Campus Solutions',
                firstName: 'Preferred',
                middleName: 'P',
                lastName: 'Name'
              }
            ]
          }
        };

        // Omit preferredOnly parameter to test default behavior
        const mapper = NameMapper({ person, convertNullstoUndefined: true });
        const result = mapper.getName();

        // Should return PRF name (filtered out PRI)
        // Should return empty object when no PRF names have valid effectiveDate
        expect(result).toEqual({});
      });

      it('should filter out all non-PRF names when preferredOnly is true', () => {
        const person = {
          personBasic: {
            names: [
              {
                nameType: 'PRI',
                source: 'SAP',
                firstName: 'Primary',
                middleName: 'P',
                lastName: 'SAP'
              },
              {
                nameType: 'UNK',
                source: 'Unknown',
                firstName: 'Unknown',
                middleName: 'U',
                lastName: 'Name'
              },
              {
                nameType: 'PRF',
                source: 'Campus Solutions',
                firstName: 'Preferred',
                middleName: 'P',
                lastName: 'CS'
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

        const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
        const result = mapper.getName();

        // Should return only the PRF name
        // Should return empty object when no PRF names have valid effectiveDate
        expect(result).toEqual({});
      });

      it('should return empty object when preferredOnly is true and no PRF names exist', () => {
        const person = {
          personBasic: {
            names: [
              {
                nameType: 'PRI',
                source: 'SAP',
                firstName: 'Primary',
                middleName: 'P',
                lastName: 'SAP'
              },
              {
                nameType: 'UNK',
                source: 'Unknown',
                firstName: 'Unknown',
                middleName: 'U',
                lastName: 'Name'
              }
            ]
          }
        };

        const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
        const result = mapper.getName();

        // Should return empty object since no PRF names are available
        expect(result).toEqual({});
      });

      it('should include all names when preferredOnly is false', () => {
        const person = {
          personBasic: {
            names: [
              {
                nameType: 'PRF',
                source: 'Campus Solutions',
                firstName: 'Preferred',
                middleName: 'P',
                lastName: 'CS'
              },
              {
                nameType: 'PRI',
                source: 'SAP',
                firstName: 'Primary',
                middleName: 'P',
                lastName: 'SAP'
              }
            ]
          }
        };

        const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: false });
        const result = mapper.getName();

        // Should return PRF name even though preferredOnly is false (PRF has higher priority)
        expect(result).toEqual({
          firstName: 'Preferred',
          middleName: 'P',
          lastName: 'CS'
        });
      });

      it('should filter out names with missing nameType when preferredOnly is true', () => {
        const person = {
          personBasic: {
            names: [
              {
                source: 'SAP',
                firstName: 'NoType',
                middleName: 'N',
                lastName: 'Name'
              },
              {
                nameType: 'PRF',
                source: 'SAP',
                firstName: 'Preferred',
                middleName: 'P',
                lastName: 'SAP'
              }
            ]
          }
        };

        const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
        const result = mapper.getName();

        // Should return PRF name (filtered out the one with missing nameType)
        // Should return empty object when no PRF names have valid effectiveDate
        expect(result).toEqual({});
      });

      it('should return empty object when preferredOnly is true and only names with missing nameType exist', () => {
        const person = {
          personBasic: {
            names: [
              {
                source: 'SAP',
                firstName: 'NoType1',
                middleName: 'N',
                lastName: 'Name1'
              },
              {
                source: 'Campus Solutions',
                firstName: 'NoType2',
                middleName: 'N',
                lastName: 'Name2'
              }
            ]
          }
        };

        const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
        const result = mapper.getName();

        // Should return empty object since no PRF names are available
        expect(result).toEqual({});
      });

      it('should prioritize PRF from SAP over PRF from Campus Solutions when preferredOnly is true', () => {
        const person = {
          personBasic: {
            names: [
              {
                nameType: 'PRF',
                source: 'Campus Solutions',
                firstName: 'CS_Preferred',
                middleName: 'C',
                lastName: 'Person'
              },
              {
                nameType: 'PRF',
                source: 'SAP',
                firstName: 'SAP_Preferred',
                middleName: 'S',
                lastName: 'Person'
              }
            ]
          }
        };

        const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
        const result = mapper.getName();

        // Should return SAP PRF (priority 1) over CS PRF (priority 2)
        // Should return empty object when no PRF names have valid effectiveDate
        expect(result).toEqual({});
      });
    });

    it('should select PRF name with most recent valid effectiveDate when preferredOnly is true', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'OldPreferred',
              middleName: 'O',
              lastName: 'Person',
              effectiveDate: '20200101'
            },
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'NewPreferred',
              middleName: 'N',
              lastName: 'Person',
              effectiveDate: '20251231'
            },
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'InvalidDatePreferred',
              middleName: 'I',
              lastName: 'Person',
              effectiveDate: 'notadate'
            }
          ]
        }
      };
      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
      const result = mapper.getName();
      // Should select the PRF name with the most recent valid effectiveDate
      expect(result).toEqual({
        firstName: 'NewPreferred',
        middleName: 'N',
        lastName: 'Person'
      });
    });

    it('should select PRF name with invalid effectiveDate if no valid PRF effectiveDate exists', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'InvalidDatePreferred',
              middleName: 'I',
              lastName: 'Person',
              effectiveDate: 'notadate'
            },
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'AlsoInvalid',
              middleName: 'A',
              lastName: 'Person',
              effectiveDate: '2024-03-05'
            }
          ]
        }
      };
      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
      const result = mapper.getName();
      // Should return empty object when multiple PRF names have only invalid effectiveDate formats
      expect(result).toEqual({});
    });

    it('should return empty object when preferredOnly is true and no PRF names with effectiveDate exist', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              source: 'SAP',
              firstName: 'Primary',
              middleName: 'P',
              lastName: 'SAP'
            },
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'PreferredNoDate',
              middleName: 'N',
              lastName: 'Person'
              // no effectiveDate
            }
          ]
        }
      };
      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
      const result = mapper.getName();
      expect(result).toEqual({});
    });

    it('should return empty object when multiple PRF names have only invalid effectiveDate formats', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'InvalidDatePreferred',
              middleName: 'I',
              lastName: 'Person',
              effectiveDate: 'notadate'
            },
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'AlsoInvalid',
              middleName: 'A',
              lastName: 'Person',
              effectiveDate: '2024-03-05'
            }
          ]
        }
      };
      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
      const result = mapper.getName();
      expect(result).toEqual({});
    });

    it('should return the PRF name when only one PRF name has an invalid effectiveDate format', () => {
      const person = {
        personBasic: {
          names: [
            {
              nameType: 'PRF',
              source: 'SAP',
              firstName: 'InvalidDatePreferred',
              middleName: 'I',
              lastName: 'Person',
              effectiveDate: 'notadate'
            }
          ]
        }
      };
      const mapper = NameMapper({ person, convertNullstoUndefined: true, preferredOnly: true });
      const result = mapper.getName();
      expect(result).toEqual({
        firstName: 'InvalidDatePreferred',
        middleName: 'I',
        lastName: 'Person'
      });
    });
  });
});
