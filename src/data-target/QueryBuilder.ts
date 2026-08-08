/**
 * Pagination parameters for bulk retrieval
 */
export interface PaginationParams {
  offset?: number;
  pageSize?: number;
  total?: number;
  continuationToken?: string;
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort specification
 */
export interface SortSpec {
  field: string;
  direction?: SortDirection;
}

/**
 * Logical operators for filters
 */
export type LogicalOperator = 'and' | 'or';

/**
 * Comparison operators for filters
 */
export type ComparisonOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'null' | 'in';

/**
 * Individual filter specification
 */
export interface FilterSpec {
  field: string;
  logicalOperator: LogicalOperator;
  comparisonOperator: ComparisonOperator;
  value: string;
  priority: number;
}

/**
 * Options for query building
 */
export interface QueryOptions {
  pagination?: PaginationParams;
  sort?: SortSpec;
  filters?: FilterSpec[];
  includeFields?: string[];
  filterFields: Set<string>;
}

/**
 * Options for building query parameters (without filterFields since they're set in constructor)
 */
export interface BuildQueryOptions {
  pagination?: PaginationParams;
  sort?: SortSpec;
  filters?: FilterSpec[];
  includeFields?: string[];
}

/**
 * Class for building query parameters for Huron API requests
 */
export class QueryBuilder {
  private filterFields: Set<string>;
  private sortFields: Set<string>;

  constructor(filterFields: Set<string>, sortFields: Set<string>) {
    this.filterFields = filterFields;
    this.sortFields = sortFields;
  }

  /**
   * Build query parameters object from options
   * @param options The query options
   * @returns Object containing query parameters
   */
  buildQueryParams(options: BuildQueryOptions = {}): Record<string, any> {
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
      if (!this.sortFields.has(options.sort.field)) {
        throw new Error(`Invalid sort field: ${options.sort.field}. Allowed fields: ${Array.from(this.sortFields).join(', ')}`);
      }
      params.sort = options.sort.direction === 'asc' ? `-${options.sort.field}` : options.sort.field;
    }

    // Add filter parameters
    if (options.filters && options.filters.length > 0) {
      for (const filter of options.filters) {
        if (!this.filterFields.has(filter.field)) {
          throw new Error(`Invalid filter field: ${filter.field}. Allowed fields: ${Array.from(this.filterFields).join(', ')}`);
        }
        let filterKey;
        if(filter.field.startsWith('[') && filter.field.endsWith(']')) {
          filterKey = `filter${filter.field}`
        }
        else {
          filterKey = `filter[${filter.priority}!${filter.field}!${filter.logicalOperator}]`;
        }
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
  static createFilter(filter: {
    field: string,
    value: string,
    priority?: number,
    logicalOperator?: LogicalOperator,
    comparisonOperator?: ComparisonOperator
  }): FilterSpec {
    const { field, value, priority=0, logicalOperator='and', comparisonOperator='eq' } = filter;
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
  static createSort(params: { field: string, direction?: SortDirection }): SortSpec {
    const { field, direction = 'desc' } = params;
    return { field, direction };
  }
}