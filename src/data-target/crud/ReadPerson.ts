
import { ApiClientForJWT, EndpointConfigForJWT } from '../ApiClientForJWT';
import { Config } from '../../config/Config';
import { SchemaPath } from '../SchemaBroker';
import { ConfigManager } from '../../config/ConfigManager';

/**
 * Response structure for person retrieval
 */
interface PersonResponse {
  data: any;
  links?: {
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
}

/**
 * Class for reading individual Person records from the Huron API
 */
class ReadPerson {
  private apiClient: ApiClientForJWT;

  constructor(config: Config) {
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout
    };
    this.apiClient = new ApiClientForJWT(endpointConfig);
  }

  /**
   * Read a single person by HRN (Huron Resource Name)
   * @param hrn The Huron Resource Name of the person to retrieve
   * @returns Promise resolving to the Person data
   */
  async readPerson(hrn: string): Promise<any> {
    try {
      const endpoint = SchemaPath.PERSONS_BY_HRN.replace('{hrn}', encodeURIComponent(hrn));
      const response = await this.apiClient.get<PersonResponse>({ url: endpoint });

      if (response.status !== 200) {
        throw new Error(`Failed to read person ${hrn}: HTTP ${response.status} ${response.statusText}`);
      }

      return response.data.data;
    } catch (error) {
      console.error(`Failed to read person with HRN ${hrn}:`, error);
      throw new Error(`Failed to read person ${hrn}: ${error}`);
    }
  }

  /**
   * Read a single person by ID (alternative to HRN)
   * Note: This method assumes the ID can be used to construct an HRN or directly query
   * @param personId The person ID to retrieve
   * @returns Promise resolving to the Person data
   */
  async readPersonById(personId: string): Promise<any> {
    // For now, we'll assume the HRN format is hrn:hrs:persons:{personId}
    // In a real implementation, you might need to query for the HRN first or have a different endpoint
    const hrn = `hrn:hrs:persons:${personId}`;
    return this.readPerson(hrn);
  }
}


async function main() {
  const personId = process.env.HURON_PERSON_ID;
  const config = ConfigManager.
    getInstance()
    .fromEnvironment()
    .fromFileSystem()
    .getConfig();

  const reader = new ReadPerson(config);

  try {
    const personData = await reader.readPersonById(personId!);
    console.log('Retrieved Person Data:', JSON.stringify(personData, null, 2));
  } catch (error) {
    console.error('Error retrieving person data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { ReadPerson, PersonResponse };