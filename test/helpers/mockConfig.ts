import { Config } from '../../src/config/Config';

/**
 * Creates a minimal mock configuration for testing purposes
 * Can be customized with partial overrides
 */
export function createMockConfig(overrides?: Partial<Config>): Config {
  const defaultConfig: Config = {
    dataSource: {
      person: {
        endpointConfig: {
          baseUrl: 'https://mock-datasource.example.com',
          apiKey: 'mock-api-key'
        },
        fetchPath: '/api/v1/person'
      },
      people: {
        endpointConfig: {
          baseUrl: 'https://mock-datasource.example.com',
          apiKey: 'mock-api-key'
        },
        fetchPath: '/api/v1/people'
      }
    },
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://mock-datatarget.example.com',
        authMethod: 'basic',
        loginSvcPath: '/auth/token',
        username: 'mock-user',
        password: 'mock-pass'
      },
      personsPath: '/api/v2/persons',
      organizationsPath: '/api/v2/organizations'
    },
    integration: {
      clientId: 'mock-client',
      batchSize: 10,
      timeout: 5000
    },
    storage: {
      type: 'file',
      config: {
        path: './test-data/mock-storage'
      }
    }
  };

  // Deep merge overrides with default config
  return deepMerge(defaultConfig, overrides || {});
}

/**
 * Deep merge utility for combining configs
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}
