import { OrgMapper } from '../../src/data-mapper/DataMapperOrg';

describe('OrgMapper', () => {
  describe('getOrgs', () => {
    it('should return empty set when no org data is available', () => {
      const person = {};
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result.size).toBe(0);
    });

    it('should return empty set when all sources are empty', () => {
      const person = {
        employeeInfo: { positions: [] },
        studentInfo: { studentSemester: [] },
        affiliateInfo: {}
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result.size).toBe(0);
    });

    it('should collect orgIds from employee positions (highest priority)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827']));
    });

    it('should collect multiple unique orgIds from employee positions', () => {
      const person = {
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
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827', '20003827']));
    });

    it('should handle duplicate orgIds in employee positions', () => {
      const person = {
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
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827']));
    });

    it('should collect orgIds from student semesters', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                degreeProgram: [
                  {
                    college: {
                      code: 'CAS'
                    }
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['CAS']));
    });

    it('should collect multiple unique college codes from student semesters', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                degreeProgram: [
                  {
                    college: {
                      code: 'CAS'
                    }
                  },
                  {
                    college: {
                      code: 'ENG'
                    }
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['CAS', 'ENG']));
    });

    it('should handle affiliate info with organizationalUnit', () => {
      const person = {
        affiliateInfo: {
          organizationalUnit: 'AFF123'
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['AFFILIATE']));
    });

    it('should handle affiliate info with department', () => {
      const person = {
        affiliateInfo: {
          department: 'DEPT456'
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['AFFILIATE']));
    });

    it('should prioritize employee over student', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        },
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                degreeProgram: [
                  {
                    college: {
                      code: 'CAS'
                    }
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827']));
    });

    it('should prioritize employee over affiliate', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        },
        affiliateInfo: {
          organizationalUnit: 'AFF123'
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827']));
    });

    it('should prioritize student over affiliate', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                degreeProgram: [
                  {
                    college: {
                      code: 'CAS'
                    }
                  }
                ]
              }
            }
          ]
        },
        affiliateInfo: {
          organizationalUnit: 'AFF123'
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['CAS']));
    });

    it('should handle null values in person data', () => {
      const person = {
        employeeInfo: null,
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                degreeProgram: [
                  {
                    college: {
                      code: null
                    }
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result.size).toBe(0);
    });

    it('should handle undefined sources', () => {
      const person = {
        employeeInfo: undefined,
        studentInfo: undefined,
        affiliateInfo: undefined
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result.size).toBe(0);
    });

    it('should handle empty strings and trim whitespace', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: '  10003827  '
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827']));
    });

    it('should skip invalid or empty orgIds', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: ''
                }
              }
            },
            {
              positionInfo: {
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827']));
    });

    it('should handle convertNullstoUndefined parameter', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: null
                }
              }
            }
          ]
        }
      };
      const mapperWithConversion = OrgMapper(person, true);
      const resultWith = mapperWithConversion.getOrgs();
      expect(resultWith.size).toBe(0);

      const mapperWithout = OrgMapper(person, false);
      const resultWithout = mapperWithout.getOrgs();
      expect(resultWithout.size).toBe(0); // Since null is empty
    });

    it('should handle complex nested data', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        },
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                degreeProgram: [
                  {
                    college: {
                      code: 'CAS'
                    }
                  },
                  {
                    college: {
                      code: 'ENG'
                    }
                  }
                ]
              }
            }
          ]
        },
        affiliateInfo: {
          organizationalUnit: 'AFF123'
        }
      };
      const mapper = OrgMapper(person);
      const result = mapper.getOrgs();
      expect(result).toEqual(new Set(['10003827'])); // Employee has highest priority
    });
  });
});