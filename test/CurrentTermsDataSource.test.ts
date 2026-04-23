import { BuCdmCurrentTermsDataSource, Term } from '../src/data-source/CurrentTermsDataSource';
import { Config } from '../src/config/Config';
import { ApiClientForApiKey } from '../src/data-source/ApiClientForApiKey';

// Mock the dependencies
jest.mock('../src/data-source/ApiClientForApiKey');

describe('BuCdmCurrentTermsDataSource', () => {
  let dataSource: BuCdmCurrentTermsDataSource;
  let mockApiClient: jest.Mocked<ApiClientForApiKey>;

  beforeAll(() => {
    // Create a mock config
    const mockConfig: Config = {
    executionMode: 'terms',
      dataSource: {
        terms: {
          endpointConfig: {
            baseUrl: 'https://test-api.example.com',
            apiKey: 'test-api-key',
            timeout: 30000
          },
          fetchPath: '/api/terms/current'
        },
        idpName: 'test-idp'
      },
      integration: {
        clientId: 'test-client',
        batchSize: 100,
        timeout: 30000
      },
      dataTarget: {} as any,
      storage: {} as any
    };

    dataSource = new BuCdmCurrentTermsDataSource({ config: mockConfig });

    // Create mocks
    mockApiClient = new ApiClientForApiKey({} as any) as jest.Mocked<ApiClientForApiKey>;

    // Replace the private apiClient with our mock
    (dataSource as any).apiClient = mockApiClient;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchRaw', () => {
    it('should return array from direct array response', async () => {
      const mockTermsData: Term[] = [
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'GRAD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        },
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'UGRD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        }
      ];

      mockApiClient.get.mockResolvedValue({
        data: mockTermsData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await dataSource.fetchRaw();

      expect(result).toEqual(mockTermsData);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('should extract data from nested data property', async () => {
      const mockTermsData: Term[] = [
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'GRAD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        },
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'UGRD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        }
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTermsData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await dataSource.fetchRaw();

      expect(result).toEqual(mockTermsData);
      expect(result).toHaveLength(2);
    });

    it('should extract data from nested items property', async () => {
      const mockTermsData: Term[] = [
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'GRAD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        },
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'UGRD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        }
      ];

      mockApiClient.get.mockResolvedValue({
        data: { items: mockTermsData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await dataSource.fetchRaw();

      expect(result).toEqual(mockTermsData);
      expect(result).toHaveLength(2);
    });

    it('should extract data from nested terms property', async () => {
      const mockTermsData: Term[] = [
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'GRAD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        },
        {
          term: '2261',
          termDescription: 'Spring 2026',
          academicCareer: 'UGRD',
          termBeginDate: '20260120',
          termEndDate: '20260508',
          currentInd: 'Y'
        }
      ];

      mockApiClient.get.mockResolvedValue({
        data: { terms: mockTermsData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await dataSource.fetchRaw();

      expect(result).toEqual(mockTermsData);
      expect(result).toHaveLength(2);
    });

    it('should wrap single object in array', async () => {
      const mockTermData: Term = {
        term: '2261',
        termDescription: 'Spring 2026',
        academicCareer: 'GRAD',
        termBeginDate: '20260120',
        termEndDate: '20260508',
        currentInd: 'Y'
      };

      mockApiClient.get.mockResolvedValue({
        data: { term: mockTermData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await dataSource.fetchRaw();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ term: mockTermData });
    });

    it('should handle API error with non-200 status', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { error: 'Not Found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {}
      } as any);

      await expect(dataSource.fetchRaw()).rejects.toThrow(
        'Failed to fetch current terms: HTTP 404 Not Found'
      );
    });

    it('should handle API call failure gracefully', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(dataSource.fetchRaw()).rejects.toThrow(
        'Failed to fetch data from Boston University CDM Current Terms Data Source'
      );
    });

    it('should call API with correct fetch path', async () => {
      const mockTermsData: Term[] = [{
        term: '2261',
        termDescription: 'Spring 2026',
        academicCareer: 'GRAD',
        termBeginDate: '20260120',
        termEndDate: '20260508',
        currentInd: 'Y'
      }];

      mockApiClient.get.mockResolvedValue({
        data: mockTermsData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await dataSource.fetchRaw();

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.any(String)
        })
      );
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });
  });
});
