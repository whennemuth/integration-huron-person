
import { Config } from '../../config/Config';
import { ConfigManager } from '../../config/ConfigManager';
import { ApiClientForJWT, EndpointConfigForJWT } from '../ApiClientForJWT';
import { SchemaPath } from '../SchemaBroker';
import { ReadPeople } from './ReadPeople';
import { HuronPerson } from './Person';
import { BasicCache } from '../../Cache';

/**
 * Response structure for person retrieval
 */
interface PersonResponse {
  data: HuronPerson;
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

  constructor(private config: Config) {
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout
    };
    const cache = config.cache?.enabled ? BasicCache.getInstance(config.cache.path) : undefined;
    this.apiClient = new ApiClientForJWT(endpointConfig, cache);
  }

  /**
   * Read a single person by HRN (Huron Resource Name)
   * @param hrn The Huron Resource Name of the person to retrieve
   * @returns Promise resolving to the Person data
   */
  public readPersonByHRN = async (hrn: string, includeFields?: string[]): Promise<HuronPerson> => {
    try {
      if(/^\d+$/.test(hrn)) {
        hrn = `hrn:hrs:persons:${hrn}`;
      }
      const endpoint = SchemaPath.PERSONS_BY_HRN.replace('{hrn}', encodeURIComponent(hrn));
      const response = await this.apiClient.get<PersonResponse>({ url: endpoint, params: { includeFields } });

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
  public readPersonById = async (personId: string, includeFields?: string[]): Promise<HuronPerson[]> => {
    try {
      return this.readPersonBySingleFilter('id', personId, includeFields);
    } catch (error) {
      console.error(`Failed to read person with id ${personId}:`, error);
      throw new Error(`Failed to read person by id ${personId}: ${error}`);
    }
  }

  private async readPersonBySingleFilter(field: string, value: string, includeFields?: string[]): Promise<any[]> {
  const persons: any[] = await new ReadPeople(this.config).readAllPeople({
      filters: [
        ReadPeople.createFilter({ field, value })
      ],
      includeFields
    });
    return persons;
  }

  /**
   * Read a single person by email address. Assumes email is unique.
   * @param email 
   * @returns Promise resolving to an array of Person data matching the email
   * (Note: could be multiple if somehow not unique)
   */
  public async readPersonByEmail(email: string, includeFields?: string[]): Promise<HuronPerson[]> {
    try {
      return this.readPersonBySingleFilter('contactInformation.email', email, includeFields);
    } catch (error) {
      console.error(`Failed to read person with email ${email}:`, error);
      throw new Error(`Failed to read person by email ${email}: ${error}`);
    }
  }

  public async readPersonByUserId(userId: string, includeFields?: string[]): Promise<HuronPerson[]> {
    try {
      return this.readPersonBySingleFilter('userId', userId, includeFields);
    } catch (error) {
      console.error(`Failed to read person with userId ${userId}:`, error);
      throw new Error(`Failed to read person by userId ${userId}: ${error}`);
    }
  }

  public async readPersonBySourceIdentifier(sourceIdentifier: string, includeFields?: string[]): Promise<HuronPerson[]> {
    try {
      return this.readPersonBySingleFilter('sourceIdentifier', sourceIdentifier, includeFields);
    } catch (error) {
      console.error(`Failed to read person with sourceIdentifier ${sourceIdentifier}:`, error);
      throw new Error(`Failed to read person by sourceIdentifier ${sourceIdentifier}: ${error}`);
    }
  }
}


async function main() {
  const config = ConfigManager.
    getInstance()
    .fromEnvironment()
    .fromFileSystem()
    .getConfig();

  const reader = new ReadPerson(config);

  const { 
    HURON_PERSON_ID_TYPE, 
    HURON_PERSON_ID, 
    HURON_PERSON_HRN, 
    HURON_PERSON_SOURCE_ID, 
    HURON_PERSON_USER_ID,
    HURON_PERSON_EMAIL
  } = process.env;
  let personData: HuronPerson | HuronPerson[];

  switch (HURON_PERSON_ID_TYPE) {
    case 'id':
      console.log(`Reading person by ID: ${HURON_PERSON_ID}`);
      personData = await reader.readPersonById(HURON_PERSON_ID!);
      break;
    case 'hrn':
      console.log(`Reading person by HRN: ${HURON_PERSON_HRN}`);
      personData = await reader.readPersonByHRN(HURON_PERSON_HRN!);
      break;
    case 'sid':
      console.log(`Reading person by Source Identifier: ${HURON_PERSON_SOURCE_ID}`);
      personData = await reader.readPersonBySourceIdentifier(HURON_PERSON_SOURCE_ID!);
      break;
    case 'uid':
      console.log(`Reading person by User ID: ${HURON_PERSON_USER_ID}`);
      personData = await reader.readPersonByUserId(HURON_PERSON_USER_ID!);
      break;
    case 'email':
      console.log(`Reading person by Email: ${HURON_PERSON_EMAIL}`);
      personData = await reader.readPersonByEmail(HURON_PERSON_EMAIL!);
      break;
    default:
      console.error('Please set HURON_PERSON_ID_TYPE to one of: hrn, sid, uid, id, email');
      return;
  }

  try {
    console.log('Retrieved Person Data:', JSON.stringify(personData, null, 2));
  } catch (error) {
    console.error('Error retrieving person data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { PersonResponse, ReadPerson };
