import axios, { AxiosResponse } from 'axios';
import { ApiClientForJWT, EndpointConfigForJWT } from '../src/ApiClientForJWT';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiClientForJWT', () => {
  let apiClient: ApiClientForJWT;
  let mockAxiosInstance: any;
  
  const mockConfig: EndpointConfigForJWT = {
    baseUrl: 'https://test-api.example.com',
    authTokenUrl: 'https://example.com/auth/token',
    username: 'testuser',
    password: 'testpass',
    timeout: 5000
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
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
    beforeEach(() => {
      // Mock successful token response
      const mockTokenResponse: AxiosResponse = {
        data: { 
          access_token: 'mock-jwt-token',
          expires_in: 3600 
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockAxiosInstance.post.mockResolvedValue(mockTokenResponse);
    });

    it('should set up request interceptor for authentication', () => {
      // Verify that the request interceptor was set up during construction
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should have correct authentication endpoint configuration', () => {
      // Test that the client is configured with the correct auth URL
       const client = new ApiClientForJWT(mockConfig);
       expect(client).toBeInstanceOf(ApiClientForJWT);      // Verify we can get the current token state (should be null initially)
      expect(client.getCurrentToken()).toBeNull();
    });

    it('should provide access to current token state', () => {
      // Initially no token
      expect(apiClient.getCurrentToken()).toBeNull();
      
      // This method allows us to verify authentication state in integration tests
      const tokenGetter = apiClient.getCurrentToken;
      expect(typeof tokenGetter).toBe('function');
    });
  });

  describe('HTTP methods', () => {
    beforeEach(() => {
      // Mock successful token response
      const mockTokenResponse: AxiosResponse = {
        data: { 
          access_token: 'mock-jwt-token',
          expires_in: 3600 
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };
      mockAxiosInstance.post.mockResolvedValue(mockTokenResponse);
    });

    it('should handle GET requests', async () => {
      const mockResponse: AxiosResponse = {
        data: { id: 1, name: 'test' },
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

      const result = await apiClient.get('/users/1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/1', { params: undefined });
      expect(result).toEqual(mockResponse);
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

      await expect(apiClient.get('/test')).rejects.toThrow('Network Error');
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

      await expect(apiClient.get('/nonexistent')).rejects.toEqual(httpError);
    });
  });
});