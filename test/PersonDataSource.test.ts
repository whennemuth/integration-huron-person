import { Input } from 'integration-core';
import { BuCdmPersonDataSource } from '../src/data-source/PersonDataSource';
import { DataMapper } from '../src/data-mapper/DataMapper';
import { IApiClient } from '../src/ApiClient';
import { Config } from '../src/config/Config';
import { AxiosResponseStreamFilter } from '../src/stream/AxiosResponseStreamFilter';
import { Term } from '../src/data-source/CurrentTermsDataSource';
import { StateRow, StateMappings } from '../src/data-mapper/DataMapperState';
import { CountryRow, CountryMappings } from '../src/data-mapper/DataMapperCountry';

// Mock ApiClient
class MockApiClient implements IApiClient {
  private mockData: any;

  constructor(mockData?: any) {
    this.mockData = mockData;
  }

  async get<T = any>(params: { url: string, params?: any, responseFilter?: any }): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    if (this.mockData) {
      return {
        data: { response: this.mockData } as T,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
    }
    throw new Error('Mock not configured');
  }

  async post<T = any>(url: string, data?: any): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    throw new Error('Method not implemented in mock');
  }

  async put<T = any>(url: string, data?: any): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    throw new Error('Method not implemented in mock');
  }

  async delete<T = any>(url: string): Promise<{ data: T; status: number; statusText: string; headers: {}; config: any; }> {
    throw new Error('Method not implemented in mock');
  }
}

describe('BuCdmPersonDataSource', () => {
  let dataSource: BuCdmPersonDataSource;
  let mockApiClient: MockApiClient;
  let dataMapper: DataMapper;
  
  const mockConfig: Config = {
    dataSource: {
      person: {
        endpointConfig: {
          baseUrl: 'https://datasource-api.example.com',
          apiKey: 'test-api-key'
        },
        fetchPath: '/api/v1/persons'
      },
      people: {
        endpointConfig: {
          baseUrl: 'https://datasource-api.example.com',
          apiKey: 'test-api-key'
        },
        fetchPath: '/api/v1/persons'
      }
    },
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://datatarget-api.example.com',
        authMethod: 'basic',
        loginSvcPath: '/auth/token',
        username: 'dt-user',
        password: 'dt-pass'
      },
      personsPath: '/api/v1/persons/batch',
      organizationsPath: '/api/v1/organizations'
    },
    integration: {
      clientId: 'test-client',
      batchSize: 10,
      timeout: 5000
    },
    storage: {
      type: 'file',
      config: {
        path: './test-data'
      }
    }
  };

  const mockRawPersonData: any[] = [
    {
      personid: 'person-1',
      personBasic: {
        names: [
          {
            nameType: 'PRI',
            firstName: 'John',
            lastName: 'Doe'
          }
        ]
      },
      email: [
        {
          type: 'university',
          address: 'john.doe@example.com'
        }
      ],
      employeeInfo: {
        positions: [
          {
            positionInfo: {
              BasicData: {
                personnelNumber: 'EMP001',
                sapEmpStatus: { description: 'Active' },
                hireDate: '2023-01-15'
              },
              Department: {
                departmentName: 'Engineering'
              }
            }
          }
        ]
      }
    },
    {
      personid: 'person-2',
      personBasic: {
        names: [
          {
            nameType: 'PRI',
            firstName: 'Jane',
            lastName: 'Smith'
          }
        ]
      },
      email: [
        {
          type: 'university',
          address: 'jane.smith@example.com'
        }
      ],
      employeeInfo: {
        positions: [
          {
            positionInfo: {
              BasicData: {
                personnelNumber: 'EMP002',
                sapEmpStatus: { description: 'Active' },
                hireDate: '2023-03-20'
              },
              Department: {
                departmentName: 'Marketing'
              }
            }
          }
        ]
      }
    },
    {
      personid: 'person-3',
      personBasic: {
        names: [
          {
            nameType: 'PRI',
            firstName: 'Bob',
            lastName: 'Johnson'
          }
        ]
      },
      email: [
        {
          type: 'university',
          address: 'bob.johnson@example.com'
        }
      ],
      employeeInfo: {
        positions: [
          {
            positionInfo: {
              BasicData: {
                personnelNumber: 'EMP003',
                sapEmpStatus: { description: 'Inactive' },
                hireDate: '2022-05-10'
              },
              Department: {
                departmentName: 'HR'
              }
            }
          }
        ]
      }
    }
  ];

  // Mock current terms for DataMapper
  const mockCurrentTerms: Term[] = [
    {
      term: '2261',
      termDescription: 'Spring 2026',
      academicCareer: 'GRAD',
      termBeginDate: '20260120',
      termEndDate: '20260508',
      currentInd: 'Y'
    }
  ];

  // Mock state and country mappings for DataMapper
  const mockStateMappings: StateMappings = {
    forwardMap: new Map<string, StateRow>([
      ['MA', { huronCode: 'MA', huronName: 'Massachusetts' }]
    ]),
    reverseMap: new Map<string, string>([
      ['MA', 'MA']
    ])
  };

  const mockCountryMappings: CountryMappings = {
    forwardMap: new Map<string, CountryRow>([
      ['US', { huronCode: 'US', huronName: 'United States' }]
    ]),
    reverseMap: new Map<string, string>([
      ['US', 'US']
    ])
  };

  beforeEach(() => {
    mockApiClient = new MockApiClient(mockRawPersonData);
    const mockResponseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest: ['id'] });
    dataMapper = new DataMapper({ currentTerms: mockCurrentTerms, stateMappings: mockStateMappings, countryMappings: mockCountryMappings });
    dataSource = new BuCdmPersonDataSource({ config: mockConfig, responseFilter: mockResponseFilter });
    // Replace the real ApiClient with our mock
    (dataSource as any).apiClient = mockApiClient;
  });

  describe('constructor', () => {
    it('should create instance with correct name and description', () => {
      expect(dataSource.name).toBe('Boston University CDM Person Data Source');
      expect(dataSource.description).toBe('Fetches single person data from Boston University CDM API endpoint');
    });
  });

  describe('Configuration and Timeout Precedence', () => {
    it('should prioritize endpointConfig timeout over integration timeout', () => {
      const configWithBothTimeouts: Config = {
        dataSource: {
          person: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key',
              timeout: 12000  // Endpoint-specific timeout
            },
            fetchPath: '/api/v1/persons'
          },
          people: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/api/v1/persons'
          }
        },
        dataTarget: {
          endpointConfig: {
            baseUrl: 'https://datatarget-api.example.com',
            authMethod: 'basic',
            loginSvcPath: 'https://auth.example.com/token',
            username: 'test-user',
            password: 'test-pass'
          },
          personsPath: '/api/v1/persons',
          organizationsPath: '/api/v1/organizations'
        },
        integration: {
          clientId: 'test-client-id',
          batchSize: 10,
          timeout: 30000  // General integration timeout
        },
        storage: {
          type: 'file' as const,
          config: { path: '/tmp/test' }
        }
      };

      // Create instance and test that endpoint timeout is prioritized
      const dataSource = new BuCdmPersonDataSource({ config: configWithBothTimeouts, responseFilter: new AxiosResponseStreamFilter({ fieldsOfInterest: ['id'] }) });
      
      // Access the private apiClient to verify the timeout configuration
      const apiClient = (dataSource as any).apiClient;
      const endpointConfig = (apiClient as any).endpointConfig;

      // Verify that endpoint timeout (12000) was used, not integration timeout (30000)
      expect(endpointConfig.timeout).toBe(12000);
    });

    it('should fallback to integration timeout when endpointConfig timeout is undefined', () => {
      const configWithOnlyIntegrationTimeout: Config = {
        dataSource: {
          person: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key'
              // No timeout specified in endpointConfig
            },
            fetchPath: '/api/v1/persons'
          },
          people: {
            endpointConfig: {
              baseUrl: 'https://datasource-api.example.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/api/v1/persons'
          }
        },
        dataTarget: {
          endpointConfig: {
            baseUrl: 'https://datatarget-api.example.com',
            authMethod: 'basic',
            loginSvcPath: 'https://auth.example.com/token',
            username: 'test-user',
            password: 'test-pass'
          },
          personsPath: '/api/v1/persons',
          organizationsPath: '/api/v1/organizations'
        },
        integration: {
          clientId: 'test-client-id',
          batchSize: 10,
          timeout: 20000  // General integration timeout
        },
        storage: {
          type: 'file' as const,
          config: { path: '/tmp/test' }
        }
      };

      // Create instance and test that integration timeout is used as fallback
      const dataSource = new BuCdmPersonDataSource({ config: configWithOnlyIntegrationTimeout, responseFilter: new AxiosResponseStreamFilter({ fieldsOfInterest: ['id'] }) });
      
      // Access the private apiClient to verify the timeout configuration
      const apiClient = (dataSource as any).apiClient;
      const endpointConfig = (apiClient as any).endpointConfig;

      // Verify that integration timeout (20000) was used as fallback
      expect(endpointConfig.timeout).toBe(20000);
    });
  });

  describe('fetchRaw', () => {
    it('should fetch raw person data successfully', async () => {
      const result = await dataSource.fetchRaw();

      expect(result).toEqual(mockRawPersonData);
      expect(result).toHaveLength(3);
    });

    it('should handle empty response', async () => {
      mockApiClient = new MockApiClient([]);
      (dataSource as any).apiClient = mockApiClient;

      const result = await dataSource.fetchRaw();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should propagate API errors', async () => {
      const errorMessage = 'API Error: Unauthorized';
      mockApiClient = new MockApiClient();
      (mockApiClient as any).get = jest.fn().mockRejectedValue(new Error(errorMessage));
      (dataSource as any).apiClient = mockApiClient;

      await expect(dataSource.fetchRaw()).rejects.toThrow(errorMessage);
    });
  });

  describe('DataMapper integration', () => {
    it('should convert raw data to Input format correctly via DataMapper', () => {
      const result = dataMapper.getMappedData({ rawData: mockRawPersonData });

      expect(result.fieldDefinitions).toBeDefined();
      expect(result.fieldSets).toHaveLength(3);
      
      // Check field definitions are properly set
      const idField = result.fieldDefinitions.find((f: any) => f.name === 'id');
      expect(idField?.isPrimaryKey).toBe(true);
      expect(idField?.required).toBe(true);
      
      // Check first person field set
      expect(result.fieldSets[0]).toBeDefined();
    });

    it('should handle empty raw data', () => {
      const result = dataMapper.getMappedData({ rawData: [] });

      expect(result.fieldSets).toEqual([]);
      expect(result.fieldDefinitions).toBeDefined();
    });

    it('should handle missing optional fields gracefully', () => {
      const incompleteData: any[] = [{
        personid: 'person-incomplete',
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              firstName: 'Incomplete',
              lastName: 'Person'
            }
          ]
        },
        email: [
          {
            type: 'university',
            address: 'incomplete@example.com'
          }
        ],
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  personnelNumber: '',
                  sapEmpStatus: { description: 'Active' },
                  hireDate: ''
                },
                Department: {
                  departmentName: ''
                }
              }
            }
          ]
        }
      }];

      const result = dataMapper.getMappedData({ rawData: incompleteData });

      expect(result.fieldSets).toHaveLength(1);
      expect(result.fieldDefinitions).toBeDefined();
    });
  });



  describe('data validation', () => {
    it('should validate required fields are present', () => {
      const invalidData: any[] = [{
        // Missing required personid field and other structure
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              firstName: 'Invalid',
              lastName: 'Person'
            }
          ]
        },
        email: [
          {
            type: 'university',
            address: 'invalid@example.com'
          }
        ]
      }];

      // This should either throw an error or handle gracefully
      // depending on your validation strategy
      const result = dataMapper.getMappedData({ rawData: invalidData });
      
      expect(result.fieldSets).toHaveLength(1);
      expect(result.fieldDefinitions).toBeDefined();
    });

    it('should handle malformed date formats', () => {
      const malformedData: any[] = [{
        personid: 'person-bad-date',
        personBasic: {
          names: [
            {
              nameType: 'PRI',
              firstName: 'Bad',
              lastName: 'Date'
            }
          ]
        },
        email: [
          {
            type: 'university',
            address: 'bad.date@example.com'
          }
        ],
        employeeInfo: {
          positions: [
            {
              positionInfo: {
                BasicData: {
                  personnelNumber: 'EMP999',
                  sapEmpStatus: { description: 'Active' },
                  hireDate: 'invalid-date-format'
                },
                Department: {
                  departmentName: 'Test'
                }
              }
            }
          ]
        }
      }];

      const result = dataMapper.getMappedData({ rawData: malformedData });

      expect(result.fieldSets).toHaveLength(1);
      expect(result.fieldDefinitions).toBeDefined();
    });
  });
});