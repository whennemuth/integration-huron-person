import { TitleMapper } from '../../src/data-mapper/DataMapperTitle';

describe('TitleMapper', () => {
  describe('getTitle', () => {
    it('should return undefined when no person info is present', () => {
      const person = {};
      const mapper = TitleMapper(person);
      expect(mapper.getTitle()).toBeUndefined();
    });

    it('should return undefined when person has unrelated properties', () => {
      const person = {
        randomInfo: { foo: 'bar' }
      };
      const mapper = TitleMapper(person);
      expect(mapper.getTitle()).toBeUndefined();
    });

    describe('Employee titles', () => {
      it('should return employee position description', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: 'Professor'
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Professor');
      });

      it('should trim whitespace from employee position description', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: '  Director  '
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Director');
      });

      it('should return first non-empty position description', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: ''
                    }
                  }
                }
              },
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: 'Manager'
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Manager');
      });

      it('should return undefined when employee positions have no description or shortDescription', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {}
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined when employee positions array is empty', () => {
        const person = {
          employeeInfo: {
            positions: []
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should handle null position description', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: null
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should use shortDescription when description is empty', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: '',
                      shortDescription: 'Analyst'
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Analyst');
      });

      it('should use shortDescription when description is null', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: null,
                      shortDescription: 'Coordinator'
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Coordinator');
      });

      it('should prefer description over shortDescription when both present', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: 'Senior Engineer',
                      shortDescription: 'Engineer'
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Senior Engineer');
      });

      it('should truncate employee position description to 255 characters', () => {
        const longTitle = 'A'.repeat(300);
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: longTitle
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        const result = mapper.getTitle();
        expect(result.length).toBe(255);
        expect(result).toBe('A'.repeat(255));
      });

      it('should truncate employee shortDescription to 255 characters', () => {
        const longShortDesc = 'B'.repeat(300);
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: '',
                      shortDescription: longShortDesc
                    }
                  }
                }
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        const result = mapper.getTitle();
        expect(result.length).toBe(255);
        expect(result).toBe('B'.repeat(255));
      });
    });

    describe('Student titles', () => {
      it('should return fixed value "Student" for students', () => {
        const person = {
          studentInfo: { 
            studentId: '12345' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Student');
      });

      it('should return undefined if studentInfo has only empty properties', () => {
        const person = {
          studentInfo: {}
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined if studentInfo has only null properties', () => {
        const person = {
          studentInfo: {
            studentId: null,
            enrollments: null
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined if studentInfo has only undefined properties', () => {
        const person = {
          studentInfo: {
            studentId: undefined,
            enrollments: undefined
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined if studentInfo has only empty strings', () => {
        const person = {
          studentInfo: {
            studentId: '',
            major: ''
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined if studentInfo has only empty arrays', () => {
        const person = {
          studentInfo: {
            enrollments: []
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return "Student" if studentInfo has at least one non-empty property', () => {
        const person = {
          studentInfo: {
            studentId: '',
            major: 'Computer Science'
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Student');
      });
    });

    describe('Affiliate titles', () => {
      it('should return fixed value "University Affiliate" for affiliates', () => {
        const person = {
          affiliateInfo: { 
            affiliateId: 'A123' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('University Affiliate');
      });

      it('should return undefined if affiliateInfo has only empty properties', () => {
        const person = {
          affiliateInfo: {}
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined if affiliateInfo has only null properties', () => {
        const person = {
          affiliateInfo: {
            affiliateId: null,
            organization: null
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined if affiliateInfo has only undefined properties', () => {
        const person = {
          affiliateInfo: {
            affiliateId: undefined,
            organization: undefined
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined if affiliateInfo has only empty strings', () => {
        const person = {
          affiliateInfo: {
            affiliateId: '',
            organization: ''
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return "University Affiliate" if affiliateInfo has at least one non-empty property', () => {
        const person = {
          affiliateInfo: {
            affiliateId: '',
            organization: 'Research Lab'
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('University Affiliate');
      });
    });

    describe('Priority handling', () => {
      it('should prefer employee title over student title', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: 'Manager'
                    }
                  }
                }
              }
            ]
          },
          studentInfo: { 
            studentId: '12345' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Manager');
      });

      it('should prefer employee title over affiliate title', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: {
                  BasicData: {
                    position: {
                      description: 'Engineer'
                    }
                  }
                }
              }
            ]
          },
          affiliateInfo: { 
            affiliateId: 'A123' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Engineer');
      });

      it('should prefer student title over affiliate title when no employee title', () => {
        const person = {
          studentInfo: { 
            studentId: '12345' 
          },
          affiliateInfo: { 
            affiliateId: 'A123' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Student');
      });

      it('should fall back to student title when employee positions are empty', () => {
        const person = {
          employeeInfo: {
            positions: []
          },
          studentInfo: { 
            studentId: '12345' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Student');
      });

      it('should fall back to affiliate title when employee positions are empty and no student', () => {
        const person = {
          employeeInfo: {
            positions: []
          },
          affiliateInfo: { 
            affiliateId: 'A123' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('University Affiliate');
      });

      it('should return undefined when employee has no title and studentInfo has only empty properties', () => {
        const person = {
          employeeInfo: {
            positions: []
          },
          studentInfo: {
            studentId: '',
            major: null
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return undefined when employee has no title and both student and affiliate have only empty properties', () => {
        const person = {
          employeeInfo: {
            positions: []
          },
          studentInfo: {
            studentId: ''
          },
          affiliateInfo: {
            affiliateId: null
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should return "Student" when employee has no title, studentInfo has empty properties but affiliateInfo has values', () => {
        const person = {
          employeeInfo: {
            positions: []
          },
          studentInfo: {
            studentId: ''
          },
          affiliateInfo: {
            affiliateId: 'A123'
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('University Affiliate');
      });

      it('should return "University Affiliate" when both student and affiliate have values', () => {
        const person = {
          studentInfo: {
            studentId: ''
          },
          affiliateInfo: {
            affiliateId: 'A123'
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('University Affiliate');
      });
    });

    describe('Edge cases', () => {
      it('should handle null employeeInfo', () => {
        const person = {
          employeeInfo: null,
          studentInfo: { 
            studentId: '12345' 
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBe('Student');
      });

      it('should handle undefined values', () => {
        const person = {
          employeeInfo: undefined,
          studentInfo: undefined,
          affiliateInfo: undefined
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });

      it('should handle deeply nested null values in employee info', () => {
        const person = {
          employeeInfo: {
            positions: [
              {
                positionInfo: null
              }
            ]
          }
        };
        const mapper = TitleMapper(person);
        expect(mapper.getTitle()).toBeUndefined();
      });
    });
  });
});
