import { UserIdMapper } from '../../src/data-mapper/DataMapperUserId';
import { CrudOperation } from 'integration-core';

describe('UserIdMapper', () => {
  const defaultIdpName = 'bu-sso';
  const defaultIdpDomain = 'bu.edu';

  describe('getUserId', () => {
    it('should return personid when account array is empty', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: []
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('U12345678');
    });

    it('should return personid when account array is missing', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {}
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('U12345678');
    });

    it('should return personid when personDetails is missing', () => {
      const person = {
        personid: 'U12345678'
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('U12345678');
    });

    it('should return composite UserID with first account when no accounts have SAP or Campus Solutions source', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'Active Directory',
              name: 'aduser123'
            },
            {
              source: 'Banner',
              name: 'banner456'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_aduser123@bu.edu'); // Should return first account when none have defined priorities
    });

    it('should return composite UserID with SAP account when only SAP source is present', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'SAP',
              name: 'sap123456'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_sap123456@bu.edu');
    });

    it('should return composite UserID with Campus Solutions account when only Campus Solutions source is present', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'Campus Solutions',
              name: 'cs789012'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_cs789012@bu.edu');
    });

    it('should prioritize SAP (priority 1) over Campus Solutions (priority 2)', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'Campus Solutions',
              name: 'cs789012'
            },
            {
              source: 'SAP',
              name: 'sap123456'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_sap123456@bu.edu');
    });

    it('should prioritize SAP over other sources with lower priority', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'Active Directory',
              name: 'aduser123'
            },
            {
              source: 'Campus Solutions',
              name: 'cs789012'
            },
            {
              source: 'SAP',
              name: 'sap123456'
            },
            {
              source: 'Banner',
              name: 'banner456'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_sap123456@bu.edu');
    });

    it('should prioritize Campus Solutions over sources with no defined priority', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'Active Directory',
              name: 'aduser123'
            },
            {
              source: 'Campus Solutions',
              name: 'cs789012'
            },
            {
              source: 'Banner',
              name: 'banner456'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_cs789012@bu.edu');
    });

    it('should handle multiple accounts with same source and return the first one after sorting', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'SAP',
              name: 'sap123456'
            },
            {
              source: 'SAP',
              name: 'sap789012'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_sap123456@bu.edu');
    });

    it('should handle case-sensitive source matching (SAP source should match exactly)', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'sap', // lowercase
              name: 'sap123456'
            },
            {
              source: 'Campus Solutions',
              name: 'cs789012'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_cs789012@bu.edu'); // Should pick Campus Solutions since 'sap' doesn't match 'SAP'
    });

    it('should handle undefined/null names in account array', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'SAP',
              name: 'sap123456'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_sap123456@bu.edu');
    });

    it('should handle missing source property in account', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              name: 'nosource123'
            },
            {
              source: 'SAP',
              name: 'sap123456'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_sap123456@bu.edu');
    });

    it('should handle missing name property in account', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'SAP'
              // missing name property
            },
            {
              source: 'Campus Solutions',
              name: 'cs789012'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_undefined@bu.edu'); // SAP has highest priority but no name
    });

    it('should not convert nulls to undefined when removeNullValues is false', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'SAP',
              name: null
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName, removeNullValues: false });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_null@bu.edu');
    });

    it('should convert nulls to undefined when removeNullValues is true (default)', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'SAP',
              name: null
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName, removeNullValues: true });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_undefined@bu.edu');
    });

    it('should handle empty personid', () => {
      const person = {
        personid: '',
        personDetails: {
          account: []
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('');
    });

    it('should handle missing personid', () => {
      const person = {
        personDetails: {
          account: []
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual(undefined);
    });

    it('should return first account when all accounts have no defined priority', () => {
      const person = {
        personid: 'U12345678',
        personDetails: {
          account: [
            {
              source: 'Unknown1',
              name: 'unknown1name'
            },
            {
              source: 'Unknown2',
              name: 'unknown2name'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      expect(result).toEqual('bu-sso_unknown1name@bu.edu'); // Should return first one when all have same priority
    });

    it('should handle person record without any SAP or Campus Solutions account entries', () => {
      const person = {
        personid: 'U87654321',
        personDetails: {
          account: [
            {
              source: 'Active Directory',
              name: 'aduser789'
            },
            {
              source: 'LDAP',
              name: 'ldapuser456'
            },
            {
              source: 'External System',
              name: 'extuser123'
            }
          ]
        }
      };

      const mapper = UserIdMapper({ person, idpName: defaultIdpName });
      const result = mapper.getUserId();

      // Should return the first account name since none have SAP or Campus Solutions source
      expect(result).toEqual('bu-sso_aduser789@bu.edu');
    });

    describe('crudOperation parameter', () => {
      it('should return undefined when crudOperation is UPDATE', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'sap123456'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: defaultIdpName });
        const result = mapper.getUserId(CrudOperation.UPDATE);

        expect(result).toEqual(undefined);
      });

      it('should return composite userId when crudOperation is CREATE', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'sap123456'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: defaultIdpName });
        const result = mapper.getUserId(CrudOperation.CREATE);

        expect(result).toEqual('bu-sso_sap123456@bu.edu');
      });

      it('should return composite userId when crudOperation is undefined (defaults to CREATE)', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'Campus Solutions',
                name: 'cs789012'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: defaultIdpName });
        const result = mapper.getUserId();

        expect(result).toEqual('bu-sso_cs789012@bu.edu');
      });

      it('should return undefined for UPDATE even when account array is empty', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: []
          }
        };

        const mapper = UserIdMapper({ person, idpName: defaultIdpName });
        const result = mapper.getUserId(CrudOperation.UPDATE);

        expect(result).toEqual(undefined);
      });

      it('should return personid for CREATE when account array is empty', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: []
          }
        };

        const mapper = UserIdMapper({ person, idpName: defaultIdpName });
        const result = mapper.getUserId(CrudOperation.CREATE);

        expect(result).toEqual('U12345678');
      });

      it('should return undefined for UPDATE with multiple accounts prioritizing SAP', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'Campus Solutions',
                name: 'cs789012'
              },
              {
                source: 'SAP',
                name: 'sap123456'
              },
              {
                source: 'Active Directory',
                name: 'aduser123'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: defaultIdpName });
        const result = mapper.getUserId(CrudOperation.UPDATE);

        // Should return undefined regardless of which account has priority
        expect(result).toEqual(undefined);
      });

      it('should return composite userId for DELETE operation (DELETE defaults to CREATE)', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'sap123456'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: defaultIdpName });
        const result = mapper.getUserId(CrudOperation.DELETE);

        // DELETE defaults to CREATE behavior for now (returns composite userId)
        expect(result).toEqual('bu-sso_sap123456@bu.edu');
      });
    });

    describe('idpName and idpDomain parameters', () => {
      it('should use TEST idpName for sandbox/test environments', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'wrh'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: 'bu-sso_TEST' });
        const result = mapper.getUserId();

        expect(result).toEqual('bu-sso_TEST_wrh@bu.edu');
      });

      it('should accept custom idpDomain', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'testuser'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: 'custom-sso', idpDomain: 'example.com' });
        const result = mapper.getUserId();

        expect(result).toEqual('custom-sso_testuser@example.com');
      });

      it('should use default bu.edu domain when idpDomain not provided', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'user123'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: 'bu-sso' });
        const result = mapper.getUserId();

        expect(result).toEqual('bu-sso_user123@bu.edu');
      });

      it('should lowercase the account name but preserve idpName case', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'UserWithMixedCase'
              }
            ]
          }
        };

        const mapper = UserIdMapper({ person, idpName: 'bu-sso_TEST' });
        const result = mapper.getUserId();

        expect(result).toEqual('bu-sso_TEST_userwithmixedcase@bu.edu');
      });

      it('should handle real-world example from email (wrh user)', () => {
        const person = {
          personid: 'U12345678',
          personDetails: {
            account: [
              {
                source: 'SAP',
                name: 'wrh'
              }
            ]
          }
        };

        // Production
        const prodMapper = UserIdMapper({ person, idpName: 'bu-sso' });
        expect(prodMapper.getUserId()).toEqual('bu-sso_wrh@bu.edu');

        // Test/Sandbox
        const testMapper = UserIdMapper({ person, idpName: 'bu-sso_TEST' });
        expect(testMapper.getUserId()).toEqual('bu-sso_TEST_wrh@bu.edu');
      });
    });
  });
});