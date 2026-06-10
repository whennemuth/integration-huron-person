import { TestEnvironment } from 'integration-core';

import { BasicCache } from '../../Cache';
import { Config } from '../../config/Config';
import { ConfigManager } from '../../config/ConfigManager';
import { ApiClientForJWT, EndpointConfigForJWT, TargetApiErrorEventProcessor } from '../ApiClientForJWT';
import { SchemaPath } from '../SchemaBroker';
import { HuronPerson } from './Person';
import { ReadPeople } from './ReadPeople';

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

type ReadPersonParams = {
  config: Config;
  errorEventProcessor?: TargetApiErrorEventProcessor;
  includeInactive?: boolean; // New parameter to control inclusion of inactive people
}

/**
 * Class for reading individual Person records from the Huron API
 */
class ReadPerson {
  private apiClient: ApiClientForJWT;
  private config: Config;
  private errorEventProcessor?: TargetApiErrorEventProcessor;
  private includeInactive: boolean;

  constructor(params: ReadPersonParams) {
    const { config, errorEventProcessor, includeInactive=true } = params;
    this.config = config;
    this.errorEventProcessor = errorEventProcessor;
    this.includeInactive = includeInactive;
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout,
      errorEventProcessor: errorEventProcessor || config.dataTarget.endpointConfig.errorEventProcessor
    };
    // Pass config to getInstance so cache settings (enabled, path) are respected
    const cache = BasicCache.getInstance(config);
    this.apiClient = new ApiClientForJWT(endpointConfig, cache);
  }

  /**
   * Read a single person by HRN (Huron Resource Name)
   * @param hrn The Huron Resource Name of the person to retrieve
   * @returns Promise resolving to the Person data (NOTE will include an existing person, even if includeInactive is false)
   */
  public readPersonByHRN = async (hrn: string, includeFields?: string[]): Promise<HuronPerson> => {
    if (/^\d+$/.test(hrn)) {
      hrn = `hrn:hrs:persons:${hrn}`;
    }
    const endpoint = SchemaPath.PERSONS_BY_HRN.replace('{hrn}', encodeURIComponent(hrn));
    const response = await this.apiClient.get<PersonResponse>({ url: endpoint, params: { includeFields } });

    if (response.status !== 200) {
      throw new Error(`Failed to read person ${hrn}: HTTP ${response.status} ${response.statusText}`);
    }

    return response.data.data;
  }

  /**
   * Read a single person by ID (alternative to HRN)
   * Note: This method assumes the ID can be used to construct an HRN or directly query
   * @param personId The person ID to retrieve
   * @returns Promise resolving to the Person data
   */
  public readPersonById = async (personId: string, includeFields?: string[]): Promise<HuronPerson[]> => {
    return await this.readPersonBySingleFilter('id', personId, includeFields);
  }

  private async readPersonBySingleFilter(field: string, value: string, includeFields?: string[]): Promise<any[]> {
    const { config, includeInactive } = this;
    const persons: any[] = await new ReadPeople({ config, includeInactive }).readAllPeople({
      filters: [
        ReadPeople.createFilter({ field, value })
      ],
      includeFields
    });
    return persons;
  }

  public async readPersonByMultipleFilters(fields: string[], value: string, includeFields?: string[]): Promise<any[]> {
    const { config, includeInactive } = this;
    const filters = fields.map((field) => ReadPeople.createFilter({ field, value, logicalOperator: 'or' }));
    const persons: any[] = await new ReadPeople({ config, includeInactive }).readAllPeople({
      filters,
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
    return await this.readPersonBySingleFilter('contactInformation.email', email, includeFields);
  }

  public async readPersonByUserId(userId: string, includeFields?: string[]): Promise<HuronPerson[]> {
    return await this.readPersonBySingleFilter('userId', userId, includeFields);
  }

  public async readPersonBySourceIdentifier(sourceIdentifier: string, includeFields?: string[]): Promise<HuronPerson[]> {
    return await this.readPersonBySingleFilter('sourceIdentifier', sourceIdentifier, includeFields);
  }

  public async readPersonByEmployeeId(employeeId: string, includeFields?: string[]): Promise<HuronPerson[]> {
    return await this.readPersonBySingleFilter('employeeId', employeeId, includeFields);
  }

  /**
   * Try to find a Huron person where the specified buid matches any of the "usual suspects" fields.
   */
  public async readPersonByHailMary(buid: string, includeFields?: string[]): Promise<HuronPerson[]> {
    return await this.readPersonByMultipleFilters(['id', 'sourceIdentifier'], buid, includeFields);
  }
}

enum HuronPersonIdType {
  HRN = 'hrn',
  ID = 'id',
  USER_ID = 'uid',
  SOURCE_ID = 'sid',
  EMAIL = 'email',
  HAIL_MARY = 'hail-mary'
}

const getPersonData = async (params: {
  reader: ReadPerson; huronPersonIdType?: HuronPersonIdType; id?: string
}): Promise<HuronPerson | HuronPerson[]> => {
  const { reader, huronPersonIdType, id } = params;
  const {
    HURON_PERSON_ID_TYPE,
    HURON_PERSON_ID,
    HURON_PERSON_HRN,
    HURON_PERSON_SOURCE_ID,
    HURON_PERSON_USER_ID,
    HURON_PERSON_EMAIL
  } = process.env;

  switch (huronPersonIdType ?? HURON_PERSON_ID_TYPE) {
    case 'id':
      console.log(`Reading person by ID: ${HURON_PERSON_ID ?? id}`);
      return reader.readPersonById(HURON_PERSON_ID ?? id!);
    case 'hrn':
      console.log(`Reading person by HRN: ${HURON_PERSON_HRN ?? id}`);
      return reader.readPersonByHRN(HURON_PERSON_HRN ?? id!);
    case 'sid':
      console.log(`Reading person by Source Identifier: ${HURON_PERSON_SOURCE_ID ?? id}`);
      return reader.readPersonBySourceIdentifier(HURON_PERSON_SOURCE_ID ?? id!);
    case 'uid':
      console.log(`Reading person by User ID: ${HURON_PERSON_USER_ID ?? id}`);
      return reader.readPersonByUserId(HURON_PERSON_USER_ID ?? id!);
    case 'email':
      console.log(`Reading person by Email: ${HURON_PERSON_EMAIL ?? id}`);
      return reader.readPersonByEmail(HURON_PERSON_EMAIL ?? id!);
    case 'hail-mary':
      console.log(`Reading person by Hail Mary with value: ${HURON_PERSON_SOURCE_ID ?? id}`);
      return reader.readPersonByHailMary(HURON_PERSON_SOURCE_ID ?? id!);
    default:
      console.error('Please set HURON_PERSON_ID_TYPE to one of: hrn, sid, uid, id, email');
      return [];
  }
};

async function main() {
  const config = ConfigManager
    .getInstance(true)
    .fromEnvironment()
    .fromFileSystem()
    .getConfig('person');

  const reader = new ReadPerson({ config });
  const personData: HuronPerson | HuronPerson[] = await getPersonData({ reader });

  try {
    console.log('Retrieved Person Data:', JSON.stringify(personData, null, 2));
  } catch (error) {
    console.error('Error retrieving person data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('READ_PERSON');

  [
    'HURON_PERSON_EMAIL',
    'HURON_PERSON_HRN',
    'HURON_PERSON_ID',
    'HURON_PERSON_ID_TYPE',
    'HURON_PERSON_SOURCE_ID',
    'HURON_PERSON_USER_ID'
  ].forEach(testEnvironment.getVarOrEmptyString);

  main();
}

export { PersonResponse, ReadPerson, ReadPersonParams, getPersonData, HuronPersonIdType };
