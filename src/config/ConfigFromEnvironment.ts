import { Config } from './Config';

/**
 * Configuration provider that reads configuration values from environment variables
 */
export class ConfigFromEnvironment {
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
    if (process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL) {
      envOverrides.dataSource = {
        ...envOverrides.dataSource || this.baseConfig?.dataSource,
        endpointConfig: {
          ...this.baseConfig?.dataSource?.endpointConfig,
          baseUrl: process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL
        }
      } as any;
    }

    if (process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY) {
      envOverrides.dataSource = {
        ...envOverrides.dataSource || this.baseConfig?.dataSource,
        endpointConfig: {
          ...envOverrides.dataSource?.endpointConfig || this.baseConfig?.dataSource?.endpointConfig,
          apiKey: process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY
        }
      } as any;
    }

    if (process.env.DATASOURCE_ENDPOINT_PERSON_PATH) {
      envOverrides.dataSource = {
        ...envOverrides.dataSource || this.baseConfig?.dataSource,
        fetchPersonsPath: process.env.DATASOURCE_ENDPOINT_PERSON_PATH
      } as any;
    }

    // DataTarget (JWT authentication) overrides
    if (process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...this.baseConfig?.dataTarget?.endpointConfig,
          baseUrl: process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL
        }
      } as any;
    }

    if (process.env.DATATARGET_ENDPOINTCONFIG_USERNAME) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          username: process.env.DATATARGET_ENDPOINTCONFIG_USERNAME
        }
      } as any;
    }

    if (process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          password: process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD
        }
      } as any;
    }

    if (process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          loginSvcPath: process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH
        }
      } as any;
    }

    if(process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          userId: process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID
        }
      } as any;
    }

    if (process.env.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.baseConfig?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.baseConfig?.dataTarget?.endpointConfig,
          externalToken: process.env.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN
        }
      } as any;
    }

    // Integration overrides
    if (process.env.CLIENT_ID || process.env.BATCH_SIZE || process.env.TIMEOUT) {
      envOverrides.integration = {
        ...this.baseConfig?.integration,
        ...(process.env.CLIENT_ID && { clientId: process.env.CLIENT_ID }),
        ...(process.env.BATCH_SIZE && { batchSize: parseInt(process.env.BATCH_SIZE, 10) }),
        ...(process.env.TIMEOUT && { timeout: parseInt(process.env.TIMEOUT, 10) })
      } as any;
    }

    return envOverrides;
  }
}