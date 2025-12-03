import axios, { AxiosResponse } from 'axios';
import { PassThrough } from 'stream';
import { ApiClientForJWT, EndpointConfigForJWT } from '../src/data-target/ApiClientForJWT';
import { AxiosResponseStreamFilter } from '../src/stream/AxiosResponseStreamFilter';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiClientForJWT', () => {
  let apiClient: ApiClientForJWT;
  let mockAxiosInstance: any;
  
  const mockConfig: EndpointConfigForJWT = {
    baseUrl: 'https://test-api.example.com',
    authMethod: 'basic',
    loginSvcPath: 'https://example.com/auth/token',
    username: 'testuser',
    password: 'testpass',
    timeout: 5000
  };

  beforeEach(() => {
    // Reset all mocks
    // jest.clearAllMocks();
    
    // Mock axios instance with working interceptors
    let requestInterceptor: any = null;
    mockAxiosInstance = {
      get: jest.fn().mockImplementation(async (url, config = {}) => {
        if (requestInterceptor) {
          config = await requestInterceptor({ ...config, headers: { ...config.headers } });
        }
        return { data: {}, status: 200, headers: {}, config };
      }),
      post: jest.fn().mockImplementation(async (url, data, config = {}) => {
        if (requestInterceptor) {
          config = await requestInterceptor({ ...config, headers: { ...config.headers } });
        }
        return { data: {}, status: 200, headers: {}, config };
      }),
      put: jest.fn().mockImplementation(async (url, data, config = {}) => {
        if (requestInterceptor) {
          config = await requestInterceptor({ ...config, headers: { ...config.headers } });
        }
        return { data: {}, status: 200, headers: {}, config };
      }),
      delete: jest.fn().mockImplementation(async (url, config = {}) => {
        if (requestInterceptor) {
          config = await requestInterceptor({ ...config, headers: { ...config.headers } });
        }
        return { data: {}, status: 200, headers: {}, config };
      }),
      interceptors: {
        request: { 
          use: jest.fn().mockImplementation((fn) => {
            requestInterceptor = fn;
          })
        },
        response: { use: jest.fn() }
      }
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.post = jest.fn();
    
    apiClient = new ApiClientForJWT(mockConfig);
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockConfig.baseUrl,
        timeout: mockConfig.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });

    it('should use default timeout when not provided', () => {
      const configWithoutTimeout = { ...mockConfig };
      delete configWithoutTimeout.timeout;
      
       new ApiClientForJWT(configWithoutTimeout);      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockConfig.baseUrl,
        timeout: 30000, // default timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });
  });

  describe('authentication', () => {
    describe('basic auth method', () => {
      const basicConfig: EndpointConfigForJWT = {
        baseUrl: 'https://test-api.example.com',
        authMethod: 'basic',
        loginSvcPath: 'https://example.com/auth/token',
        username: 'testuser',
        password: 'testpass',
        timeout: 5000
      };

      beforeEach(() => {
        // Mock successful token response for basic auth
        const mockTokenResponse: AxiosResponse = {
          data: { access_token: 'mock-jwt-token' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any
        };
        mockedAxios.post.mockResolvedValue(mockTokenResponse);
      });

      it('should authenticate using basic auth method', async () => {
        const client = new ApiClientForJWT(basicConfig);
        
        // Trigger authentication directly
        await (client as any).ensureValidToken();
        
        // Verify that authentication occurred and token was set
        expect(client.getCurrentToken()).toBe('mock-jwt-token');
      });
    });

    describe('external token method', () => {
      const externalConfig: EndpointConfigForJWT = {
        baseUrl: 'https://test-api.example.com',
        authMethod: 'externalToken',
        externalToken: 'mock-external-token',
        userId: 'test.user',
        timeout: 5000
      };

      beforeEach(() => {
        // Mock successful JWT response for external token
        const mockTokenResponse: AxiosResponse = {
          data: 'mock-jwt-token-from-hrs',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any
        };
        mockedAxios.get.mockResolvedValue(mockTokenResponse);
      });

      it('should authenticate using external token method', async () => {
        const client = new ApiClientForJWT(externalConfig);
        
        // Trigger authentication directly
        await (client as any).ensureValidToken();
        
        // Verify that authentication occurred and token was set
        expect(client.getCurrentToken()).toBe('mock-jwt-token-from-hrs');
      });

      it('should set correct token expiry for external tokens (60 minutes)', async () => {
        const client = new ApiClientForJWT(externalConfig);
        
        // Trigger authentication
        await (client as any).ensureValidToken();
        
        // Verify that authentication occurred and token was set
        expect(client.getCurrentToken()).toBe('mock-jwt-token-from-hrs');
      });
    });
  });

  describe('HTTP methods', () => {
    const testConfig: EndpointConfigForJWT = {
      baseUrl: 'https://test-api.example.com',
      authMethod: 'basic',
      loginSvcPath: 'https://example.com/auth/token',
      username: 'testuser',
      password: 'testpass',
      timeout: 5000
    };

    beforeEach(() => {
      // Mock successful token response for basic auth
      const mockTokenResponse: AxiosResponse = {
        data: { access_token: 'mock-jwt-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockedAxios.post.mockResolvedValue(mockTokenResponse);
      
      // Create client with test config
      apiClient = new ApiClientForJWT(testConfig);
    });

    it('should handle GET requests', async () => {
      // Create mock response with stream data
      const mockStream = new PassThrough();
      const mockData = { response: [{ id: 1, name: 'test' }] };
      mockStream.write(JSON.stringify(mockData));
      mockStream.end();
      
      const mockResponse: AxiosResponse = {
        data: mockStream,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      
      // Mock authentication
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-jwt-token' }
      });
      
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await apiClient.get({ url: '/users/1', responseFilter: new AxiosResponseStreamFilter({ fieldsToKeep: ['id'] }) });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/1', { params: undefined, responseType: 'stream' });
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ response: [{ id: 1 }] });
    });

    it('should handle POST requests with data', async () => {
      const mockResponse: AxiosResponse = {
        data: { id: 2, name: 'created' },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any
      };
      
      // Mock authentication
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-jwt-token' }
      });
      
      // Mock actual POST call
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const postData = { name: 'new user' };
      const result = await apiClient.post('/users', postData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/users', postData);
      expect(result).toEqual(mockResponse);
    });

    it('should handle PUT requests', async () => {
      const mockResponse: AxiosResponse = {
        data: { id: 1, name: 'updated' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      
      // Mock authentication
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-jwt-token' }
      });
      
      mockAxiosInstance.put.mockResolvedValue(mockResponse);

      const updateData = { name: 'updated user' };
      const result = await apiClient.put('/users/1', updateData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/users/1', updateData);
      expect(result).toEqual(mockResponse);
    });

    it('should handle DELETE requests', async () => {
      const mockResponse: AxiosResponse = {
        data: { message: 'deleted' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      
      // Mock authentication
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-jwt-token' }
      });
      
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await apiClient.delete('/users/1');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/users/1');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('error handling', () => {
    it('should propagate network errors', async () => {
      const networkError = new Error('Network Error');
      
      // Mock authentication
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-jwt-token' }
      });
      
      mockAxiosInstance.get.mockRejectedValue(networkError);

      await expect(apiClient.get({ url: '/test', responseFilter: new AxiosResponseStreamFilter({ fieldsToKeep: ['id'] }) })).rejects.toThrow('Network Error');
    });

    it('should handle HTTP error responses', async () => {
      const httpError = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'Resource not found' }
        }
      };
      
      // Mock authentication
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'mock-jwt-token' }
      });
      
      mockAxiosInstance.get.mockRejectedValue(httpError);

      await expect(apiClient.get({ url: '/nonexistent', responseFilter: new AxiosResponseStreamFilter({ fieldsToKeep: ['id'] }) })).rejects.toEqual(httpError);
    });
  });
});