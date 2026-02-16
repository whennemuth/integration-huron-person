import { DataSource, Timer } from 'integration-core';
import { Config, ExecutionMode } from '../config/Config';
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

  /**
   * Fetch raw data from the CDM API
   */
  async fetchRaw(): Promise<any[]> {
    try {
      const timer = new Timer();
      console.log(`Fetching data from ${this.name}...`);

      timer.start();
      const response = await this.apiClient.get<{ response: any[] }>({
        url: this.getFetchPath() + (this.params.buid ? `?buid=${this.params.buid}` : ''),
        responseFilter: this.responseFilter
      });
      timer.stop();

      const rawData = response.data.response;
      timer.logElapsed(`Successfully fetched ${rawData.length} records`);

      return rawData;
    } catch (error) {
      console.error(`Failed to fetch data from ${this.name}:`, error);
      throw new Error(`Failed to fetch data from ${this.name}: ${error}`);
    }
  }
}
