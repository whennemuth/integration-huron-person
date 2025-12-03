import { JsonFieldFilter } from '../src/stream/JsonFieldFilter';
import testPersonData from './json-field-filter-person.json';

describe('JsonFieldFilter', () => {
  let filter: JsonFieldFilter;

  beforeEach(() => {
    // Reset filter for each test
    filter = new JsonFieldFilter(['personid', 'personBasic']);
  });

  afterEach(() => {
    // Clean up
    filter.removeAllListeners();
  });

  it('should filter object fields correctly', (done) => {
    const inputObject = {
      personid: 'U21967744',
      personBasic: {
        names: [
          {
            firstName: 'Bugs',
            lastName: 'Bunny'
          }
        ]
      },
      extraField: 'should be removed',
      anotherField: { nested: 'data' }
    };

    const expectedOutput = {
      personid: 'U21967744',
      personBasic: {
        names: [
          {
            firstName: 'Bugs',
            lastName: 'Bunny'
          }
        ]
      }
    };

    filter.on('data', (filteredObj: any) => {
      expect(filteredObj).toEqual(expectedOutput);
      done();
    });

    filter.on('error', done);

    filter.write(inputObject);
    filter.end();
  });

  it('should handle empty fieldsToKeep array', (done) => {
    const filter = new JsonFieldFilter([]);
    const inputObject = {
      personid: 'U21967744',
      personBasic: { name: 'Bugs Bunny' }
    };

    const expectedOutput = {};

    filter.on('data', (filteredObj: any) => {
      expect(filteredObj).toEqual(expectedOutput);
      done();
    });

    filter.on('error', done);

    filter.write(inputObject);
    filter.end();
  });

  it('should handle non-object input', (done) => {
    const inputValue = 'not an object';

    filter.on('data', (output: any) => {
      expect(output).toBe('not an object');
      done();
    });

    filter.on('error', done);

    filter.write(inputValue);
    filter.end();
  });

  it('should filter complex nested object from test data', (done) => {
    const fieldsToKeep = ['personid', 'personBasic'];

    filter = new JsonFieldFilter(fieldsToKeep);

    filter.on('data', (filteredObj: any) => {
      // Verify only specified fields are kept
      expect(filteredObj).toHaveProperty('personid');
      expect(filteredObj).toHaveProperty('personBasic');
      expect(filteredObj).not.toHaveProperty('phone');
      expect(filteredObj).not.toHaveProperty('email');

      // Verify the structure is preserved
      expect(typeof filteredObj.personid).toBe('string');
      expect(typeof filteredObj.personBasic).toBe('object');

      done();
    });

    filter.on('error', done);

    filter.write(testPersonData);
    filter.end();
  });

  it('should handle fields that do not exist in input', (done) => {
    const fieldsToKeep = ['personid', 'nonexistentField'];

    filter = new JsonFieldFilter(fieldsToKeep);

    filter.on('data', (filteredObj: any) => {
      expect(filteredObj).toHaveProperty('personid');
      expect(filteredObj).not.toHaveProperty('nonexistentField');
      expect(filteredObj).not.toHaveProperty('personBasic');

      done();
    });

    filter.on('error', done);

    filter.write(testPersonData);
    filter.end();
  });

  describe('Hierarchical Field Paths', () => {
    it('should extract building code from work address hierarchy', (done) => {
      const filter = new JsonFieldFilter([
        'employeeInfo.positions[*].positionInfo.Office[*].workAddress.location.building.code'
      ]);

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj).toHaveProperty('employeeInfo');
        expect(filteredObj.employeeInfo).toHaveProperty('positions');
        expect(Array.isArray(filteredObj.employeeInfo.positions)).toBe(true);
        expect(filteredObj.employeeInfo.positions[0]).toHaveProperty('positionInfo');
        expect(filteredObj.employeeInfo.positions[0].positionInfo).toHaveProperty('Office');
        expect(Array.isArray(filteredObj.employeeInfo.positions[0].positionInfo.Office)).toBe(true);
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Office[0]).toHaveProperty('workAddress');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Office[0].workAddress).toHaveProperty('location');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Office[0].workAddress.location).toHaveProperty('building');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Office[0].workAddress.location.building).toHaveProperty('code');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Office[0].workAddress.location.building.code).toBe('009411');

        // Ensure other fields are not present
        expect(filteredObj).not.toHaveProperty('personid');
        expect(filteredObj).not.toHaveProperty('personBasic');

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should extract organizational unit code from department hierarchy', (done) => {
      const filter = new JsonFieldFilter([
        'employeeInfo.positions[*].positionInfo.Department.orgUnit[*].code'
      ]);

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj).toHaveProperty('employeeInfo');
        expect(filteredObj.employeeInfo).toHaveProperty('positions');
        expect(Array.isArray(filteredObj.employeeInfo.positions)).toBe(true);
        expect(filteredObj.employeeInfo.positions[0]).toHaveProperty('positionInfo');
        expect(filteredObj.employeeInfo.positions[0].positionInfo).toHaveProperty('Department');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Department).toHaveProperty('orgUnit');
        expect(Array.isArray(filteredObj.employeeInfo.positions[0].positionInfo.Department.orgUnit)).toBe(true);

        // The orgUnit array should contain objects with code properties
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Department.orgUnit.length).toBeGreaterThan(0);
        filteredObj.employeeInfo.positions[0].positionInfo.Department.orgUnit.forEach((unit: any) => {
          expect(unit).toHaveProperty('code');
        });

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should handle multiple hierarchical paths simultaneously', (done) => {
      const filter = new JsonFieldFilter([
        'employeeInfo.positions[*].positionInfo.Office[*].workAddress.location.building.code',
        'employeeInfo.positions[*].positionInfo.Department.orgUnit[*].code',
        'personid'
      ]);

      filter.on('data', (filteredObj: any) => {
        // Should have personid
        expect(filteredObj).toHaveProperty('personid');
        expect(filteredObj.personid).toBe('U21967744');

        // Should have building code
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Office[0].workAddress.location.building.code).toBe('009411');

        // Should have org unit codes
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Department.orgUnit.length).toBeGreaterThan(0);

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should handle nested object paths without arrays', (done) => {
      const filter = new JsonFieldFilter([
        'personBasic.names[*].firstName'
      ]);

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj).toHaveProperty('personBasic');
        expect(filteredObj.personBasic).toHaveProperty('names');
        expect(Array.isArray(filteredObj.personBasic.names)).toBe(true);
        expect(filteredObj.personBasic.names[0]).toHaveProperty('firstName');
        expect(filteredObj.personBasic.names[0].firstName).toBe('Bugs');

        // Should not have other name properties
        expect(filteredObj.personBasic.names[0]).not.toHaveProperty('lastName');
        expect(filteredObj.personBasic.names[0]).not.toHaveProperty('middleName');

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should handle non-existent paths gracefully', (done) => {
      const filter = new JsonFieldFilter([
        'nonexistent.path.deeply.nested.field',
        'personid' // Include a valid field to ensure the object isn't empty
      ]);

      filter.on('data', (filteredObj: any) => {
        // Should only have the valid field
        expect(filteredObj).toHaveProperty('personid');
        expect(filteredObj.personid).toBe('U21967744');

        // Should not have the non-existent path
        expect(filteredObj).not.toHaveProperty('nonexistent');

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should distinguish between different code fields in hierarchy', (done) => {
      const filter = new JsonFieldFilter([
        'employeeInfo.positions[*].positionInfo.Office[*].workAddress.location.building.code', // Building code
        'employeeInfo.positions[*].positionInfo.Department.unit', // Department unit (different from code)
        'employeeInfo.positions[*].positionInfo.BasicData.position.code' // Position code
      ]);

      filter.on('data', (filteredObj: any) => {
        const position = filteredObj.employeeInfo.positions[0];

        // Building code should be present
        expect(position.positionInfo.Office[0].workAddress.location.building.code).toBe('009411');

        // Department unit should be present (different from building code)
        expect(position.positionInfo.Department.unit).toBe('051');

        // Position code should be present
        expect(position.positionInfo.BasicData.position.code).toBe('50032663');

        // These are all different fields with "code" in their paths but different values
        expect(position.positionInfo.Office[0].workAddress.location.building.code).not.toBe(position.positionInfo.BasicData.position.code);

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should extract specific array element by index', (done) => {
      const filter = new JsonFieldFilter([
        'employeeInfo.positions[0].positionInfo.Department.orgUnit[2].code'
      ]);

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj).toHaveProperty('employeeInfo');
        expect(filteredObj.employeeInfo).toHaveProperty('positions');
        expect(Array.isArray(filteredObj.employeeInfo.positions)).toBe(true);
        expect(filteredObj.employeeInfo.positions[0]).toHaveProperty('positionInfo');
        expect(filteredObj.employeeInfo.positions[0].positionInfo).toHaveProperty('Department');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Department).toHaveProperty('orgUnit');
        expect(Array.isArray(filteredObj.employeeInfo.positions[0].positionInfo.Department.orgUnit)).toBe(true);
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Department.orgUnit[2]).toHaveProperty('code');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Department.orgUnit[2].code).toBe('10002309');

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should extract first name from specific name array index', (done) => {
      const filter = new JsonFieldFilter([
        'personBasic.names[1].firstName'
      ]);

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj).toHaveProperty('personBasic');
        expect(filteredObj.personBasic).toHaveProperty('names');
        expect(Array.isArray(filteredObj.personBasic.names)).toBe(true);
        expect(filteredObj.personBasic.names[1]).toHaveProperty('firstName');
        expect(filteredObj.personBasic.names[1].firstName).toBe('Bugs');

        // Should not have other fields from the same object
        expect(filteredObj.personBasic.names[1]).not.toHaveProperty('lastName');
        expect(filteredObj.personBasic.names[1]).not.toHaveProperty('nameType');

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should handle out-of-bounds array index gracefully', (done) => {
      const filter = new JsonFieldFilter([
        'personBasic.names[10].firstName', // Index 10 doesn't exist
        'personid' // Include a valid field to ensure the object isn't empty
      ]);

      filter.on('data', (filteredObj: any) => {
        // Should only have the valid field
        expect(filteredObj).toHaveProperty('personid');
        expect(filteredObj.personid).toBe('U21967744');

        // Should not have the out-of-bounds path
        expect(filteredObj).not.toHaveProperty('personBasic');

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should mix specific indices and wildcard arrays', (done) => {
      const filter = new JsonFieldFilter([
        'employeeInfo.positions[0].positionInfo.Office[*].workAddress.location.building.code', // All offices in first position
        'personBasic.names[0].firstName' // First name from first name entry
      ]);

      filter.on('data', (filteredObj: any) => {
        // Should have building codes from all offices in first position
        expect(filteredObj.employeeInfo.positions[0].positionInfo.Office[0].workAddress.location.building.code).toBe('009411');

        // Should have first name from first name entry
        expect(filteredObj.personBasic.names[0].firstName).toBe('Bugs');

        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });
  });

  describe('customFilterCase functionality', () => {
    it('should apply customFilterCase to add default values to empty loaStatus', (done) => {
      const customFilter = (source: any, target: any) => {
        // Add default values to loaStatus if it exists in target
        const loaStatusPath = target.employeeInfo?.positions?.[0]?.positionInfo?.BasicData?.loaStatus;
        if (loaStatusPath) {
          if (loaStatusPath.code === '') {
            loaStatusPath.code = '001';
          }
          if (loaStatusPath.status === '') {
            loaStatusPath.status = 'active';
          }
        }
      };

      const filter = new JsonFieldFilter(
        ['employeeInfo.positions[*].positionInfo.BasicData.loaStatus'],
        customFilter
      );

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj.employeeInfo.positions[0].positionInfo.BasicData.loaStatus.code).toBe('001');
        expect(filteredObj.employeeInfo.positions[0].positionInfo.BasicData.loaStatus.status).toBe('active');
        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should apply customFilterCase to remove fields based on source criteria', (done) => {
      const customFilter = (source: any, target: any) => {
        // Remove personBasic if personid starts with 'U'
        if (source.personid && source.personid.startsWith('U')) {
          delete target.personBasic;
        }
      };

      const filter = new JsonFieldFilter(
        ['personid', 'personBasic'],
        customFilter
      );

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj).toHaveProperty('personid');
        expect(filteredObj).not.toHaveProperty('personBasic');
        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });

    it('should apply customFilterCase to transform array to single object based on criteria', (done) => {
      const customFilter = (source: any, target: any) => {
        // Replace names array with single name object where source === 'SAP'
        if (target.personBasic?.names && Array.isArray(target.personBasic.names)) {
          const sapName = target.personBasic.names.find((name: any) => name.source === 'SAP');
          if (sapName) {
            target.personBasic.name = sapName;
            delete target.personBasic.names;
          }
        }
      };

      const filter = new JsonFieldFilter(
        ['personBasic.names'],
        customFilter
      );

      filter.on('data', (filteredObj: any) => {
        expect(filteredObj.personBasic).toHaveProperty('name');
        expect(filteredObj.personBasic).not.toHaveProperty('names');
        expect(filteredObj.personBasic.name.source).toBe('SAP');
        expect(filteredObj.personBasic.name.firstName).toBe('Bugs');
        expect(filteredObj.personBasic.name.lastName).toBe('Bunny');
        done();
      });

      filter.on('error', done);
      filter.write(testPersonData);
      filter.end();
    });
  });
});
