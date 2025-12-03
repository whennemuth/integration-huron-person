import axios, { AxiosResponse } from 'axios';
import { PassThrough } from 'stream';
import { ApiClientForApiKey, EndpointConfigForApiKey } from '../src/data-source/ApiClientForApiKey';
import { AxiosResponseStreamFilter } from '../src/stream/AxiosResponseStreamFilter';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiClientForApiKey', () => {
  let apiClient: ApiClientForApiKey;
  let mockAxiosInstance: any;
  
  const mockConfig: EndpointConfigForApiKey = {
    baseUrl: 'https://test-api.example.com',
    apiKey: 'ae7220cfe721d02feb98c2795c740b28',
    timeout: 5000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    
    apiClient = new ApiClientForApiKey(mockConfig);
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockConfig.baseUrl,
        timeout: mockConfig.timeout,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockConfig.apiKey,
        },
      });
    });

    it('should use default timeout when not provided', () => {
      const configWithoutTimeout: EndpointConfigForApiKey = {
        baseUrl: 'https://test.com',
        apiKey: 'test-key'
      };

      new ApiClientForApiKey(configWithoutTimeout);

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: configWithoutTimeout.baseUrl,
        timeout: 30000, // default timeout
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': configWithoutTimeout.apiKey,
        },
      });
    });

    it('should include x-api-key header in axios configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': mockConfig.apiKey
          })
        })
      );
    });
  });

  describe('HTTP methods', () => {
    const mockResponse: AxiosResponse = {
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
      request: {}
    };

    beforeEach(() => {
      mockAxiosInstance.get.mockResolvedValue(mockResponse);
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      mockAxiosInstance.put.mockResolvedValue(mockResponse);
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);
    });

    it('should handle GET requests', async () => {
      const params = { buid: 'U12345678' };
      const responseFilter = new AxiosResponseStreamFilter({ fieldsToKeep: ['id'] });
      
      // Create mock response with stream data
      const mockStream = new PassThrough();
      const mockData = { response: [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }] };
      mockStream.write(JSON.stringify(mockData));
      mockStream.end();
      
      const streamResponse: AxiosResponse = {
        data: mockStream,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
        request: {}
      };
      
      mockAxiosInstance.get.mockResolvedValue(streamResponse);
      
      const result = await apiClient.get({ url: '/persons', params, responseFilter });
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/persons', { params, responseType: 'stream' });
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ response: [{ id: '1' }, { id: '2' }] });
    });

    it('should handle POST requests with data', async () => {
      const testData = { 
        id: '123',
        name: 'Test Person' 
      };
      
      const result = await apiClient.post('/persons', testData);
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/persons', testData);
      expect(result).toEqual(mockResponse);
    });

    it('should handle PUT requests', async () => {
      const testData = { 
        id: '123',
        name: 'Updated Person' 
      };
      
      const result = await apiClient.put('/persons/123', testData);
      
      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/persons/123', testData);
      expect(result).toEqual(mockResponse);
    });

    it('should handle DELETE requests', async () => {
      const result = await apiClient.delete('/persons/123');
      
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/persons/123');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('error handling', () => {
    it('should propagate network errors', async () => {
      const networkError = new Error('Network Error');
      mockAxiosInstance.get.mockRejectedValue(networkError);

      await expect(apiClient.get({ url: '/persons', responseFilter: new AxiosResponseStreamFilter(mockAxiosInstance) })).rejects.toThrow('Network Error');
    });

    it('should handle HTTP error responses', async () => {
      const httpError = {
        response: {
          status: 401,
          data: { error: 'Invalid API key' }
        }
      };
      mockAxiosInstance.get.mockRejectedValue(httpError);

      await expect(apiClient.get({ url: '/persons', responseFilter: new AxiosResponseStreamFilter(mockAxiosInstance) })).rejects.toEqual(httpError);
    });
  });

  describe('getCurrentApiKey', () => {
    it('should return the current API key', () => {
      const apiKey = apiClient.getCurrentApiKey();
      expect(apiKey).toBe(mockConfig.apiKey);
    });
  });

  describe('API key authentication', () => {
    it('should not require token management like JWT', () => {
      // API key client should not have token-related methods
      expect((apiClient as any).authenticate).toBeUndefined();
      expect((apiClient as any).ensureValidToken).toBeUndefined();
      expect((apiClient as any).getCurrentToken).toBeUndefined();
    });

    it('should include API key in all requests via headers', async () => {
      // The API key should be set once in the constructor and used for all requests
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': mockConfig.apiKey
          })
        })
      );
    });
  });
});