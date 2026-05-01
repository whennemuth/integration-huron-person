import { Config } from '../../config/Config';
import { ConfigManager } from '../../config/ConfigManager';
import { ApiClientForJWT, EndpointConfigForJWT, TargetApiErrorEventProcessor } from '../ApiClientForJWT';
import { SchemaPath } from '../SchemaBroker';
import { ReadOrganizations } from './ReadOrganizations';
import { HuronOrganization } from './Organization';
import { BasicCache } from '../../Cache';

/**
 * Response structure for organization retrieval
 */
interface OrganizationResponse {
  data: HuronOrganization;
  links?: {
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
}

/**
 * Class for reading individual Organization records from the Huron API
 */
class ReadOrganization {
  private apiClient: ApiClientForJWT;

  constructor(private config: Config, errorEventProcessor?: TargetApiErrorEventProcessor) {
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout,
      errorEventProcessor: errorEventProcessor || config.dataTarget.endpointConfig.errorEventProcessor
    };
    const cache = BasicCache.getInstance(config);
    this.apiClient = new ApiClientForJWT(endpointConfig, cache);
  }

  /**
   * Read a single organization by HRN (Huron Resource Name)
   * @param hrn The Huron Resource Name of the organization to retrieve
   * @returns Promise resolving to the Organization data
   */
  public readOrganizationByHRN = async (hrn: string, includeFields?: string[]): Promise<HuronOrganization> => {
    const endpoint = SchemaPath.ORGANIZATIONS_BY_HRN.replace('{hrn}', encodeURIComponent(hrn));
    this.apiClient.setErrorEventDetails({ 
      message: `Huron organization retrieval error for HRN ${hrn}`, 
      object: { hrn, includeFields } 
    });
    const response = await this.apiClient.get<OrganizationResponse>({ url: endpoint, params: { includeFields } });

    if (response.status !== 200) {
      throw new Error(`Failed to read organization ${hrn}: HTTP ${response.status} ${response.statusText}`);
    }

    return response.data.data;
  }

  /**
   * Read a single organization by ID (alternative to HRN)
   * Note: This method assumes the ID can be used to construct an HRN or directly query
   * @param organizationId The organization ID to retrieve
   * @returns Promise resolving to the Organization data
   */
  public readOrganizationById = async (organizationId: string, includeFields?: string[]): Promise<HuronOrganization[]> => {
    return await this.readOrganizationBySingleFilter('id', organizationId, includeFields);
  }

  private async readOrganizationBySingleFilter(field: string, value: string, includeFields?: string[]): Promise<any[]> {
  const organizations: any[] = await new ReadOrganizations({ config: this.config }).readAllOrganizations({
      filters: [
        ReadOrganizations.createFilter({ field, value })
      ],
      includeFields
    });
    return organizations;
  }

  /**
   * Read organizations by name. Note that name might not be unique.
   * @param name 
   * @returns Promise resolving to an array of Organization data matching the name
   */
  public async readOrganizationByName(name: string, includeFields?: string[]): Promise<HuronOrganization[]> {
    return await this.readOrganizationBySingleFilter('name', name, includeFields);
  }

  /**
   * Read organizations by source identifier
   * @param sourceIdentifier The source identifier to search for
   * @returns Promise resolving to an array of Organization data matching the source identifier
   */
  public async readOrganizationBySourceIdentifier(sourceIdentifier: string, includeFields?: string[]): Promise<HuronOrganization[]> {
    return await this.readOrganizationBySingleFilter('sourceIdentifier', sourceIdentifier, includeFields);
  }

}



async function main() {
  const config = ConfigManager.
    getInstance()
    .fromEnvironment()
    .fromFileSystem()
    .getConfig('none');

  const reader = new ReadOrganization(config);

  const { 
    HURON_ORG_ID_TYPE, 
    HURON_ORG_ID, 
    HURON_ORG_HRN, 
    HURON_ORG_SOURCE_ID, 
    HURON_ORG_NAME
  } = process.env;
  let organizationData: HuronOrganization | HuronOrganization[];

  try {
    switch (HURON_ORG_ID_TYPE) {
      case 'id':
        console.log(`Reading organization by ID: ${HURON_ORG_ID}`);
        organizationData = await reader.readOrganizationById(HURON_ORG_ID!);
        break;
      case 'hrn':
        console.log(`Reading organization by HRN: ${HURON_ORG_HRN}`);
        organizationData = await reader.readOrganizationByHRN(HURON_ORG_HRN!);
        break;
      case 'sid':
        console.log(`Reading organization by Source Identifier: ${HURON_ORG_SOURCE_ID}`);
        organizationData = await reader.readOrganizationBySourceIdentifier(HURON_ORG_SOURCE_ID!);
        break;
      case 'name':
        console.log(`Reading organization by Name: ${HURON_ORG_NAME}`);
        organizationData = await reader.readOrganizationByName(HURON_ORG_NAME!);
        break;
      default:
        console.error('Please set HURON_ORG_ID_TYPE to one of: hrn, sid, id, name');
        return;
    }    
    console.log('Retrieved Organization Data:', JSON.stringify(organizationData, null, 2));
  } catch (error) {
    console.error('Error retrieving organization data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { OrganizationResponse, ReadOrganization };