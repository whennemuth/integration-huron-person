import {
  ConfigManager,
  DataMapper,
  HuronApiClient,
  HuronDeltaStrategyFactory,
  HuronPersonDataSource,
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

    it('should export HuronPersonDataSource', () => {
      expect(HuronPersonDataSource).toBeDefined();
      expect(typeof HuronPersonDataSource).toBe('function');
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
      expect(HuronPersonDataSource.prototype.constructor).toBe(HuronPersonDataSource);
      expect(HuronPersonDataTarget.prototype.constructor).toBe(HuronPersonDataTarget);
      expect(HuronPersonIntegration.prototype.constructor).toBe(HuronPersonIntegration);
    });

    it('should allow instantiation of all exported classes', () => {
      const mockConfig = {
        dataSource: {
          endpointConfig: {
            baseUrl: 'https://test-ds.com',
            apiKey: 'test-api-key'
          },
          fetchPersonsPath: '/persons'
        },
        dataTarget: {
          endpointConfig: {
            baseUrl: 'https://test-dt.com',
            authMethod: 'basic' as const,
            loginSvcPath: '/auth',
            username: 'user',
            password: 'pass'
          },
          personsPath: '/persons'
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
      expect(() => new HuronPersonDataSource({ config: mockConfig, dataMapper: new DataMapper(), responseFilter: new AxiosResponseStreamFilter({ fieldsToKeep: ['id'] }) })).not.toThrow();
      expect(() => new HuronPersonDataTarget(mockConfig)).not.toThrow();
      expect(() => new HuronPersonIntegration('./config.json')).not.toThrow();
    });
  });

  describe('Package consistency', () => {
    it('should maintain consistent naming convention', () => {
      const exports = [
        'ConfigManager',
        'HuronApiClient', 
        'HuronDeltaStrategyFactory',
        'HuronPersonDataSource',
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
        'HuronPersonDataSource',
        'HuronPersonDataTarget',
        'HuronPersonIntegration'
      ];

      huronClasses.forEach(className => {
        expect(className).toMatch(/^Huron/);
      });
    });
  });
});