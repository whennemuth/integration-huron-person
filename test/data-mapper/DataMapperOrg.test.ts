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

// Helper to create a student semester with degree program structure
// Uses degreeProgram.academicOrganization.code for primary (employer/organization)
// Optionally uses degreeProgram.academicGroup.code for secondary (secondaryUnit/additionalUnit)
const createStudentSemester = (
  termCode: string, 
  careerCode: string, 
  orgCode: string,
  isCurrentProgram: 'Y' | 'N' = 'Y',
  academicGroupCode?: string
) => {
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
          academicOrganization: {
            code: orgCode
          },
          ...(academicGroupCode ? {
            academicGroup: {
              code: academicGroupCode
            }
          } : {}),
          academicPlan: []
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
      expect(result).toEqual({ skipReason: 'Non-student with no employee or affiliate info (personId: UNKNOWN)' });
    });

    it('should return empty object when all sources are empty', () => {
      const person = {
        employeeInfo: { positions: [] },
        studentInfo: { studentSemester: [] },
        affiliateInfo: {}
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ skipReason: 'Student-only with no current term enrollment or admission history (personId: UNKNOWN)' });
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
            createStudentSemester('2261', 'UGRD', 'CAS', 'Y')
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' });
    });

    it('should assign multiple student orgs across employer, organization, and secondaryUnit', () => {
      // Create mock orgHrn that maps all codes
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
      
      const person = {
        studentInfo: {
          studentSemester: [
            {
              studentSemesterInfo: {
                academicTerm: { term: { code: '2261' } },
                academicCareer: { code: 'UGRD' },
                degreeProgram: [
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'CAS' }, // Primary
                    academicGroup: { code: 'ENG' }, // Secondary
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'QST' }, // Primary
                    academicGroup: { code: 'SED' }, // Secondary
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary codes sorted: CAS, QST -> employer = CAS (first)
      // Secondary codes sorted and mapped: ENG, SED -> secondaryUnit = ENG, additionalUnit = SED
      expect(result).toEqual({ 
        employer: 'CAS',
        organization: 'CAS',
        secondaryUnit: 'ENG',
        additionalUnit: 'SED'
      });
    });

    it('should handle affiliate info with organizationalUnit', () => {
      const person = {
        affiliateInfo: {
          organizationalUnit: { code: 'AFF123' }
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'AFFILIATE', organization: 'AFFILIATE' });
    });

    it('should handle affiliate info with department', () => {
      const person = {
        affiliateInfo: {
          department: { code: 'DEPT456' }
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'AFFILIATE', organization: 'AFFILIATE' });
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
            createStudentSemester('2261', 'UGRD', 'CAS', 'Y')
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
      // Student-only with no current term (no term/career codes in semester) should return skipReason
      expect(result).toEqual({ skipReason: 'Student-only with no current term enrollment (personId: UNKNOWN)' });
    });

    it('should handle undefined sources', () => {
      const person = {
        employeeInfo: undefined,
        studentInfo: undefined,
        affiliateInfo: undefined
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ skipReason: 'Non-student with no employee or affiliate info (personId: UNKNOWN)' });
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
            createStudentSemester('2261', 'UGRD', 'CAS', 'Y'), // Current semester (matches mockCurrentTerms)
            createStudentSemester('2251', 'UGRD', 'ENG', 'Y')  // Past semester (not in mockCurrentTerms)
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
            createStudentSemester('2261', 'UGRD', 'CAS', 'Y'),  // Matches current term
            createStudentSemester('2261', 'LAW', 'LAW', 'Y')   // Same term but different career (not in mockCurrentTerms)
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms });
      const result = mapper.getOrgs();
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' }); // Only semester matching both term AND career
    });

    it('should handle multiple current semesters with different careers', () => {
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
      const person = {
        studentInfo: {
          studentSemester: [
            createStudentSemester('2261', 'UGRD', 'CAS', 'Y', 'CAS'),  // Current UGRD with academicGroup
            createStudentSemester('2261', 'GRAD', 'MET', 'Y', 'MET')   // Current GRAD with academicGroup
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary: CAS, MET -> employer = CAS
      // Secondary: CAS, MET (both mapped) -> skip CAS (duplicate), secondaryUnit = MET
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'MET' });
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
      // Student-only with no current term enrollment should return skipReason
      expect(result).toEqual({ skipReason: 'Student-only with no current term enrollment (personId: UNKNOWN)' });
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
      // Student-only with no current term enrollment should return skipReason
      expect(result).toEqual({ skipReason: 'Student-only with no current term enrollment (personId: UNKNOWN)' });
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
      // Student-only with no current term enrollment should return skipReason
      expect(result).toEqual({ skipReason: 'Student-only with no current term enrollment (personId: UNKNOWN)' });
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
      // Student-only with no current term enrollment should return skipReason
      expect(result).toEqual({ skipReason: 'Student-only with no current term enrollment (personId: UNKNOWN)' });
    });

    it('should handle student with multiple degree programs in current semester', () => {
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
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
                    academicOrganization: { code: 'CAS' },
                    academicGroup: { code: 'CAS' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'ENG' },
                    academicGroup: { code: 'ENG' },
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary: CAS, ENG -> employer = CAS
      // Secondary: CAS, ENG (both mapped) -> skip CAS (duplicate), secondaryUnit = ENG
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'ENG' });
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
                    academicOrganization: { code: 'CAS' },
                    academicGroup: { code: 'CAS' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'N',
                    academicOrganization: { code: 'ENG' },
                    academicGroup: { code: 'ENG' },
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
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
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
                    academicOrganization: { code: 'ENG' },
                    academicGroup: { code: 'QST' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'CAS' },
                    academicGroup: { code: 'MET' },
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary: CAS, ENG (sorted) -> employer = CAS
      // Secondary: MET, QST (sorted, both mapped) -> secondaryUnit = MET, additionalUnit = QST
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'MET', additionalUnit: 'QST' });
    });

    it('should extract organizations from degreeProgram level', () => {
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
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
                    academicOrganization: { code: 'CAS' },
                    academicGroup: { code: 'ENG' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'QST' },
                    academicGroup: { code: 'MET' },
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary: CAS, QST -> employer = CAS
      // Secondary: ENG, MET (both mapped) -> secondaryUnit = ENG, additionalUnit = MET
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS', secondaryUnit: 'ENG', additionalUnit: 'MET' });
    });

    it('should deduplicate organization codes from multiple degree programs', () => {
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
                    academicOrganization: { code: 'CAS' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'ENG' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'CAS' }, // Duplicate
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
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' }); // Deduplicated, no secondaryUnit
    });

    it('should sort organizations alphabetically', () => {
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
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
                    academicOrganization: { code: 'QST' }, // 3rd alphabetically
                    academicGroup: { code: 'MET' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'CAS' }, // 1st alphabetically
                    academicGroup: { code: 'CAS' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'ENG' }, // 2nd alphabetically
                    academicGroup: { code: 'QST' },
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary: CAS, ENG, QST (sorted) -> employer = CAS
      // Secondary: CAS, MET, QST (sorted, all mapped) -> secondaryUnit = MET (skip CAS duplicate), additionalUnit = QST
      expect(result).toEqual({
        employer: 'CAS',
        organization: 'CAS',
        secondaryUnit: 'MET',
        additionalUnit: 'QST'
      });
    });

    it('should skip secondary codes that duplicate employer/organization', () => {
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
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
                    academicOrganization: { code: 'CDS' }, // Primary
                    academicGroup: { code: 'CDS' }, // Secondary but duplicates primary
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // employer = CDS, secondaryUnit should be omitted (duplicate)
      expect(result).toEqual({
        employer: 'CDS',
        organization: 'CDS'
        // No secondaryUnit because CDS would duplicate employer
      });
    });

    it('should skip secondary codes that duplicate and use next available', () => {
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
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
                    academicOrganization: { code: 'CDS' },
                    academicGroup: { code: 'CDS' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'ENG' },
                    academicGroup: { code: 'MET' },
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary: CDS, ENG -> employer = CDS
      // Secondary: CDS, MET -> skip CDS (duplicate), use MET for secondaryUnit
      expect(result).toEqual({
        employer: 'CDS',
        organization: 'CDS',
        secondaryUnit: 'MET'
        // No additionalUnit because only one non-duplicate secondary code
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

    it('should combine orgs from multiple current programs', () => {
      const mockOrgHrn = (sourceOrgId: string) => `hrn:hrs:orgs:${sourceOrgId}`;
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
                    academicOrganization: { code: 'ENG' },
                    academicGroup: { code: 'CAS' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'QST' },
                    academicGroup: { code: 'ENG' },
                    academicPlan: []
                  },
                  {
                    isCurrentAcademicProgram: 'Y',
                    academicOrganization: { code: 'CAS' },
                    academicGroup: { code: 'QST' },
                    academicPlan: []
                  }
                ]
              }
            }
          ]
        }
      };
      const mapper = OrgMapper({ person, currentTerms: mockCurrentTerms, orgHrn: mockOrgHrn });
      const result = mapper.getOrgs();
      // Primary: CAS, ENG, QST (sorted) -> employer = CAS
      // Secondary: CAS, ENG, QST (sorted, all mapped) -> skip CAS (duplicate), secondaryUnit = ENG, additionalUnit = QST
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
                    academicOrganization: { code: 'CAS' },
                    academicPlan: []
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
                    academicOrganization: { code: 'ENG' },
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
      expect(result).toEqual({ employer: 'CAS', organization: 'CAS' }); // Only current semester with current program
    });
  });
});