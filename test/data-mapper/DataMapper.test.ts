import { DataMapper } from '../../src/data-mapper/DataMapper';

describe('DataMapper', () => {
  describe('map', () => {
    it('should map bugs.json source to bugs.json target', () => {
      const source = require('./source/bugs.json');
      const expectedTarget = require('./target/bugs.json');

      const mapper = new DataMapper();
      const result = mapper.map([source]);

      // The result should have fieldSets with one item, and fieldValues should match expectedTarget
      expect(result.fieldSets).toHaveLength(1);
      const actual = result.fieldSets[0].fieldValues;
      const expected = expectedTarget;
      expect(actual).toHaveLength(expected.length);
      const sortedActual = actual.sort((a: any, b: any) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]));
      const sortedExpected = expected.sort((a: any, b: any) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]));
      expect(sortedActual).toEqual(sortedExpected);
    });

    // Add more comprehensive tests here, without repeating mapper-specific tests
    it('should handle empty array', () => {
      const mapper = new DataMapper();
      const result = mapper.map([]);
      expect(result.fieldSets).toEqual([]);
      expect(result.fieldDefinitions).toBeDefined();
    });

    it('should set validationFailureMessage for missing personId', () => {
      const mapper = new DataMapper();
      const invalidPerson = { personBasic: { names: [{ firstName: 'Test', lastName: 'User' }] } };
      mapper.map([invalidPerson]);
      expect(mapper.validationFailureMessage).toContain('missing required personId');
    });

    it('should set validationFailureMessage for missing names', () => {
      const mapper = new DataMapper();
      const invalidPerson = { personid: '123' };
      mapper.map([invalidPerson]);
      expect(mapper.validationFailureMessage).toContain('missing required name fields');
    });

    it('should set validationFailureMessage for missing organizations', () => {
      const mapper = new DataMapper();
      const invalidPerson = {
        personid: '123',
        personBasic: { names: [{ firstName: 'Test', lastName: 'User' }] }
      };
      mapper.map([invalidPerson]);
      expect(mapper.validationFailureMessage).toContain('missing required organization field');
    });

    it('should handle multiple persons', () => {
      const mapper = new DataMapper();
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
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            },
            {
              positionInfo: {
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
      const mapper = new DataMapper();
      const result = mapper.map([dualOrgPerson]);
      expect(result.fieldSets).toHaveLength(1);
      const fields = result.fieldSets[0].fieldValues;
      const secondaryUnitField = fields.find((f: any) => 'secondaryUnit' in f);
      expect(secondaryUnitField).toBeDefined();
      expect(secondaryUnitField!.secondaryUnit).toBeDefined();
      expect((secondaryUnitField!.secondaryUnit as any).hrn).toBe('lookup:sourceIdentifier:20003827');
    });
  });
});