import { BasicCache } from '../../Cache';
import { Config } from '../../config/Config';
import { ConfigManager } from '../../config/ConfigManager';
import { ApiClientForJWT, EndpointConfigForJWT, TargetApiErrorEventProcessor } from '../ApiClientForJWT';
import { BuildQueryOptions, FilterSpec, QueryBuilder } from '../QueryBuilder';
import { SchemaPath } from '../SchemaBroker';
import { FilterFields, SortFields, HuronPerson } from './Person';

/**
 * Response structure for bulk person retrieval
 */
interface PeopleListResponse {
  pagination: {
    offset: number;
    pageSize: number;
    total: number;
    continuationToken?: string;
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
  data: HuronPerson[];
  links?: {
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
}

/**
 * Options for bulk person retrieval
 */
type ReadPeopleOptions = BuildQueryOptions;

/**
 * Class for reading multiple Person records from the Huron API with filtering and sorting
 */
class ReadPeople {
  private apiClient: ApiClientForJWT;
  private queryBuilder: QueryBuilder;

  constructor(params: { config: Config, queryBuilder?: QueryBuilder, errorEventProcessor?: TargetApiErrorEventProcessor }) {
    const { config, queryBuilder, errorEventProcessor } = params;
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout,
      errorEventProcessor: errorEventProcessor || config.dataTarget.endpointConfig.errorEventProcessor
    };
    // Pass config to getInstance so cache settings (enabled, path) are respected
    const cache = BasicCache.getInstance(config);
    this.apiClient = new ApiClientForJWT(endpointConfig, cache);
    this.queryBuilder = queryBuilder || new QueryBuilder(FilterFields, SortFields);
  }

  /**
   * Read multiple persons with optional filtering, sorting, and pagination
   * @param options Configuration options for the query
   * @returns Promise resolving to the PeopleListResponse containing paginated results
   */
  public async readPeople(options: ReadPeopleOptions = {}): Promise<PeopleListResponse> {
    const queryParams = this.queryBuilder.buildQueryParams(options);

    this.apiClient.setErrorEventDetails({
      message: 'Failed to read people',
      object: { options, queryParams }
    });
    
    const response = await this.apiClient.get<PeopleListResponse>({
      url: SchemaPath.PERSONS,
      params: queryParams
    });

    if (response.status !== 200) {
      throw new Error(`Failed to read people: HTTP ${response.status} ${response.statusText}`);
    }

    return response.data;
  }

  /**
   * Read all people matching the criteria, handling pagination automatically.
   * @param options Configuration options for the query
   * @returns Promise resolving to array of all matching Organization records
   */
  public async readAllPeopleNonTokenized(options: ReadPeopleOptions): Promise<HuronPerson[]> {
    const allPeople: HuronPerson[] = [];
    const { pagination: { pageSize = 500 } = {}} = options;
    let offset = 0;

    do {
      const paginationOptions: ReadPeopleOptions = {
        ...options,
        pagination: {
          pageSize,
          offset
        }
      };

      const response = await this.readPeople(paginationOptions);
      allPeople.push(...response.data);
      console.log(`Fetched page ${offset} with ${response.data.length} people (Total so far: ${allPeople.length})`);

      // If we got fewer items than requested, we've reached the last page
      if (response.data.length < pageSize) {
        break;
      }

      // Move to next page
      offset += 1;
    } while (true);

    return allPeople;
  }

  /**
   * Read all people matching the criteria, handling pagination automatically
   * @param options Configuration options for the query
   * @returns Promise resolving to array of all matching Person records
   */
  public async readAllPeople(options: Omit<ReadPeopleOptions, 'pagination'> = {}): Promise<HuronPerson[]> {
    
    // PENDING: Huron API does not currently support tokenized pagination, but it is coming.
    // Use the non-tokenized pagination method for now.
    return await this.readAllPeopleNonTokenized(options);

    const allPeople: HuronPerson[] = [];
    let continuationToken: string | undefined;

    do {
      const paginationOptions: ReadPeopleOptions = {
        ...options,
        pagination: {
          pageSize: 100, // Use larger page size for efficiency
          continuationToken
        }
      };

      const response = await this.readPeople(paginationOptions);
      allPeople.push(...response.data);

      continuationToken = response.pagination.continuationToken;
    } while (continuationToken);

    return allPeople;
  }

  public async readPeopleByFullName(firstName: string, lastName: string, includeFields?: string[]): Promise<HuronPerson[]> {
    const filters: FilterSpec[] = [
      ReadPeople.createFilter({ field: 'firstName', value: firstName, priority: 0, logicalOperator: 'and', comparisonOperator: 'eq' }),
      ReadPeople.createFilter({ field: 'lastName', value: lastName, priority: 1, logicalOperator: 'and', comparisonOperator: 'eq' })
    ];
    const persons: HuronPerson[] = await this.readAllPeople({
      filters,
      includeFields
    });
    return persons;
  }

  public async readPeopleByNamePart(namePart: string, value: string, includeFields?: string[]): Promise<HuronPerson[]> {
    const persons: HuronPerson[] = await this.readAllPeople({
      filters: [
        ReadPeople.createFilter({ field: namePart, value, priority: 0, logicalOperator: 'or', comparisonOperator: 'eq' }),
      ],
      sort: ReadPeople.createSort({ 
        field: namePart.includes('first') ? 'lastName' : 'firstName', 
        direction: 'desc' 
      }),
      includeFields
    });
    return persons;
  }

  public async readPeopleByFirstName(firstName: string, includeFields?: string[]): Promise<HuronPerson[]> {
    return this.readPeopleByNamePart('firstName', firstName, includeFields);
  }

  public async readPeopleByLastName(lastName: string, includeFields?: string[]): Promise<HuronPerson[]> {
    const persons: HuronPerson[] = await this.readAllPeople({
      filters: [
        ReadPeople.createFilter({ field: 'lastName', value: lastName, priority: 0, logicalOperator: 'and', comparisonOperator: 'eq' })
      ],
      includeFields
    });
    return persons;
  }

  public async readPeopleByFilterField(filterField: string, inArray: string[], includeFields?: string[]): Promise<HuronPerson[]> {
    if(!this.queryBuilder['filterFields'].has(filterField)) {
      throw new Error(`Invalid filter field: ${filterField}. Allowed fields: ${Array.from(this.queryBuilder['filterFields']).join(', ')}`);
    }
    
    // Convert array to comma-delimited string for the "in" operator
    const inValue = inArray.join(',');
    
    // Create filter using the "in" operator
    const filter = ReadPeople.createFilter({
      field: filterField,
      value: inValue,
      comparisonOperator: 'in'
    });
    
    // Call readAllPeople with the filter
    return await this.readAllPeople({
      filters: [filter],
      includeFields
    });

  }

  /**
   * Helper method to create a simple filter specification
   * @param filter The filter parameters
   * @returns FilterSpec object
   */
  static createFilter(filter: {
    field: string,
    value: string,
    priority?: number,
    logicalOperator?: 'and' | 'or',
    comparisonOperator?: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'null' | 'in'
  }): FilterSpec {
    return QueryBuilder.createFilter(filter);
  }

  /**
   * Helper method to create a sort specification
   * @param field The field to sort by
   * @param direction The sort direction (default: 'desc')
   * @returns SortSpec object
   */
  static createSort = QueryBuilder.createSort;
}

async function main() {
  const config = ConfigManager
    .getInstance()
    .fromEnvironment()
    .fromFileSystem()
    .getConfig('none');

  const reader = new ReadPeople({ config });

  const { HURON_PEOPLE_FILTER, 
    HURON_PERSON_SOURCE_IDS, 
    HURON_PERSON_NAME_FILTER, HURON_PERSON_FNAME, HURON_PERSON_LNAME } = process.env;
  
  try {
    let personData: HuronPerson | HuronPerson[];
    if(HURON_PEOPLE_FILTER && HURON_PEOPLE_FILTER !== 'buid') {
      const sourceIds = HURON_PERSON_SOURCE_IDS ? HURON_PERSON_SOURCE_IDS.split(',') : [];
      console.log(`Reading people by filter field: ${HURON_PEOPLE_FILTER} with source IDs: ${sourceIds.join(', ')}`);
      personData = await reader.readPeopleByFilterField(HURON_PEOPLE_FILTER, sourceIds, 
        ['id', 'userId', 'sourceIdentifier', 'firstName', 'lastName', 'organization']);
    }
    else {
      switch (HURON_PERSON_NAME_FILTER) {
        case 'full':
          if( ! HURON_PERSON_FNAME || ! HURON_PERSON_LNAME ) {
            console.error('Please set both HURON_PERSON_FNAME and HURON_PERSON_LNAME for full name filter');
            return;
          }
          personData = await reader.readPeopleByFullName(
            HURON_PERSON_FNAME!, 
            HURON_PERSON_LNAME!, 
            ['id', 'userId', 'sourceIdentifier', 'firstName', 'lastName', 'organization']
          );
          console.log(`Reading people by full name: ${HURON_PERSON_FNAME} ${HURON_PERSON_LNAME}`);
          break;
        case 'first': case 'last':
          if(HURON_PERSON_NAME_FILTER === 'first' && ! HURON_PERSON_FNAME) {
            console.error('Please set HURON_PERSON_FNAME for first name filter');
            return;
          }
          if(HURON_PERSON_NAME_FILTER === 'last' && ! HURON_PERSON_LNAME) {
            console.error('Please set HURON_PERSON_LNAME for last name filter');
            return;
          }
          const options: ReadPeopleOptions = {
            filters: [
              ReadPeople.createFilter({ 
                field: 'active', 
                value: 'true', 
                priority: 0, 
                logicalOperator: 'and', 
                comparisonOperator: 'eq' 
              }),
              ReadPeople.createFilter({ 
                field: HURON_PERSON_NAME_FILTER === 'first' ? 'firstName' : 'lastName', 
                value: HURON_PERSON_NAME_FILTER === 'first' ? HURON_PERSON_FNAME! : HURON_PERSON_LNAME!, 
                priority: 1, 
                logicalOperator: 'and', 
                comparisonOperator: 'eq' 
              })
            ],
            sort: ReadPeople.createSort({ 
              field: HURON_PERSON_NAME_FILTER === 'first' ? 'lastName' : 'firstName', 
              direction: 'desc' 
            }),
            pagination: { pageSize: 50 },
            includeFields: ['id', 'userId', 'sourceIdentifier', 'firstName', 'lastName', 'organization']
          };
          personData = await reader.readAllPeople(options);
          console.log(`Reading people by: ${HURON_PERSON_NAME_FILTER === 'first' ? HURON_PERSON_FNAME : HURON_PERSON_LNAME}`);

          break;
        default:
          console.error('Please set HURON_PERSON_NAME_FILTER to one of: full, first, last');
          return;
      }
    }

    console.log(`Retrieved ${Array.isArray(personData) ? personData.length : 1} person records.`);
    console.log(JSON.stringify(personData, null, 2));
  } catch (error) {
    console.error('Error retrieving people data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export {
  PeopleListResponse, ReadPeople,
  ReadPeopleOptions
};
