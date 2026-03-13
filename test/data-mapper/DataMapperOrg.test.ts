import { OrgAssignments, OrgMapper } from '../../src/data-mapper/DataMapperOrg';
import { Term } from '../../src/data-source/CurrentTermsDataSource';

// Helper to create active position with valid employment dates
const createActivePosition = (orgUnit: string, mainPernrIndicator: string = 'N') => ({
  positionInfo: {
    BasicData: {
      mainPernrIndicator,
      employmentDate: '20200101', // Past date
      terminationDate: ''  // Empty = active+ status (ongoing, no end date)
    },
    Department: {
      organizationalUnit: orgUnit
    }
  }
});

// Helper to create mock current terms
const createMockCurrentTerms = (): Term[] => [
  {
    term: '2261',
    termDescription: 'Spring 2026',
    academicCareer: 'UGRD',
    termBeginDate: '20260120',
    termEndDate: '20260508',
    currentInd: 'Y'
  },
  {
    term: '2261',
    termDescription: 'Spring 2026',
    academicCareer: 'GRAD',
    termBeginDate: '20260120',
    termEndDate: '20260508',
    currentInd: 'Y'
  }
];

// Helper to create a student semester with academic plan structure
const createStudentSemester = (
  termCode: string, 
  careerCode: string, 
  orgCodes: string | string[],
  isCurrentProgram: 'Y' | 'N' = 'Y'
) => {
  const orgCodesArray = Array.isArray(orgCodes) ? orgCodes : [orgCodes];
  
  return {
    studentSemesterInfo: {
      academicTerm: {
        term: {
          code: termCode
        }
      },
      academicCareer: {
        code: careerCode
      },
      degreeProgram: [
        {
          isCurrentAcademicProgram: isCurrentProgram,
          academicPlan: orgCodesArray.map(code => ({
            academicOrganization: {
              code
            }
          }))
        }
      ]
    }
  };
};

describe('OrgMapper', () => {
  const mockCurrentTerms = createMockCurrentTerms();
  
  describe('getOrgs', () => {
    it('should return empty object when no org data is available', () => {
      const person = {};
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should return empty object when all sources are empty', () => {
      const person = {
        employeeInfo: { positions: [] },
        studentInfo: { studentSemester: [] },
        affiliateInfo: {}
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should assign single org to employer and organization', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should assign two orgs to employer, organization, and secondaryUnit', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827'),
            createActivePosition('20003827')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ 
        employer: '10003827', 
        organization: '10003827',
        secondaryUnit: '20003827'
      });
    });

    it('should deduplicate orgIds in employee positions', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827'),
            createActivePosition('10003827')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should assign student org to employer and organization', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' });
    });

    it('should assign multiple student orgs across employer, organization, and secondaryUnit', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', ['CAS', 'ENG'])
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ 
        employer: 'CAS', 
        organization: 'CAS',
        secondaryUnit: 'ENG'
      });
    });

    it('should handle affiliate info with organizationalUnit', () => {
      const person = {
        affiliateInfo: {
          organizationalUnit: 'AFF123'
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      // For affiliates, only employer is set; organization is EXEMPTED per CSV spec
      expect(result).toEqual({ employer: 'AFFILIATE' });
    });

    it('should handle affiliate info with department', () => {
      const person = {
        affiliateInfo: {
          department: 'DEPT456'
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      // For affiliates, only employer is set; organization is EXEMPTED per CSV spec
      expect(result).toEqual({ employer: 'AFFILIATE' });
    });

    it('should prioritize employee over student', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827')
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
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should prioritize employee over affiliate', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827')
          ]
        },
        affiliateInfo: {
          organizationalUnit: 'AFF123'
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should prioritize student over affiliate', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS')
          ]
        },
        affiliateInfo: {
          organizationalUnit: 'AFF123'
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' });
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
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should handle undefined sources', () => {
      const person = {
        employeeInfo: undefined,
        studentInfo: undefined,
        affiliateInfo: undefined
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should handle empty strings and trim whitespace', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: '20200101',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '  10003827  '
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should skip invalid or empty orgIds', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: '20200101',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: ''
                }
              }
            },
            createActivePosition('10003827')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should handle removeNullValues parameter', () => {
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
      const mapperWithConversion = OrgMapper({ person, currentTerms: mockCurrentTerms, removeNullValues: true });
      const resultWith = mapperWithConversion.getOrgs();
      expect(resultWith).toEqual({});

      const mapperWithout = OrgMapper({ person, currentTerms: mockCurrentTerms, removeNullValues: false });
      const resultWithout = mapperWithout.getOrgs();
      expect(resultWithout).toEqual({}); // Since null is empty
    });

    it('should handle complex nested data', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827')
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
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' }); // Employee has highest priority
    });
  });

  describe('mainPernrIndicator - Primary Position Identification', () => {
    it('should prioritize position with mainPernrIndicator=Y (primary position first)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: '20200101',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '20003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: '20200101',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '10003827',
        organization: '10003827',
        secondaryUnit: '20003827'
      });
    });

    it('should default mainPernrIndicator to N when missing', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  employmentDate: '20200101',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '20003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: '20200101',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '10003827',
        organization: '10003827',
        secondaryUnit: '20003827'
      });
    });

    it('should handle position without BasicData (defaults to N)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                Department: {
                  organizationalUnit: '30003827'
                }
              }
            },
            createActivePosition('10003827', 'Y')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should maintain order for multiple secondary positions (mainPernrIndicator=N)', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('20003827', 'N'),
            createActivePosition('30003827', 'N'),
            createActivePosition('10003827', 'Y')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '10003827',
        organization: '10003827',
        secondaryUnit: '20003827',
        additionalUnit: '30003827'
      });
    });

    it('should handle all positions with mainPernrIndicator=Y (maintain order)', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('20003827', 'Y'),
            createActivePosition('10003827', 'Y')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '20003827',
        organization: '20003827',
        secondaryUnit: '10003827'
      });
    });

    it('should handle all positions with mainPernrIndicator=N (maintain order)', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('20003827', 'N'),
            createActivePosition('10003827', 'N')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '20003827',
        organization: '20003827',
        secondaryUnit: '10003827'
      });
    });

    it('should handle single position with mainPernrIndicator=Y', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827', 'Y')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should still deduplicate organizationalUnits across positions', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827', 'Y'),
            createActivePosition('10003827', 'N')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' }); // Deduplicated
    });
  });

  describe('Active Position Filtering - employmentDate and terminationDate', () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const pastDate = '20200101'; // January 1, 2020
    const futureDate = '20991231'; // December 31, 2099 (far future to avoid test failures)
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10).replace(/-/g, '');
    const tomorrowDate = new Date(today);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10).replace(/-/g, '');

    it('should include position with status "active" (employmentDate <= currentDate < terminationDate)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: futureDate
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should include position with status "active+" (employmentDate <= currentDate, terminationDate empty)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should include position with status "active+" (employmentDate <= currentDate, terminationDate undefined)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate
                  // terminationDate is undefined
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should include position with status "active+" (employmentDate <= currentDate, terminationDate invalid format)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: 'invalid'
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' });
    });

    it('should exclude position with status "inactive" (currentDate >= terminationDate)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: yesterdayStr
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should exclude position with status "inactive" (employmentDate empty)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: '',
                  terminationDate: futureDate
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should exclude position with status "inactive" (employmentDate undefined)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  // employmentDate is undefined
                  terminationDate: futureDate
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should exclude position with status "inactive" (employmentDate invalid format)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: 'invalid',
                  terminationDate: futureDate
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should exclude position with status "inactive" (both dates empty)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: '',
                  terminationDate: ''
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should exclude position with status "inactive" (both dates undefined)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y'
                  // both dates undefined
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should exclude position when employment has not started yet (employmentDate > currentDate)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: tomorrowStr,
                  terminationDate: futureDate
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should filter to only active positions when mixed with inactive', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: yesterdayStr // Terminated
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: pastDate,
                  terminationDate: futureDate // Active
                },
                Department: {
                  organizationalUnit: '20003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '20003827', organization: '20003827' }); // Only the active secondary position
    });

    it('should prioritize active over active+ when both mainPernrIndicator=Y', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: '' // active+
                },
                Department: {
                  organizationalUnit: '20003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: futureDate // active
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '10003827',
        organization: '10003827',
        secondaryUnit: '20003827'
      });
    });

    it('should prioritize active over active+ when both mainPernrIndicator=N', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: pastDate,
                  terminationDate: '' // active+
                },
                Department: {
                  organizationalUnit: '20003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: pastDate,
                  terminationDate: futureDate // active
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '10003827',
        organization: '10003827',
        secondaryUnit: '20003827'
      });
    });

    it('should apply full priority: Y+active, Y+active+, N+active, N+active+', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: pastDate,
                  terminationDate: '' // N + active+
                },
                Department: {
                  organizationalUnit: '40003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: '' // Y + active+
                },
                Department: {
                  organizationalUnit: '20003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'N',
                  employmentDate: pastDate,
                  terminationDate: futureDate // N + active
                },
                Department: {
                  organizationalUnit: '30003827'
                }
              }
            },
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: pastDate,
                  terminationDate: futureDate // Y + active
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: '10003827',
        organization: '10003827',
        secondaryUnit: '20003827',
        additionalUnit: '30003827'
      });
      // 4th org ('40003827' - N + active+) is discarded per CSV spec
    });

    it('should handle position without BasicData (treated as inactive)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                // No BasicData
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({}); // Filtered out as inactive
    });

    it('should validate date format strictly (reject invalid dates)', () => {
      const person = {
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  mainPernrIndicator: 'Y',
                  employmentDate: '20200230', // February 30 doesn't exist
                  terminationDate: futureDate
                },
                Department: {
                  organizationalUnit: '10003827'
                }
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({}); // Invalid date treated as inactive
    });
  });

  describe('Current Semester Filtering', () => {
    it('should include student organizations from current semesters only', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS'), // Current semester (matches mockCurrentTerms)
            createStudentSemester('2251', 'UGRD', 'ENG')  // Past semester (not in mockCurrentTerms)
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' }); // Only current semester org
    });

    it('should match both term and academicCareer for current semester', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS'),  // Matches current term
            createStudentSemester('2261', 'LAW', 'LAW')   // Same term but different career (not in mockCurrentTerms)
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' }); // Only semester matching both term AND career
    });

    it('should handle multiple current semesters with different careers', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS'),  // Current UGRD
            createStudentSemester('2261', 'GRAD', 'MET')   // Current GRAD
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'MET' }); // Both current semester orgs
    });

    it('should exclude semesters with missing term code', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: {
                    // code is missing
                  }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({}); // Excluded due to missing term code
    });

    it('should exclude semesters with missing academicCareer code', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: {
                    code: '2261'
                  }
                },
                academicCareer: {
                  // code is missing
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({}); // Excluded due to missing career code
    });

    it('should exclude all student orgs when currentTerms is empty', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: [] });
      const result = mapper.getOrgs();
      expect(result).toEqual({}); // No current terms = no student orgs
    });

    it('should exclude student orgs when no terms have currentInd=Y', () => {
      const nonCurrentTerms: Term[] = [
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'UGRD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'N' // Not current
        }
      ];
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: nonCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({}); // No current terms = no student orgs
    });

    it('should handle student with multiple degree programs in current semester', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: {
                    code: '2261'
                  }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'ENG' }); // Both colleges from current semester
    });

    it('should prioritize employee over student even with current semester filtering', () => {
      const person = {
        employeeInfo: {
          positions: [
            createActivePosition('10003827', 'Y')
          ]
        },
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: '10003827', organization: '10003827' }); // Employee has priority
    });
  });

  describe('Current Academic Program Filtering - isCurrentAcademicProgram', () => {
    it('should only include degree programs where isCurrentAcademicProgram=Y', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  },
                  {
                    isCurrentAcademicProgram: 'N',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' }); // Only current program (Y)
    });

    it('should exclude all degree programs when isCurrentAcademicProgram=N', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS', 'N')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({}); // No current programs
    });

    it('should handle multiple current academic programs (dual degree)', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      }
                    ]
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'QST'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'ENG', organization: 'ENG', secondaryUnit: 'QST' }); // Both current programs
    });

    it('should extract organizations from academicPlan array', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      },
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'ENG' }); // Both plans
    });

    it('should deduplicate organization codes from multiple academic plans', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      },
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      },
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'ENG' }); // Deduplicated
    });

    it('should sort organizations alphabetically', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'QST'
                        }
                      },
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      },
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      // Verify organizations are assigned in alphabetical order
      expect(result).toEqual({
        employer: 'CAS',
        organization: 'CAS',
        secondaryUnit: 'ENG',
        additionalUnit: 'QST'
      });
    });

    it('should handle empty academicPlan array', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should handle missing academicOrganization in plan', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        // academicOrganization missing
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should handle missing academicOrganization.code', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          // code missing
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({});
    });

    it('should combine orgs from multiple current programs with multiple plans each', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      },
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'QST'
                        }
                      },
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({
        employer: 'CAS',
        organization: 'CAS',
        secondaryUnit: 'ENG',
        additionalUnit: 'QST'
      }); // Deduped and sorted
    });

    it('should apply both semester and program filtering together', () => {
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2261' }
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'CAS'
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              studentSemesterInfo: {
                academicTerm: {
                  term: { code: '2251' } // Past semester
                },
                academicCareer: {
                  code: 'UGRD'
                },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicPlan: [
                      {
                        academicOrganization: {
                          code: 'ENG'
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' }); // Only current semester with current program
    });
  });
});