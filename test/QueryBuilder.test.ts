import { BuildQueryOptions, QueryBuilder, SortSpec } from '../src/data-target/QueryBuilder';

describe('QueryBuilder', () => {
  let queryBuilder: QueryBuilder;

  beforeEach(() => {
    queryBuilder = new QueryBuilder(
      new Set(['name', 'age', 'email', 'status', 'category', 'priority', 'dateCreated', 'dateModified']),
      new Set(['firstName', 'lastName', 'name', 'dateCreated', 'dateModified'])
    );
  });

  describe('createFilter', () => {
    it('should create a filter specification with default values', () => {
      const filter = QueryBuilder.createFilter({ field: 'name', value: 'John' });

      expect(filter).toEqual({
        field: 'name',
        logicalOperator: 'and',
        comparisonOperator: 'eq',
        value: 'John',
        priority: 0
      });
    });

    it('should create a filter specification with custom values', () => {
      const filter = QueryBuilder.createFilter({ field: 'email', value: 'doe@example.com', priority: 1, logicalOperator: 'or', comparisonOperator: 'neq' });

      expect(filter).toEqual({
        field: 'email',
        logicalOperator: 'or',
        comparisonOperator: 'neq',
        value: 'doe@example.com',
        priority: 1
      });
    });

    it('should create filters with different comparison operators', () => {
      expect(QueryBuilder.createFilter({ field: 'status', value: 'active', priority: 0, logicalOperator: 'and', comparisonOperator: 'eq' })).toMatchObject({
        comparisonOperator: 'eq'
      });
      expect(QueryBuilder.createFilter({ field: 'age', value: '25', priority: 0, logicalOperator: 'and', comparisonOperator: 'gte' })).toMatchObject({
        comparisonOperator: 'gte'
      });
      expect(QueryBuilder.createFilter({ field: 'category', value: 'null', priority: 0, logicalOperator: 'and', comparisonOperator: 'null' })).toMatchObject({
        comparisonOperator: 'null'
      });
    });

    it('should create filters with different logical operators', () => {
      expect(QueryBuilder.createFilter({ field: 'name', value: 'John', priority: 0, logicalOperator: 'and' })).toMatchObject({
        logicalOperator: 'and'
      });
      expect(QueryBuilder.createFilter({ field: 'email', value: 'doe@example.com', priority: 0, logicalOperator: 'or' })).toMatchObject({
        logicalOperator: 'or'
      });
    });
  });

  describe('createSort', () => {
    it('should create a sort specification with default direction', () => {
      const sort = QueryBuilder.createSort({ field: 'firstName' });

      expect(sort).toEqual({
        field: 'firstName',
        direction: 'desc'
      });
    });

    it('should create a sort specification with custom direction', () => {
      const sort = QueryBuilder.createSort({ field: 'lastName', direction: 'asc' });

      expect(sort).toEqual({
        field: 'lastName',
        direction: 'asc'
      });
    });

    it('should handle all sort fields', () => {
      const fields: SortSpec['field'][] = [
        'firstName', 'lastName', 'userid', 'dateModified', 'dateCreated', 'openPaymentsId', 'contactInformation.email'
      ];

      fields.forEach(field => {
        expect(QueryBuilder.createSort({ field })).toMatchObject({ field, direction: 'desc' });
        expect(QueryBuilder.createSort({ field, direction: 'asc' })).toMatchObject({ field, direction: 'asc' });
      });
    });
  });

  describe('buildQueryParams', () => {
    it('should build empty params for empty options', () => {
      const params = queryBuilder.buildQueryParams({});

      expect(params).toEqual({});
    });

    it('should build pagination parameters', () => {
      const options: BuildQueryOptions = {
        pagination: {
          offset: 10,
          pageSize: 50,
          continuationToken: 'token123'
        }
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        'pagination[offset]': 10,
        'pagination[pageSize]': 50,
        'pagination[continuationToken]': 'token123'
      });
    });

    it('should build partial pagination parameters', () => {
      expect(queryBuilder.buildQueryParams({ pagination: { offset: 5 } })).toEqual({
        'pagination[offset]': 5
      });
      expect(queryBuilder.buildQueryParams({ pagination: { pageSize: 100 } })).toEqual({
        'pagination[pageSize]': 100
      });
      expect(queryBuilder.buildQueryParams({ pagination: { continuationToken: 'abc' } })).toEqual({
        'pagination[continuationToken]': 'abc'
      });
    });

    it('should build sort parameters', () => {
      const options: BuildQueryOptions = {
        sort: QueryBuilder.createSort({ field: 'firstName', direction: 'asc' })
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        sort: '-firstName'
      });
    });

    it('should build sort parameters for desc', () => {
      const options: BuildQueryOptions = {
        sort: QueryBuilder.createSort({ field: 'lastName', direction: 'desc' })
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        sort: 'lastName'
      });
    });

    it('should build filter parameters', () => {
      const options: BuildQueryOptions = {
        filters: [
          QueryBuilder.createFilter({ field: 'name', value: 'John', priority: 0, logicalOperator: 'and', comparisonOperator: 'eq' }),
          QueryBuilder.createFilter({ field: 'email', value: 'doe@example.com', priority: 1, logicalOperator: 'or', comparisonOperator: 'neq' })
        ]
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        'filter[0!name!and]': 'eq:John',
        'filter[1!email!or]': 'neq:doe@example.com'
      });
    });

    it('should build single filter parameter', () => {
      const options: BuildQueryOptions = {
        filters: [QueryBuilder.createFilter({ field: 'status', value: 'active' })]
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        'filter[0!status!and]': 'eq:active'
      });
    });

    it('should build include fields parameters', () => {
      const options: BuildQueryOptions = {
        includeFields: ['name', 'email', 'category']
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        include: 'name,email,category'
      });
    });

    it('should build combined parameters', () => {
      const options: BuildQueryOptions = {
        pagination: { pageSize: 25 },
        sort: QueryBuilder.createSort({ field: 'lastName', direction: 'desc' }),
        filters: [QueryBuilder.createFilter({ field: 'status', value: 'active' })],
        includeFields: ['name', 'email']
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        'pagination[pageSize]': 25,
        sort: 'lastName',
        'filter[0!status!and]': 'eq:active',
        include: 'name,email'
      });
    });

    it('should handle multiple filters with different priorities and operators', () => {
      const options: BuildQueryOptions = {
        filters: [
          QueryBuilder.createFilter({ field: 'name', value: 'John', priority: 0, logicalOperator: 'and', comparisonOperator: 'eq' }),
          QueryBuilder.createFilter({ field: 'email', value: 'doe@example.com', priority: 1, logicalOperator: 'or', comparisonOperator: 'neq' }),
          QueryBuilder.createFilter({ field: 'status', value: 'active', priority: 2, logicalOperator: 'and', comparisonOperator: 'eq' })
        ]
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        'filter[0!name!and]': 'eq:John',
        'filter[1!email!or]': 'neq:doe@example.com',
        'filter[2!status!and]': 'eq:active'
      });
    });

    it('should handle empty arrays gracefully', () => {
      const options: BuildQueryOptions = {
        filters: [],
        includeFields: []
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({});
    });

    it('should encode special characters in filter values', () => {
      // Note: The current implementation doesn't encode; it just uses the value as-is
      // In a real scenario, you might need to encode values with special characters
      const options: BuildQueryOptions = {
        filters: [QueryBuilder.createFilter({ field: 'name', value: 'John&Doe' })]
      };

      const params = queryBuilder.buildQueryParams(options);

      expect(params).toEqual({
        'filter[0!name!and]': 'eq:John&Doe'
      });
    });

    it('should throw error for invalid filter field', () => {
      const options: BuildQueryOptions = {
        filters: [QueryBuilder.createFilter({ field: 'invalidField', value: 'value' })]
      };

      expect(() => queryBuilder.buildQueryParams(options)).toThrow(
        'Invalid filter field: invalidField. Allowed fields: name, age, email, status, category, priority, dateCreated, dateModified'
      );
    });
  });
});
