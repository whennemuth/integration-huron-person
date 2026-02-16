import { BasicCache } from '../../Cache';
import { Config } from '../../config/Config';
import { ConfigManager } from '../../config/ConfigManager';
import { ApiClientForJWT, EndpointConfigForJWT } from '../ApiClientForJWT';
import { BuildQueryOptions, FilterSpec, QueryBuilder } from '../QueryBuilder';
import { SchemaPath } from '../SchemaBroker';
import { HuronOrganization } from './Organization';

/**
 * Response structure for bulk organization retrieval
 */
interface OrganizationsListResponse {
  pagination: {
    offset: number;
    pageSize: number;
    total: number;
    continuationToken?: string;
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
  data: HuronOrganization[];
  links?: {
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
}

/**
 * Options for bulk organization retrieval
 */
type ReadOrganizationsOptions = BuildQueryOptions;

/**
 * Class for reading multiple Organization records from the Huron API with filtering and sorting
 */
class ReadOrganizations {
  private apiClient: ApiClientForJWT;
  private queryBuilder: QueryBuilder;

  constructor(config: Config, queryBuilder?: QueryBuilder) {
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout
    };
    const cache = config.cache?.enabled ? BasicCache.getInstance(config.cache.path) : undefined;    
    this.apiClient = new ApiClientForJWT(endpointConfig, cache);
    
    // Define filter and sort fields as Sets
    const filterFields = new Set([
      'name', 'id', 'sourceIdentifier', 'active', 'isInternal', 'isForeign', 'isPubliclyTraded',
      'parent.hrn', 'category.hrn', 'alias', 'functions.hrn', 'notes',
      'contactInformation.addressLine1', 'contactInformation.addressLine2', 'contactInformation.city',
      'contactInformation.stateProvince.hrn', 'contactInformation.postalCode', 'contactInformation.country.hrn',
      'contactInformation.phone', 'contactInformation.email', 'contactInformation.website',
      'customProperties', 'tags.hrn'
    ]);
    
    const sortFields = new Set([
      'name', 'id', 'sourceIdentifier', 'active', 'isInternal', 'isForeign', 'isPubliclyTraded',
      'dateCreated', 'dateModified', 'parent.name', 'category.name', 'contactInformation.city',
      'contactInformation.stateProvince.name', 'contactInformation.country.name'
    ]);
    
    this.queryBuilder = queryBuilder || new QueryBuilder(filterFields, sortFields);
  }

  /**
   * Read multiple organizations with optional filtering, sorting, and pagination
   * @param options Configuration options for the query
   * @returns Promise resolving to the OrganizationsListResponse containing paginated results
   */
  public async readOrganizations(options: ReadOrganizationsOptions = {}): Promise<OrganizationsListResponse> {
    try {
      const queryParams = this.queryBuilder.buildQueryParams(options);

      const response = await this.apiClient.get<OrganizationsListResponse>({
        url: SchemaPath.ORGANIZATIONS,
        params: queryParams
      });

      if (response.status !== 200) {
        throw new Error(`Failed to read organizations: HTTP ${response.status} ${response.statusText}`);
      }

      return response.data;
    } catch (error) {
      console.error('Failed to read organizations:', error);
      throw new Error(`Failed to read organizations: ${error}`);
    }
  }

    /**
   * Read all organizations matching the criteria, handling pagination automatically
   * @param options Configuration options for the query
   * @returns Promise resolving to array of all matching Organization records
   */
  public async readAllOrganizationsNonTokenized(options: Omit<ReadOrganizationsOptions, 'pagination'> = {}): Promise<HuronOrganization[]> {
    const allOrganizations: HuronOrganization[] = [];
    let offset = 0;
    const pageSize = 100; // Use larger page size for efficiency

    do {
      const paginationOptions: ReadOrganizationsOptions = {
        ...options,
        pagination: {
          pageSize,
          offset
        }
      };

      const response = await this.readOrganizations(paginationOptions);
      allOrganizations.push(...response.data);

      // If we got fewer items than requested, we've reached the last page
      if (response.data.length < pageSize) {
        break;
      }

      // Move to next page
      offset += pageSize;
    } while (true);

    return allOrganizations;
  }

  /**
   * Read all organizations matching the criteria, handling pagination automatically
   * @param options Configuration options for the query
   * @returns Promise resolving to array of all matching Organization records
   */
  public async readAllOrganizations(options: Omit<ReadOrganizationsOptions, 'pagination'> = {}): Promise<HuronOrganization[]> {
    const allOrganizations: HuronOrganization[] = [];
    let continuationToken: string | undefined;

    do {
      const paginationOptions: ReadOrganizationsOptions = {
        ...options,
        pagination: {
          pageSize: 100, // Use larger page size for efficiency
          continuationToken
        }
      };

      const response = await this.readOrganizations(paginationOptions);
      allOrganizations.push(...response.data);

      continuationToken = response.pagination.continuationToken;
    } while (continuationToken);

    return allOrganizations;
  }

  public async readOrganizationsByFilterField(filterField:string, inArray:string[], options: Omit<ReadOrganizationsOptions, 'pagination'> = {}): Promise<HuronOrganization[]> {
    if(!this.queryBuilder['filterFields'].has(filterField)) {
      throw new Error(`Invalid filter field: ${filterField}. Allowed fields: ${Array.from(this.queryBuilder['filterFields']).join(', ')}`);
    }
    
    // Convert array to comma-delimited string for the "in" operator
    const inValue = inArray.join(',');
    
    // Create filter using the "in" operator
    const filter = ReadOrganizations.createFilter({
      field: filterField,
      value: inValue,
      comparisonOperator: 'in'
    });
    
    // Call readAllOrganizations with the filter
    return await this.readAllOrganizations({
      ...options,
      filters: [filter, ...(options.filters || [])]
    });
  }

  /**
   * Helper method to create a simple filter specification
   * @param filter Filter specification with field and value
   * @returns FilterSpec object
   */
  public static createFilter(filter: {
    field: string;
    value: string;
    priority?: number;
    logicalOperator?: 'and' | 'or';
    comparisonOperator?: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'null' | 'in';
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
  const config = ConfigManager.
    getInstance()
    .fromEnvironment()
    .fromFileSystem()
    .getConfig('nobody');

  const reader = new ReadOrganizations(config);

  try {
    // // Example: Read all organizations
    // console.log('Reading all organizations...');
    // const allOrganizations = await reader.readAllOrganizationsTokenized();
    // console.log(`Found ${allOrganizations.length} organizations`);

    console.log('Reading organizations who match the "in" filter on id field...');
    const orgsInFilter = await reader.readOrganizationsByFilterField('id', [
      '10005944',
      '10000477',
      '10004680',
      '10001021',
      '10003951',
      '10003353',
      '10006927',
      '10002222',
      '10002118',
      '10001195',
      '10007085',
      '00000000',
      '10001077',
      '10008083',
      '10000273',
      '10003253',
      '10003826',
      '10004679',
      '10000950',
      '10001487'
    ]);
    console.log(orgsInFilter, null, 2);
    console.log(`Found ${orgsInFilter.length} organizations matching the "in" filter on id field`);
    
    // // Example: Read organizations with pagination
    // console.log('\\nReading organizations with pagination...');
    // const response = await reader.readOrganizations({
    //   pagination: { pageSize: 10, offset: 1 }
    // });
    // console.log(`Page: ${response.pagination.offset}, Size: ${response.pagination.pageSize}, Total: ${response.pagination.total}`);
    // console.log(`Organizations on this page: ${response.data.length}`);

    // // Example: Read organizations with filtering
    // console.log('\\nReading active organizations...');
    // const activeOrgs = await reader.readAllOrganizations({
    //   filters: [
    //     ReadOrganizations.createFilter({ field: 'active', value: 'true' })
    //   ]
    // });
    // console.log(`Found ${activeOrgs.length} active organizations`);

    // // Example: Read organizations with sorting
    // console.log('\nReading organizations sorted by name...');
    // const sortedOrgs = await reader.readOrganizations({
    //   sort: { field: 'name', direction: 'asc' },
    //   pagination: { pageSize: 5 }
    // });
    // console.log('First 5 organizations by name:');
    // sortedOrgs.data.forEach(org => console.log(`- ${org.name} (${org.id})`));

  } catch (error) {
    console.error('Error reading organizations:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { OrganizationsListResponse, ReadOrganizations, ReadOrganizationsOptions };