import { Config } from './Config';

/**
 * Configuration provider that reads configuration values from environment variables
 */
export class ConfigFromEnvironment {
  /**
   * Environment variable names used by ConfigFromEnvironment
   */
  static readonly ENV_VARS = {
    DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL: 'DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL',
    DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY: 'DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY',
    DATASOURCE_ENDPOINTCONFIG_PERSON_PATH: 'DATASOURCE_ENDPOINTCONFIG_PERSON_PATH',
    DATASOURCE_ENDPOINTCONFIG_PEOPLE_BASE_URL: 'DATASOURCE_ENDPOINTCONFIG_PEOPLE_BASE_URL',
    DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY: 'DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY',
    DATASOURCE_ENDPOINTCONFIG_PEOPLE_PATH: 'DATASOURCE_ENDPOINTCONFIG_PEOPLE_PATH',
    DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_BASE_URL: 'DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_BASE_URL',
    DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_API_KEY: 'DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_API_KEY',
    DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_PATH: 'DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_PATH',
    DATATARGET_ENDPOINTCONFIG_BASE_URL: 'DATATARGET_ENDPOINTCONFIG_BASE_URL',
    DATATARGET_ENDPOINTCONFIG_USERNAME: 'DATATARGET_ENDPOINTCONFIG_USERNAME',
    DATATARGET_ENDPOINTCONFIG_PASSWORD: 'DATATARGET_ENDPOINTCONFIG_PASSWORD',
    DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH: 'DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH',
    DATATARGET_ENDPOINTCONFIG_LOGIN_USERID: 'DATATARGET_ENDPOINTCONFIG_LOGIN_USERID',
    DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN: 'DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN',
    CLIENT_ID: 'CLIENT_ID',
    BATCH_SIZE: 'BATCH_SIZE',
    TIMEOUT: 'TIMEOUT',
    CACHE_ENABLED: 'CACHE_ENABLED',
    CACHE_PATH: 'CACHE_PATH'
  } as const;

  private baseConfig?: Config;

  constructor(baseConfig?: Config) {
    this.baseConfig = baseConfig;
  }

  /**
   * Get configuration overrides from environment variables
   */
  getConfig(): Partial<Config> {
    const envOverrides: Partial<Config> = {};

    // Override with environment variables if present
    
    // DataSource (API Key authentication) overrides
    // Person-specific overrides
    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).person = {
        ...(envOverrides.dataSource as any).person,
        endpointConfig: {
          ...(envOverrides.dataSource as any).person?.endpointConfig,
          baseUrl: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL]
        }
      };
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).person = {
        ...(envOverrides.dataSource as any).person,
        endpointConfig: {
          ...(envOverrides.dataSource as any).person?.endpointConfig,
          apiKey: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY]
        }
      };
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_PATH]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).person = {
        ...(envOverrides.dataSource as any).person,
        fetchPath: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_PATH]
      };
    }

    // People-specific overrides
    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_BASE_URL]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).people = {
        ...(envOverrides.dataSource as any).people,
        endpointConfig: {
          ...(envOverrides.dataSource as any).people?.endpointConfig,
          baseUrl: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_BASE_URL]
        }
      };
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).people = {
        ...(envOverrides.dataSource as any).people,
        endpointConfig: {
          ...(envOverrides.dataSource as any).people?.endpointConfig,
          apiKey: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY]
        }
      };
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_PATH]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).people = {
        ...(envOverrides.dataSource as any).people,
        fetchPath: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_PATH]
      };
    }

    // Current Terms-specific overrides
    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_BASE_URL]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).terms = {
        ...(envOverrides.dataSource as any).terms,
        endpointConfig: {
          ...(envOverrides.dataSource as any).terms?.endpointConfig,
          baseUrl: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_BASE_URL]
        }
      };
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_API_KEY]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).terms = {
        ...(envOverrides.dataSource as any).terms,
        endpointConfig: {
          ...(envOverrides.dataSource as any).terms?.endpointConfig,
          apiKey: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_API_KEY]
        }
      };
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_PATH]) {
      envOverrides.dataSource = (envOverrides.dataSource || {}) as any;
      (envOverrides.dataSource as any).terms = {
        ...(envOverrides.dataSource as any).terms,
        fetchPath: process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_PATH]
      };
    }

    // DataTarget (JWT authentication) overrides
    if (process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_BASE_URL]) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...this.baseConfig?.dataTarget?.endpointConfig,
          baseUrl: process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_BASE_URL]
        }
      } as any;
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_USERNAME]) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          username: process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_USERNAME]
        }
      } as any;
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_PASSWORD]) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          password: process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_PASSWORD]
        }
      } as any;
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH]) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          loginSvcPath: process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH]
        }
      } as any;
    }

    if(process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID]) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          userId: process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID]
        }
      } as any;
    }

    if (process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN]) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          externalToken: process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN]
        }
      } as any;
    }

    // Integration overrides
    if (process.env[ConfigFromEnvironment.ENV_VARS.CLIENT_ID] || process.env[ConfigFromEnvironment.ENV_VARS.BATCH_SIZE] || process.env[ConfigFromEnvironment.ENV_VARS.TIMEOUT]) {
      envOverrides.integration = {
        ...this.baseConfig?.integration,
        ...(process.env[ConfigFromEnvironment.ENV_VARS.CLIENT_ID] && { clientId: process.env[ConfigFromEnvironment.ENV_VARS.CLIENT_ID] }),
        ...(process.env[ConfigFromEnvironment.ENV_VARS.BATCH_SIZE] && { batchSize: parseInt(process.env[ConfigFromEnvironment.ENV_VARS.BATCH_SIZE]!, 10) }),
        ...(process.env[ConfigFromEnvironment.ENV_VARS.TIMEOUT] && { timeout: parseInt(process.env[ConfigFromEnvironment.ENV_VARS.TIMEOUT]!, 10) })
      } as any;
    }

    // Cache overrides
    if (process.env[ConfigFromEnvironment.ENV_VARS.CACHE_ENABLED] || process.env[ConfigFromEnvironment.ENV_VARS.CACHE_PATH]) {
      envOverrides.cache = {
        ...this.baseConfig?.cache,
        ...(process.env[ConfigFromEnvironment.ENV_VARS.CACHE_ENABLED] && { enabled: process.env[ConfigFromEnvironment.ENV_VARS.CACHE_ENABLED] === 'true' }),
        ...(process.env[ConfigFromEnvironment.ENV_VARS.CACHE_PATH] && { path: process.env[ConfigFromEnvironment.ENV_VARS.CACHE_PATH] })
      } as any;
    }

    return envOverrides;
  }
}