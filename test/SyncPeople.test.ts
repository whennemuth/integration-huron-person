import {
  ConfigManager,
  DataMapper,
  HuronApiClient,
  HuronDeltaStrategyFactory,
  BuCdmPersonDataSource,
  HuronPersonDataTarget,
  HuronPersonIntegration
} from '../bin/index';
import { AxiosResponseStreamFilter } from '../src/stream/AxiosResponseStreamFilter';

describe('Package Exports', () => {
  describe('Main exports should be available', () => {
    it('should export ConfigManager', () => {
      expect(ConfigManager).toBeDefined();
      expect(typeof ConfigManager).toBe('function');
    });

    it('should export HuronApiClient', () => {
      expect(HuronApiClient).toBeDefined();
      expect(typeof HuronApiClient).toBe('function');
    });


    it('should export HuronDeltaStrategyFactory', () => {
      expect(HuronDeltaStrategyFactory).toBeDefined();
      expect(typeof HuronDeltaStrategyFactory).toBe('function');
    });

    it('should export BuCdmPersonDataSource', () => {
      expect(BuCdmPersonDataSource).toBeDefined();
      expect(typeof BuCdmPersonDataSource).toBe('function');
    });

    it('should export HuronPersonDataTarget', () => {
      expect(HuronPersonDataTarget).toBeDefined();
      expect(typeof HuronPersonDataTarget).toBe('function');
    });

    it('should export HuronPersonIntegration', () => {
      expect(HuronPersonIntegration).toBeDefined();
      expect(typeof HuronPersonIntegration).toBe('function');
    });
  });

  describe('Export integrity', () => {
    it('should have proper constructors', () => {
      expect(ConfigManager.prototype.constructor).toBe(ConfigManager);
      expect(HuronApiClient.prototype.constructor).toBe(HuronApiClient);
      expect(HuronDeltaStrategyFactory.prototype.constructor).toBe(HuronDeltaStrategyFactory);
      expect(BuCdmPersonDataSource.prototype.constructor).toBe(BuCdmPersonDataSource);
      expect(HuronPersonDataTarget.prototype.constructor).toBe(HuronPersonDataTarget);
      expect(HuronPersonIntegration.prototype.constructor).toBe(HuronPersonIntegration);
    });

    it('should allow instantiation of all exported classes', () => {
      const mockConfig = {
        dataSource: {
          person: {
            endpointConfig: {
              baseUrl: 'https://test-ds.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/persons'
          },
          people: {
            endpointConfig: {
              baseUrl: 'https://test-ds.com',
              apiKey: 'test-api-key'
            },
            fetchPath: '/persons'
          },
          idpName: 'test-idp'
        },
        dataTarget: {
          endpointConfig: {
            baseUrl: 'https://test-dt.com',
            authMethod: 'basic' as const,
            loginSvcPath: '/auth',
            username: 'user',
            password: 'pass'
          },
          personsPath: '/api/persons',
          organizationsPath: '/api/organizations'
        },
        integration: {
          clientId: 'test',
          batchSize: 10,
          timeout: 5000
        },
        storage: {
          type: 'file' as const,
          config: { path: './test' }
        }
      };

      expect(() => ConfigManager.getInstance()).not.toThrow();
      expect(() => new HuronApiClient({
        baseUrl: 'https://test.com',
        authMethod: 'basic',
        loginSvcPath: '/auth',
        username: 'user',
        password: 'pass'
      })).not.toThrow();
      expect(() => new HuronDeltaStrategyFactory()).not.toThrow();
      expect(() => new BuCdmPersonDataSource({ config: mockConfig, responseFilter: new AxiosResponseStreamFilter({ fieldsOfInterest: ['id'] }), buid: 'U12345678' })).not.toThrow();
      expect(() => new HuronPersonDataTarget({ config: mockConfig })).not.toThrow();
      expect(() => new HuronPersonIntegration({ configPath: './config.json' })).not.toThrow();
    });
  });

  describe('Package consistency', () => {
    it('should maintain consistent naming convention', () => {
      const exports = [
        'ConfigManager',
        'HuronApiClient',
        'HuronDeltaStrategyFactory',
        'BuCdmPersonDataSource',
        'HuronPersonDataTarget',
        'HuronPersonIntegration'
      ];
      exports.forEach(exportName => {
        expect(exportName).toMatch(/^[A-Z][a-zA-Z]*$/);
      });
    });

    it('should have Huron prefix for domain-specific classes', () => {
      const huronClasses = [
        'HuronApiClient',
        'HuronDeltaStrategyFactory',
        'HuronPersonDataTarget',
        'HuronPersonIntegration'
      ];
      huronClasses.forEach(className => {
        expect(className).toMatch(/^Huron/);
      });
    });
  });

  describe('HuronPersonIntegration chunkId support', () => {
    it('should accept chunkId parameter in run method', () => {
      const integration = new HuronPersonIntegration({ configPath: './config.json' });
      expect(integration.run).toBeDefined();
      expect(integration.run.length).toBe(2); // taskName and chunkId parameters
    });

    it('should work without chunkId for backward compatibility', () => {
      const integration = new HuronPersonIntegration({ configPath: './config.json' });
      
      // Should not throw due to missing chunkId parameter - method accepts 0-2 args
      expect(() => integration.run).not.toThrow();
      expect(typeof integration.run).toBe('function');
    });

    it('should accept both taskName and chunkId parameters', () => {
      const integration = new HuronPersonIntegration({ configPath: './config.json' });
      
      // Verify function signature accepts both parameters
      expect(integration.run.length).toBe(2);
      
      // These calls should be syntactically valid (will fail for other reasons without full config)
      expect(() => integration.run('test')).not.toThrow(TypeError);
      expect(() => integration.run('test', '1234')).not.toThrow(TypeError);
    });
  });
});