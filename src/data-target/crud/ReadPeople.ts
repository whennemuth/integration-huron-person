import { ApiClientForJWT, EndpointConfigForJWT } from '../ApiClientForJWT';
import { Config } from '../../config/Config';
import { SchemaPath } from '../SchemaBroker';
import { ConfigManager } from '../../config/ConfigManager';

/**
 * Pagination parameters for bulk person retrieval
 */
interface PaginationParams {
  offset?: number;
  pageSize?: number;
  continuationToken?: string;
}

/**
 * Sort options for person retrieval
 */
type SortField = 'firstName' | 'lastName' | 'userid' | 'dateModified' | 'dateCreated' | 'openPaymentsId' | 'contactInformation.email';

/**
 * Sort direction
 */
type SortDirection = 'asc' | 'desc';

/**
 * Sort specification
 */
interface SortSpec {
  field: SortField;
  direction?: SortDirection;
}

/**
 * Filter field names supported by the API
 */
type FilterField =
  | 'active'
  | 'allowLogin'
  | 'contactInformation.phone'
  | 'contactInformation.email'
  | 'additionalUnit'
  | 'additionalUnit.hrn'
  | 'secondaryUnit'
  | 'secondaryUnit.hrn'
  | 'employer'
  | 'employer.hrn'
  | 'organization'
  | 'organization.hrn'
  | 'externalToken'
  | 'externalTokenExpiresOn'
  | 'firstName'
  | 'hrn'
  | 'isInternal'
  | 'id'
  | 'lastName'
  | 'newUser'
  | 'openPaymentId'
  | 'roles'
  | 'rights'
  | 'showLoginTips'
  | 'sourceIdentifier'
  | 'tags'
  | 'userId';

/**
 * Logical operators for filters
 */
type LogicalOperator = 'and' | 'or';

/**
 * Comparison operators for filters
 */
type ComparisonOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'null' | 'in';

/**
 * Individual filter specification
 */
interface FilterSpec {
  field: FilterField;
  logicalOperator: LogicalOperator;
  comparisonOperator: ComparisonOperator;
  value: string;
  priority: number;
}

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
  data: any[];
  links?: {
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
}

/**
 * Options for bulk person retrieval
 */
interface ReadPeopleOptions {
  pagination?: PaginationParams;
  sort?: SortSpec;
  filters?: FilterSpec[];
  includeFields?: string[];
}

/**
 * Class for reading multiple Person records from the Huron API with filtering and sorting
 */
class ReadPeople {
  private apiClient: ApiClientForJWT;

  constructor(config: Config) {
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout
    };
    this.apiClient = new ApiClientForJWT(endpointConfig);
  }

  /**
   * Read multiple persons with optional filtering, sorting, and pagination
   * @param options Configuration options for the query
   * @returns Promise resolving to the PeopleListResponse containing paginated results
   */
  async readPeople(options: ReadPeopleOptions = {}): Promise<PeopleListResponse> {
    try {
      const queryParams = this.buildQueryParams(options);

      const response = await this.apiClient.get<PeopleListResponse>({
        url: SchemaPath.PERSONS,
        params: queryParams
      });

      if (response.status !== 200) {
        throw new Error(`Failed to read people: HTTP ${response.status} ${response.statusText}`);
      }

      return response.data;
    } catch (error) {
      console.error('Failed to read people:', error);
      throw new Error(`Failed to read people: ${error}`);
    }
  }

  /**
   * Read all people matching the criteria, handling pagination automatically
   * @param options Configuration options for the query
   * @returns Promise resolving to array of all matching Person records
   */
  async readAllPeople(options: Omit<ReadPeopleOptions, 'pagination'> = {}): Promise<any[]> {
    const allPeople: any[] = [];
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

  /**
   * Build query parameters object from options
   * @param options The read options
   * @returns Object containing query parameters for Axios
   */
  private buildQueryParams(options: ReadPeopleOptions): Record<string, any> {
    const params: Record<string, any> = {};

    // Add pagination parameters
    if (options.pagination) {
      if (options.pagination.offset !== undefined) {
        params['pagination[offset]'] = options.pagination.offset;
      }
      if (options.pagination.pageSize !== undefined) {
        params['pagination[pageSize]'] = options.pagination.pageSize;
      }
      if (options.pagination.continuationToken) {
        params['pagination[continuationToken]'] = options.pagination.continuationToken;
      }
    }

    // Add sort parameter
    if (options.sort) {
      params.sort = options.sort.direction === 'asc' ? `-${options.sort.field}` : options.sort.field;
    }

    // Add filter parameters
    if (options.filters && options.filters.length > 0) {
      for (const filter of options.filters) {
        const filterKey = `filter[${filter.priority}!${filter.field}!${filter.logicalOperator}]`;
        params[filterKey] = `${filter.comparisonOperator}:${filter.value}`;
      }
    }

    // Add include fields parameter
    if (options.includeFields && options.includeFields.length > 0) {
      params.include = options.includeFields.join(',');
    }

    return params;
  }

  /**
   * Helper method to create a simple filter specification
   * @param field The field to filter on
   * @param value The value to match
   * @param priority The filter priority (for multiple filters)
   * @param logicalOperator The logical operator (default: 'and')
   * @param comparisonOperator The comparison operator (default: 'eq')
   * @returns FilterSpec object
   */
  static createFilter(
    field: FilterField,
    value: string,
    priority: number = 0,
    logicalOperator: LogicalOperator = 'and',
    comparisonOperator: ComparisonOperator = 'eq'
  ): FilterSpec {
    return {
      field,
      logicalOperator,
      comparisonOperator,
      value,
      priority
    };
  }

  /**
   * Helper method to create a sort specification
   * @param field The field to sort by
   * @param direction The sort direction (default: 'desc')
   * @returns SortSpec object
   */
  static createSort(field: SortField, direction: SortDirection = 'desc'): SortSpec {
    return { field, direction };
  }
}

async function main() {
  const config = ConfigManager
    .getInstance()
    .fromEnvironment()
    .fromFileSystem()
    .getConfig();

  const reader = new ReadPeople(config);

  /**
   * Example 1: Read active users sorted by first name
   */
  const example1 = async () => {
    const options: ReadPeopleOptions = {
      filters: [
        ReadPeople.createFilter('active', 'true', 0, 'and', 'eq')
      ],
      sort: ReadPeople.createSort('lastName', 'asc'),
      pagination: { pageSize: 50 },
      includeFields: ['id', 'userId', 'firstName', 'lastName', 'organization']
    };
    const peopleResponse = await reader.readPeople(options);
    console.log(`Retrieved ${peopleResponse.data.length} people`);
    peopleResponse.data.forEach((person, index) => {
      const { firstName, lastName, id, userId, organization } = person;
      console.log(`${index + 1}. ${firstName} ${lastName} ${JSON.stringify({id, userId, organization})}`);
    });
    console.log('Pagination info:', peopleResponse.pagination);
  }

  /**
   * Example 2: Read all people with a specific last name
   */
  const example2 = async (lastName:string) => {
    const allPeople = await reader.readAllPeople({
      filters: [
        ReadPeople.createFilter('lastName', lastName, 0, 'and', 'eq')
      ],
      includeFields: ['id', 'userId', 'firstName', 'lastName', 'organization']
    });
    allPeople.forEach((person, index) => {
      const { firstName, lastName, id, userId, organization } = person;
      console.log(`${index + 1}. ${firstName} ${lastName} ${JSON.stringify({id, userId, organization})}`);
    });
  }

  try {
    // await example1();

    await example2('Hennemuth');

  } catch (error) {
    console.error('Error retrieving people data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export {
  ReadPeople,
  ReadPeopleOptions,
  FilterSpec,
  SortSpec,
  PaginationParams,
  PeopleListResponse,
  FilterField,
  SortField,
  LogicalOperator,
  ComparisonOperator
};