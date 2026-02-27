import { DataMapperHeuristics, SOURCE, EMAIL_TYPE, PersonHeuristics } from '../../src/data-mapper/DataMapperHeuristics';

describe('DataMapperHeuristics', () => {
  describe('getSource', () => {
    it('returns undefined for empty input', () => {
      expect(new DataMapperHeuristics(undefined).getSource()).toBeUndefined();
      expect(new DataMapperHeuristics(null).getSource()).toBeUndefined();
      expect(new DataMapperHeuristics('').getSource()).toBeUndefined();
    });

    it('matches direct enum values', () => {
      expect(new DataMapperHeuristics('SAP').getSource()).toBe(SOURCE.SAP);
      expect(new DataMapperHeuristics('Campus Solutions').getSource()).toBe(SOURCE.CS);
      expect(new DataMapperHeuristics('VDS').getSource()).toBe(SOURCE.VDS);
      expect(new DataMapperHeuristics('DARS').getSource()).toBe(SOURCE.DARS);
    });

    it('matches lower/abbreviated/variant forms', () => {
      expect(new DataMapperHeuristics('cs').getSource()).toBe(SOURCE.CS);
      expect(new DataMapperHeuristics('campus solutions').getSource()).toBe(SOURCE.CS);
      expect(new DataMapperHeuristics('SAP').getSource()).toBe(SOURCE.SAP);
      expect(new DataMapperHeuristics('sap').getSource()).toBe(SOURCE.SAP);
      expect(new DataMapperHeuristics('foo sap bar').getSource()).toBe(SOURCE.SAP);
      expect(new DataMapperHeuristics('VDS').getSource()).toBe(SOURCE.VDS);
      expect(new DataMapperHeuristics('vds123').getSource()).toBe(SOURCE.VDS);
      expect(new DataMapperHeuristics('DARS').getSource()).toBe(SOURCE.DARS);
      expect(new DataMapperHeuristics('dars').getSource()).toBe(SOURCE.DARS);
      expect(new DataMapperHeuristics('bbec').getSource()).toBe(SOURCE.DARS);
      expect(new DataMapperHeuristics('foo bbec bar').getSource()).toBe(SOURCE.DARS);
    });

    it('returns undefined for unknown source', () => {
      expect(new DataMapperHeuristics('unknown').getSource()).toBeUndefined();
      expect(new DataMapperHeuristics('random string').getSource()).toBeUndefined();
    });
  });

  describe('getEmailType', () => {
    it('returns undefined for empty input', () => {
      expect(new DataMapperHeuristics(undefined).getEmailType()).toBeUndefined();
      expect(new DataMapperHeuristics(null).getEmailType()).toBeUndefined();
      expect(new DataMapperHeuristics('').getEmailType()).toBeUndefined();
    });

    it('matches university email types', () => {
      expect(new DataMapperHeuristics('univ').getEmailType()).toBe(EMAIL_TYPE.UNIVERSITY);
      expect(new DataMapperHeuristics('University').getEmailType()).toBe(EMAIL_TYPE.UNIVERSITY);
      expect(new DataMapperHeuristics('university email').getEmailType()).toBe(EMAIL_TYPE.UNIVERSITY);
    });

    it('matches personal email types', () => {
      expect(new DataMapperHeuristics('pers').getEmailType()).toBe(EMAIL_TYPE.PERSONAL);
      expect(new DataMapperHeuristics('Personal').getEmailType()).toBe(EMAIL_TYPE.PERSONAL);
      expect(new DataMapperHeuristics('personal email').getEmailType()).toBe(EMAIL_TYPE.PERSONAL);
    });

    it('matches BUEM email types', () => {
      expect(new DataMapperHeuristics('buem').getEmailType()).toBe(EMAIL_TYPE.BUEMAIL);
      expect(new DataMapperHeuristics('BUEM').getEmailType()).toBe(EMAIL_TYPE.BUEMAIL);
      expect(new DataMapperHeuristics('buemail').getEmailType()).toBe(EMAIL_TYPE.BUEMAIL);
    });

    it('returns undefined for unknown email type', () => {
      expect(new DataMapperHeuristics('random').getEmailType()).toBeUndefined();
      expect(new DataMapperHeuristics('foo').getEmailType()).toBeUndefined();
    });
  });
});

describe('PersonHeuristics', () => {
  describe('isEmployee', () => {
    it('returns true when employeeInfo has non-empty properties', () => {
      const person = {
        employeeInfo: {
          employeeId: '12345'
        }
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(true);
    });

    it('returns true when employeeInfo has non-empty nested objects', () => {
      const person = {
        employeeInfo: {
          positions: [{ positionId: 'P1' }]
        }
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(true);
    });

    it('returns false when employeeInfo is undefined', () => {
      const person = {};
      expect(new PersonHeuristics(person).isEmployee()).toBe(false);
    });

    it('returns false when employeeInfo is empty object', () => {
      const person = {
        employeeInfo: {}
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(false);
    });

    it('returns false when employeeInfo has only null properties', () => {
      const person = {
        employeeInfo: {
          employeeId: null,
          positions: null
        }
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(false);
    });

    it('returns false when employeeInfo has only undefined properties', () => {
      const person = {
        employeeInfo: {
          employeeId: undefined,
          positions: undefined
        }
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(false);
    });

    it('returns false when employeeInfo has only empty string properties', () => {
      const person = {
        employeeInfo: {
          employeeId: '',
          department: ''
        }
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(false);
    });

    it('returns false when employeeInfo has only empty arrays', () => {
      const person = {
        employeeInfo: {
          positions: []
        }
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(false);
    });

    it('returns true when employeeInfo has mix of empty and non-empty properties', () => {
      const person = {
        employeeInfo: {
          employeeId: '',
          department: 'Engineering'
        }
      };
      expect(new PersonHeuristics(person).isEmployee()).toBe(true);
    });
  });

  describe('isStudent', () => {
    it('returns true when studentInfo has non-empty properties', () => {
      const person = {
        studentInfo: {
          studentId: '98765'
        }
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(true);
    });

    it('returns true when studentInfo has non-empty nested objects', () => {
      const person = {
        studentInfo: {
          enrollments: [{ courseId: 'CS101' }]
        }
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(true);
    });

    it('returns false when studentInfo is undefined', () => {
      const person = {};
      expect(new PersonHeuristics(person).isStudent()).toBe(false);
    });

    it('returns false when studentInfo is empty object', () => {
      const person = {
        studentInfo: {}
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(false);
    });

    it('returns false when studentInfo has only null properties', () => {
      const person = {
        studentInfo: {
          studentId: null,
          enrollments: null
        }
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(false);
    });

    it('returns false when studentInfo has only undefined properties', () => {
      const person = {
        studentInfo: {
          studentId: undefined,
          enrollments: undefined
        }
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(false);
    });

    it('returns false when studentInfo has only empty string properties', () => {
      const person = {
        studentInfo: {
          studentId: '',
          major: ''
        }
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(false);
    });

    it('returns false when studentInfo has only empty arrays', () => {
      const person = {
        studentInfo: {
          enrollments: []
        }
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(false);
    });

    it('returns true when studentInfo has mix of empty and non-empty properties', () => {
      const person = {
        studentInfo: {
          studentId: '',
          major: 'Computer Science'
        }
      };
      expect(new PersonHeuristics(person).isStudent()).toBe(true);
    });
  });

  describe('isAffiliate', () => {
    it('returns true when affiliateInfo has non-empty properties', () => {
      const person = {
        affiliateInfo: {
          affiliateId: 'A123'
        }
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(true);
    });

    it('returns true when affiliateInfo has non-empty nested objects', () => {
      const person = {
        affiliateInfo: {
          affiliations: [{ organizationId: 'ORG1' }]
        }
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(true);
    });

    it('returns false when affiliateInfo is undefined', () => {
      const person = {};
      expect(new PersonHeuristics(person).isAffiliate()).toBe(false);
    });

    it('returns false when affiliateInfo is empty object', () => {
      const person = {
        affiliateInfo: {}
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(false);
    });

    it('returns false when affiliateInfo has only null properties', () => {
      const person = {
        affiliateInfo: {
          affiliateId: null,
          affiliations: null
        }
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(false);
    });

    it('returns false when affiliateInfo has only undefined properties', () => {
      const person = {
        affiliateInfo: {
          affiliateId: undefined,
          affiliations: undefined
        }
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(false);
    });

    it('returns false when affiliateInfo has only empty string properties', () => {
      const person = {
        affiliateInfo: {
          affiliateId: '',
          organization: ''
        }
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(false);
    });

    it('returns false when affiliateInfo has only empty arrays', () => {
      const person = {
        affiliateInfo: {
          affiliations: []
        }
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(false);
    });

    it('returns true when affiliateInfo has mix of empty and non-empty properties', () => {
      const person = {
        affiliateInfo: {
          affiliateId: '',
          organization: 'Research Lab'
        }
      };
      expect(new PersonHeuristics(person).isAffiliate()).toBe(true);
    });
  });

  describe('isFaculty', () => {
    it('returns true when facultyInfo has non-empty properties', () => {
      const person = {
        facultyInfo: {
          facultyId: 'F456'
        }
      };
      expect(new PersonHeuristics(person).isFaculty()).toBe(true);
    });

    it('returns false when facultyInfo is undefined', () => {
      const person = {};
      expect(new PersonHeuristics(person).isFaculty()).toBe(false);
    });

    it('returns false when facultyInfo is empty object', () => {
      const person = {
        facultyInfo: {}
      };
      expect(new PersonHeuristics(person).isFaculty()).toBe(false);
    });

    it('returns false when facultyInfo has only null properties', () => {
      const person = {
        facultyInfo: {
          facultyId: null,
          department: null
        }
      };
      expect(new PersonHeuristics(person).isFaculty()).toBe(false);
    });
  });

  describe('isConstituent', () => {
    it('returns true when constituentInfo has non-empty properties', () => {
      const person = {
        constituentInfo: {
          constituentId: 'C789'
        }
      };
      expect(new PersonHeuristics(person).isConstituent()).toBe(true);
    });

    it('returns false when constituentInfo is undefined', () => {
      const person = {};
      expect(new PersonHeuristics(person).isConstituent()).toBe(false);
    });

    it('returns false when constituentInfo is empty object', () => {
      const person = {
        constituentInfo: {}
      };
      expect(new PersonHeuristics(person).isConstituent()).toBe(false);
    });

    it('returns false when constituentInfo has only null properties', () => {
      const person = {
        constituentInfo: {
          constituentId: null,
          type: null
        }
      };
      expect(new PersonHeuristics(person).isConstituent()).toBe(false);
    });
  });

  describe('Multiple person types', () => {
    it('can detect person with multiple types', () => {
      const person = {
        employeeInfo: {
          employeeId: '12345'
        },
        studentInfo: {
          studentId: '98765'
        }
      };
      const heuristics = new PersonHeuristics(person);
      expect(heuristics.isEmployee()).toBe(true);
      expect(heuristics.isStudent()).toBe(true);
      expect(heuristics.isAffiliate()).toBe(false);
    });

    it('can detect person with all types having values', () => {
      const person = {
        employeeInfo: { employeeId: '12345' },
        studentInfo: { studentId: '98765' },
        affiliateInfo: { affiliateId: 'A123' },
        facultyInfo: { facultyId: 'F456' },
        constituentInfo: { constituentId: 'C789' }
      };
      const heuristics = new PersonHeuristics(person);
      expect(heuristics.isEmployee()).toBe(true);
      expect(heuristics.isStudent()).toBe(true);
      expect(heuristics.isAffiliate()).toBe(true);
      expect(heuristics.isFaculty()).toBe(true);
      expect(heuristics.isConstituent()).toBe(true);
    });

    it('can detect person with all types as empty objects', () => {
      const person = {
        employeeInfo: {},
        studentInfo: {},
        affiliateInfo: {},
        facultyInfo: {},
        constituentInfo: {}
      };
      const heuristics = new PersonHeuristics(person);
      expect(heuristics.isEmployee()).toBe(false);
      expect(heuristics.isStudent()).toBe(false);
      expect(heuristics.isAffiliate()).toBe(false);
      expect(heuristics.isFaculty()).toBe(false);
      expect(heuristics.isConstituent()).toBe(false);
    });
  });
});
