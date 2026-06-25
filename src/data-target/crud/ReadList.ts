import { BasicCache } from '../../Cache';
import { Config } from '../../config/Config';
import { ConfigManager } from '../../config/ConfigManager';
import { getLocalConfig } from '../../Utils';
import { ApiClientForJWT, EndpointConfigForJWT, TargetApiErrorEventProcessor } from '../ApiClientForJWT';
import { BuildQueryOptions, QueryBuilder } from '../QueryBuilder';
import { TestEnvironment } from 'integration-core';

/**
 * Interface for List Type (the list definition itself)
 */
export interface HuronList {
  id: string;
  name: string;
  moduleId?: string;
  description?: string;
  defaultItemPermissions: {
    fullAccess: boolean;
    editLockedItemAttributes?: string[];
    createUnlockedItem?: boolean;
    deleteUnlockedItem?: boolean;
  };
  secureWithRights?: boolean;
  active?: boolean;
  customPropertiesSchema?: Record<string, any>;
  displayOrder?: number;
  dateCreated?: string;
  dateModified?: string;
  hrsOwned?: boolean;
  hrn?: string;
}

/**
 * Interface for List Item (an item within a list type)
 */
export interface HuronListItem {
  id: string;
  name: string;
  moduleId?: string[];
  description?: string;
  listId?: string;
  active?: boolean;
  displayOrder?: number;
  customProperties?: Record<string, any>;
  dateCreated?: string;
  dateModified?: string;
  hrsOwned?: boolean;
  hrn?: string;
}

/**
 * Response structure for bulk list type retrieval
 */
interface ListTypesResponse {
  pagination: {
    offset: number;
    pageSize: number;
    total: number;
    continuationToken?: string;
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
  data: HuronList[];
  links?: {
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
}

/**
 * Response structure for bulk list item retrieval
 */
interface ListItemsResponse {
  pagination: {
    offset: number;
    pageSize: number;
    total: number;
    continuationToken?: string;
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
  filters?: {
    fieldName?: string;
    value?: string;
    operation?: string;
  };
  sorts?: {
    fieldName?: string;
    order?: string;
  };
  data: HuronListItem[];
  links?: {
    next?: string;
    prev?: string;
    nextWithContinuationToken?: string;
  };
}

/**
 * Options for list type and list item retrieval
 */
type ReadListsOptions = BuildQueryOptions;

/**
 * Class for reading List types and List items from the Huron API
 */
export class ReadList {
  private apiClient: ApiClientForJWT;
  private listTypesQueryBuilder: QueryBuilder;
  private listItemsQueryBuilder: QueryBuilder;

  constructor(config: Config, errorEventProcessor?: TargetApiErrorEventProcessor) {
    const endpointConfig: EndpointConfigForJWT = {
      ...config.dataTarget.endpointConfig,
      timeout: config.dataTarget.endpointConfig.timeout || config.integration.timeout,
      errorEventProcessor: errorEventProcessor || config.dataTarget.endpointConfig.errorEventProcessor
    };
    const cache = BasicCache.getInstance(config);
    this.apiClient = new ApiClientForJWT(endpointConfig, cache );

    // Define filter and sort fields for list types
    const listTypeFilterFields = new Set([
      'active',
      'name',
      'hrsowned',
      'id',
      'defaultItemPermissions.fullAccess'
    ]);

    const listTypeSortFields = new Set([
      'name',
      'id'
    ]);

    // Define filter and sort fields for list items
    const listItemFilterFields = new Set([
      'active',
      'name',
      'id',
      'hrsowned',
      'moduleid'
    ]);

    const listItemSortFields = new Set([
      'id',
      'name',
      'displayOrder',
      'description',
      'active',
      'dateCreated',
      'dateModified',
      'hrsOwned'
    ]);

    this.listTypesQueryBuilder = new QueryBuilder(listTypeFilterFields, listTypeSortFields);
    this.listItemsQueryBuilder = new QueryBuilder(listItemFilterFields, listItemSortFields);
  }

  /**
   * Read list types with optional filtering, sorting, and pagination
   * @param options Configuration options for the query
   * @returns Promise resolving to the ListTypesResponse containing paginated results
   */
  public async readListTypes(options: ReadListsOptions = {}): Promise<ListTypesResponse> {
    const queryParams = this.listTypesQueryBuilder.buildQueryParams(options);

    this.apiClient.setErrorEventDetails({ 
      message: 'Huron list types retrieval error', 
      object: { queryParams } }
    );
    const response = await this.apiClient.get<ListTypesResponse>({
      url: '/api/v1/lists',
      params: queryParams
    });

    if (response.status !== 200) {
      throw new Error(`Failed to read list types: HTTP ${response.status} ${response.statusText}`);
    }

    return response.data;
  }

  /**
   * Read all list types matching the criteria, handling pagination automatically
   * Note: Uses non-tokenized pagination as tokenized method is not yet supported
   * 
   * @param options Configuration options for the query
   * @returns Promise resolving to array of all matching List type records
   */
  public async readAllListTypesNonTokenized(options: ReadListsOptions = {}): Promise<HuronList[]> {
    const allListTypes: HuronList[] = [];
    const { pagination: { pageSize = 100 } = {} } = options;
    let offset = 0;

    do {
      const paginationOptions: ReadListsOptions = {
        ...options,
        pagination: {
          pageSize,
          offset
        }
      };

      const response = await this.readListTypes(paginationOptions);
      allListTypes.push(...response.data);
      console.log(`Fetched page ${offset} with ${response.data.length} list types (Total so far: ${allListTypes.length})`);

      // If we got fewer items than requested, we've reached the last page
      if (response.data.length < pageSize) {
        break;
      }

      // Move to next page
      offset += 1;
    } while (true);

    return allListTypes;
  }

  /**
   * Read list items for a specific list type with optional filtering, sorting, and pagination
   * 
   * @param listTypeHrn The HRN of the list type to retrieve items for
   * @param options Configuration options for the query
   * @returns Promise resolving to the ListItemsResponse containing paginated results
   */
  public async readListItems(listTypeHrn: string, options: ReadListsOptions = {}): Promise<ListItemsResponse> {
    const queryParams = this.listItemsQueryBuilder.buildQueryParams(options);

    // Encode the HRN for use in the URL path
    const encodedHrn = encodeURIComponent(listTypeHrn);
    this.apiClient.setErrorEventDetails({ 
      message: `Huron list items retrieval error for list type ${listTypeHrn}`, 
      object: { queryParams, listTypeHrn } 
    });
    const response = await this.apiClient.get<ListItemsResponse>({
      url: `/api/v1/lists/${encodedHrn}/items`,
      params: queryParams
    });

    if (response.status !== 200) {
      throw new Error(`Failed to read list items for ${listTypeHrn}: HTTP ${response.status} ${response.statusText}`);
    }

    return response.data;
  }

  /**
   * Read all list items for a specific list type, handling pagination automatically
   * Note: Uses non-tokenized pagination as tokenized method is not yet supported
   * 
   * @param listTypeHrn The HRN of the list type to retrieve items for
   * @param options Configuration options for the query
   * @returns Promise resolving to array of all matching List item records
   */
  public async readAllListItemsNonTokenized(
    listTypeHrn: string,
    options: ReadListsOptions = {}
  ): Promise<HuronListItem[]> {
    const allListItems: HuronListItem[] = [];
    const { pagination: { pageSize = 100 } = {} } = options;
    let offset = 0;

    do {
      const paginationOptions: ReadListsOptions = {
        ...options,
        pagination: {
          pageSize,
          offset
        }
      };

      const response = await this.readListItems(listTypeHrn, paginationOptions);
      allListItems.push(...response.data);
      console.log(`Fetched page ${offset} with ${response.data.length} list items for ${listTypeHrn} (Total so far: ${allListItems.length})`);

      // If we got fewer items than requested, we've reached the last page
      if (response.data.length < pageSize) {
        break;
      }

      // Move to next page
      offset += 1;
    } while (true);

    return allListItems;
  }

  /**
   * Convenience method to read a specific list type by its ID
   * 
   * @param listId The ID of the list type to retrieve
   * @returns Promise resolving to the HuronList or undefined if not found
   */
  public async readListTypeById(listId: string): Promise<HuronList | undefined> {
    try {
      const response = await this.readListTypes({
        filters: [
          QueryBuilder.createFilter({
            field: 'id',
            value: listId,
            comparisonOperator: 'eq'
          })
        ]
      });

      return response.data.length > 0 ? response.data[0] : undefined;
    } catch (error) {
      console.error(`Failed to read list type with ID ${listId}:`, error);
      throw error;
    }
  }

  /**
   * Convenience method to read a specific list type by its name
   * 
   * @param listName The name of the list type to retrieve
   * @returns Promise resolving to the HuronList or undefined if not found
   */
  public async readListTypeByName(listName: string): Promise<HuronList | undefined> {
    try {
      const response = await this.readListTypes({
        filters: [
          QueryBuilder.createFilter({
            field: 'name',
            value: listName,
            comparisonOperator: 'eq'
          })
        ]
      });

      return response.data.length > 0 ? response.data[0] : undefined;
    } catch (error) {
      console.error(`Failed to read list type with name ${listName}:`, error);
      throw error;
    }
  }
}

/**
 * Main function for testing ReadList functionality via environment variables
 * 
 * Environment Variables:
 * - HURON_LIST_TASK: The task to perform (required)
 *   - 'list-types': Get all list types
 *   - 'list-type-by-id': Get a specific list type by ID
 *   - 'list-type-by-name': Get a specific list type by name
 *   - 'list-items': Get items for a specific list type (single page)
 *   - 'all-list-items': Get all items for a specific list type (all pages)
 * 
 * - HURON_LIST_TYPE_ID: List type ID (for 'list-type-by-id' task)
 * - HURON_LIST_TYPE_NAME: List type name (for 'list-type-by-name' task)
 * - HURON_LIST_TYPE_HRN: List type HRN (for 'list-items' and 'all-list-items' tasks)
 * - HURON_LIST_PAGE_SIZE: Optional page size for pagination (default: 100)
 * - HURON_LIST_FILTER_ACTIVE: Optional filter for active status (true/false)
 * - HURON_LIST_SORT_FIELD: Optional field to sort by (e.g., 'name', 'id')
 * - HURON_LIST_SORT_DIRECTION: Optional sort direction ('asc' or 'desc', default: 'desc')
 * - HURON_LIST_OUTPUT_FILE: Optional file path to write output JSON data.
 */
async function main() {
  const {
    HURON_PERSON_CONFIG_PATH: configPath,
    HURON_LIST_TASK,
    HURON_LIST_TYPE_ID,
    HURON_LIST_TYPE_NAME,
    HURON_LIST_TYPE_HRN,
    HURON_LIST_PAGE_SIZE,
    HURON_LIST_FILTER_ACTIVE,
    HURON_LIST_SORT_FIELD,
    HURON_LIST_SORT_DIRECTION,
    HURON_LIST_OUTPUT_FILE
  } = process.env;  
  
  const localConfigPath = configPath || getLocalConfig();
  const config = ConfigManager
    .getInstance()
    .fromEnvironment()
    .fromFileSystem(localConfigPath)
    .getConfig('none');

  const reader = new ReadList(config);


  // Build options from environment variables
  const buildOptions = (): ReadListsOptions => {
    const options: ReadListsOptions = {};

    // Add pagination if page size is specified
    if (HURON_LIST_PAGE_SIZE) {
      options.pagination = {
        pageSize: parseInt(HURON_LIST_PAGE_SIZE, 10)
      };
    }

    // Add active filter if specified
    if (HURON_LIST_FILTER_ACTIVE) {
      options.filters = options.filters || [];
      options.filters.push(
        QueryBuilder.createFilter({
          field: 'active',
          value: HURON_LIST_FILTER_ACTIVE,
          comparisonOperator: 'eq'
        })
      );
    }

    // Add sort if specified
    if (HURON_LIST_SORT_FIELD) {
      options.sort = QueryBuilder.createSort({
        field: HURON_LIST_SORT_FIELD,
        direction: (HURON_LIST_SORT_DIRECTION as 'asc' | 'desc') || 'desc'
      });
    }

    return options;
  };

  let resultData: any;

  let payloadLogger: () => void;
  const logResult = (logPayload: () => void) => {
    console.log('\n' + '='.repeat(80));
    console.log('Retrieved Data:');
    console.log('='.repeat(80));
    logPayload();
    if (HURON_LIST_OUTPUT_FILE) {
      const fs = require('fs');
      fs.writeFileSync(HURON_LIST_OUTPUT_FILE, JSON.stringify(resultData, null, 2));
      console.log(`\nOutput written to ${HURON_LIST_OUTPUT_FILE}`);
    }
  }

  try {
    switch (HURON_LIST_TASK) {
      case 'list-types':
      case 'list-types-abbrev':
        console.log('Reading all list types...');
        const options = buildOptions();
        resultData = await reader.readAllListTypesNonTokenized(options);
        payloadLogger = HURON_LIST_TASK === 'list-types' ?
          () => console.log(JSON.stringify(resultData, null, 2)) :
          () => resultData.forEach((list: HuronList) => {
            console.log(JSON.stringify({ id: list.id, name: list.name, moduleId: list.moduleId }));
          });
        logResult(payloadLogger);
        console.log(`Retrieved ${resultData.length} list types`);
        break;

      case 'list-type-by-id':
        if (!HURON_LIST_TYPE_ID) {
          console.error('HURON_LIST_TYPE_ID is required for list-type-by-id task');
          return;
        }
        console.log(`Reading list type by ID: ${HURON_LIST_TYPE_ID}`);
        resultData = await reader.readListTypeById(HURON_LIST_TYPE_ID);
        if (resultData) {
          console.log('Found list type');
        } else {
          console.log('List type not found');
        }
        logResult(() => console.log(JSON.stringify(resultData, null, 2)));
        break;

      case 'list-type-by-name':
        if (!HURON_LIST_TYPE_NAME) {
          console.error('HURON_LIST_TYPE_NAME is required for list-type-by-name task');
          return;
        }
        console.log(`Reading list type by name: ${HURON_LIST_TYPE_NAME}`);
        resultData = await reader.readListTypeByName(HURON_LIST_TYPE_NAME);
        if (resultData) {
          console.log('Found list type');
        } else {
          console.log('List type not found');
        }
        logResult(() => console.log(JSON.stringify(resultData, null, 2)));
        break;

      case 'list-items':
        if (!HURON_LIST_TYPE_HRN) {
          console.error('HURON_LIST_TYPE_HRN is required for list-items task');
          return;
        }
        console.log(`Reading list items for: ${HURON_LIST_TYPE_HRN}`);
        const itemsOptions = buildOptions();
        const itemsResponse = await reader.readListItems(HURON_LIST_TYPE_HRN, itemsOptions);
        resultData = itemsResponse.data;
        console.log(`Retrieved ${resultData.length} list items (page ${itemsResponse.pagination.offset})`);
        console.log(`Total available: ${itemsResponse.pagination.total}`);
        logResult(() => console.log(JSON.stringify(resultData, null, 2)));
        break;

      case 'all-list-items':
      case 'all-list-items-abbrev':
        if (!HURON_LIST_TYPE_HRN) {
          console.error('HURON_LIST_TYPE_HRN is required for all-list-items task');
          return;
        }
        console.log(`Reading all list items for: ${HURON_LIST_TYPE_HRN}`);
        const allItemsOptions = buildOptions();
        payloadLogger = HURON_LIST_TASK === 'all-list-items' ?
          () => console.log(JSON.stringify(resultData, null, 2)) :
          () => resultData.forEach((list: any) => {
            const { id, name, description, customProperties: { country: { hrn: countryHrn } = {}, stateCode } = {} } = list;
            console.log(JSON.stringify({ id, name, description, countryHrn, stateCode }));
          });
        resultData = await reader.readAllListItemsNonTokenized(HURON_LIST_TYPE_HRN, allItemsOptions);
        console.log(`Retrieved ${resultData.length} total list items`);
        logResult(payloadLogger);
        break;

      default:
        console.error('Please set HURON_LIST_TASK to one of:');
        console.error('  - list-types: Get all list types');
        console.error('  - list-type-by-id: Get a specific list type by ID (requires HURON_LIST_TYPE_ID)');
        console.error('  - list-type-by-name: Get a specific list type by name (requires HURON_LIST_TYPE_NAME)');
        console.error('  - list-items: Get items for a specific list type (requires HURON_LIST_TYPE_HRN)');
        console.error('  - all-list-items: Get all items for a specific list type (requires HURON_LIST_TYPE_HRN)');
        return;
    }

  } catch (error) {
    console.error('Error executing list operation:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('READ_LIST');

  [
    'HURON_LIST_FILTER_ACTIVE',
    'HURON_LIST_OUTPUT_FILE',
    'HURON_LIST_PAGE_SIZE',
    'HURON_LIST_SORT_DIRECTION',
    'HURON_LIST_SORT_FIELD',
    'HURON_LIST_TASK',
    'HURON_LIST_TYPE_HRN',
    'HURON_LIST_TYPE_ID',
    'HURON_LIST_TYPE_NAME'
  ].forEach(testEnvironment.getVarOrEmptyString);

  main();
}


