import { DataSource, Timer } from 'integration-core';
import { Config, DataSourceConfig } from '../config/Config';
import { ResponseProcessor } from '../stream/AxiosResponseStreamFilter';
import { ApiClientForApiKey, EndpointConfigForApiKey } from './ApiClientForApiKey';

/**
 * Common base class for CDM data sources
 */
export abstract class BuCdmDataSource implements DataSource {
  public abstract readonly name: string;
  public abstract readonly description: string;

  protected apiClient: ApiClientForApiKey;
  protected config: Config;
  protected responseFilter: ResponseProcessor | undefined;
  protected params: { config: Config, responseFilter?: ResponseProcessor, buid?: string };
  protected queryParams: Record<string, any> = {};

  constructor(params: { config: Config, responseFilter?: ResponseProcessor, buid?: string }) {
    this.params = params;
    this.config = params.config;
    this.responseFilter = params.responseFilter;

    // Subclasses must implement endpoint config selection
    const endpointConfig = this.getEndpointConfig();
    this.apiClient = new ApiClientForApiKey(endpointConfig);
  }

  /**
   * Abstract method for subclasses to provide their specific endpoint configuration
   */
  protected abstract getEndpointConfig(): EndpointConfigForApiKey;

  /**
   * Abstract method for subclasses to provide their specific fetch path
   */
  protected abstract getFetchPath(): string;

  public setQueryParam = (key: string, value: any): void => {
    this.queryParams[key] = value;
  };
  
  public setQueryParams = (params: Record<string, any>): void => {
    this.queryParams = params;
  }

  getFetchUrl(): string {
    const endpointConfig = this.getEndpointConfig();
    const { baseUrl } = {} = endpointConfig || {};
    const url = new URL(this.getFetchPath(), baseUrl);
    
    const queryParams = this.queryParams;
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Fetch raw data from the CDM API
   * MEMORY OPTIMIZATION: ApiClientForApiKey now uses streaming to prevent buffering entire responses.
   * Additional cleanup added here as secondary defense.
   */
  async fetchRaw(): Promise<any[]> {
    try {
      const timer = new Timer();
      console.log(`Fetching data from ${this.name}...`);     

      timer.start();
      const response = await this.apiClient.get<{ response: any[] }>({
        url: this.getFetchUrl(),
        responseFilter: this.responseFilter
      });
      timer.stop();

      const rawData = response.data.response;
      timer.logElapsed(`Successfully fetched ${rawData.length} records`);
  
      // MEMORY OPTIMIZATION (Secondary): Clear response reference
      // Primary fix: ApiClientForApiKey uses streaming to prevent buffering
      (response as any).data = null;
      
      return rawData;
    } catch (error) {
      console.error(`Failed to fetch data from ${this.name}:`, error);
      throw new Error(`Failed to fetch data from ${this.name}: ${error}`);
    }
  }
}

// Import child classes AFTER the base class is defined to avoid circular dependency issues
import { BuCdmPeopleDataSource } from './PeopleCdmDataSource';
import { BuS3PeopleDataSource } from './PeopleS3DataSource';

export const getEndpointConfig = (config:Config): EndpointConfigForApiKey | undefined => {
  const { executionMode, dataSource: { 
    people = {}, 
    person = {},
    terms = {}
  } = {}} = config;
  let endpointConfig: EndpointConfigForApiKey;
  switch(executionMode) {
    case 'person':
      endpointConfig = (person as DataSourceConfig)?.endpointConfig;
      break;
    case 'people':
      endpointConfig = (people as DataSourceConfig)?.endpointConfig;
      break;
    case 'terms':
      endpointConfig = (terms as DataSourceConfig)?.endpointConfig;
      break;
    case 'none': default:
      return undefined;
  }
  return endpointConfig;
}

/**
 * Factory function to get the appropriate data source based on configuration
 * @param config Configuration object
 * @param responseFilter Optional response filter for streaming
 * @returns DataSource instance (either CDM API or S3 based)
 */
export const getDataSource = (config: Config, responseFilter?: ResponseProcessor): DataSource => {
  const endpointConfig: EndpointConfigForApiKey | undefined = getEndpointConfig(config);
  const { baseUrl } = endpointConfig || {};
  const { people: { bucketName, fetchPath } = {}} = config.dataSource as any;
  if(baseUrl || fetchPath) {
    return new BuCdmPeopleDataSource({ config, responseFilter });
  }
  if( ! bucketName) {
    throw new Error('Invalid configuration: For people data source, either fetchPath or bucketName must be provided');
  }
  return new BuS3PeopleDataSource({ config });
}

