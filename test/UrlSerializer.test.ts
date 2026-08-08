import { serializeParams } from '../src/data-target/UrlSerializer';

describe('UrlSerializer', () => {
  describe('serializeParams', () => {
    describe('parameter name preservation', () => {
      it('should preserve brackets in parameter names', () => {
        const params = {
          'pagination[offset]': 0,
          'pagination[pageSize]': 10
        };
        const result = serializeParams(params);
        
        expect(result).toContain('pagination[offset]=0');
        expect(result).toContain('pagination[pageSize]=10');
        expect(result).not.toContain('%5B'); // Should not contain encoded bracket
        expect(result).not.toContain('%5D');
      });

      it('should preserve colons and exclamation marks in filter parameter names', () => {
        const params = {
          'filter[0!firstName!and]': 'eq:John'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[0!firstName!and]=eq:John');
        expect(result).not.toContain('%21'); // Should not contain encoded exclamation mark
      });

      it('should handle complex filter keys with priority, field, and operator', () => {
        const params = {
          'filter[1!status!or]': 'eq:active',
          'filter[2!category!and]': 'neq:archived'
        };
        const result = serializeParams(params);
        
        expect(result).toContain('filter[1!status!or]=eq:active');
        expect(result).toContain('filter[2!category!and]=neq:archived');
      });
    });

    describe('HRN value encoding', () => {
      it('should encode colons in HRN values', () => {
        const params = {
          'filter[roles]': 'eq:hrn:hrs:lists:roles/primary'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[roles]=eq:hrn%3Ahrs%3Alists%3Aroles%2Fprimary');
        expect(result).toContain('%3A'); // Encoded colon
      });

      it('should encode slashes in HRN values', () => {
        const params = {
          'filter[roles]': 'eq:hrn:hrs:lists:reviewer-roles/primary'
        };
        const result = serializeParams(params);
        
        expect(result).toContain('%2F'); // Encoded slash
        expect(result).toBe('filter[roles]=eq:hrn%3Ahrs%3Alists%3Areviewer-roles%2Fprimary');
      });

      it('should handle HRN values with complex paths', () => {
        const params = {
          'filter[organization]': 'eq:hrn:hrs:orgs:12345/department/sub-unit'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[organization]=eq:hrn%3Ahrs%3Aorgs%3A12345%2Fdepartment%2Fsub-unit');
      });

      it('should preserve comparison operator before HRN', () => {
        const params = {
          'filter[employer]': 'in:hrn:hrs:orgs:100'
        };
        const result = serializeParams(params);
        
        expect(result).toContain('in:hrn%3Ahrs%3Aorgs%3A100');
        expect(result).not.toContain('in%3A'); // Operator should not be encoded
      });
    });

    describe('filter value encoding', () => {
      it('should preserve simple string values', () => {
        const params = {
          'filter[0!includeInactive!and]': 'eq:true'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[0!includeInactive!and]=eq:true');
      });

      it('should preserve boolean values', () => {
        const params = {
          'filter[active]': 'eq:false'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[active]=eq:false');
      });

      it('should preserve numeric values', () => {
        const params = {
          'filter[age]': 'gt:25'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[age]=gt:25');
      });

      it('should handle all comparison operators', () => {
        const operators = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'null', 'in'];
        
        operators.forEach(op => {
          const params = { [`filter[field]`]: `${op}:value` };
          const result = serializeParams(params);
          expect(result).toContain(`${op}:value`);
        });
      });

      it('should preserve commas in "in" operator values', () => {
        const params = {
          'filter[status]': 'in:active,pending,draft'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[status]=in:active,pending,draft');
        expect(result).not.toContain('%2C'); // Commas should not be encoded
      });

      it('should encode HRNs in "in" operator comma-separated list', () => {
        const params = {
          'filter[roles]': 'in:hrn:hrs:lists:role1,hrn:hrs:lists:role2'
        };
        const result = serializeParams(params);
        
        expect(result).toContain('in:hrn%3Ahrs%3Alists%3Arole1,hrn%3Ahrs%3Alists%3Arole2');
        expect(result).not.toContain('%2C'); // Commas should not be encoded
      });
    });

    describe('include parameter', () => {
      it('should preserve commas in include field list', () => {
        const params = {
          include: 'firstName,lastName,userId,employer,id,active,roles'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('include=firstName,lastName,userId,employer,id,active,roles');
        expect(result).not.toContain('%2C'); // Commas should not be encoded
      });

      it('should handle include with nested field names', () => {
        const params = {
          include: 'id,organization.name,employer.hrn'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('include=id,organization.name,employer.hrn');
      });
    });

    describe('pagination parameters', () => {
      it('should handle pagination offset and pageSize', () => {
        const params = {
          'pagination[offset]': 0,
          'pagination[pageSize]': 500
        };
        const result = serializeParams(params);
        
        expect(result).toContain('pagination[offset]=0');
        expect(result).toContain('pagination[pageSize]=500');
      });

      it('should handle pagination with continuation token', () => {
        const params = {
          'pagination[continuationToken]': 'abc123xyz'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('pagination[continuationToken]=abc123xyz');
      });
    });

    describe('sort parameter', () => {
      it('should preserve field name without encoding', () => {
        const params = {
          sort: 'firstName'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('sort=firstName');
      });

      it('should preserve dash prefix for descending sort', () => {
        const params = {
          sort: '-dateModified'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('sort=-dateModified');
      });
    });

    describe('edge cases', () => {
      it('should handle empty params object', () => {
        const params = {};
        const result = serializeParams(params);
        
        expect(result).toBe('');
      });

      it('should skip undefined values', () => {
        const params = {
          'filter[name]': 'eq:John',
          'filter[age]': undefined,
          'include': 'id,name'
        };
        const result = serializeParams(params);
        
        expect(result).not.toContain('filter[age]');
        expect(result).toContain('filter[name]=eq:John');
        expect(result).toContain('include=id,name');
      });

      it('should skip null values', () => {
        const params = {
          'filter[name]': 'eq:John',
          'filter[category]': null,
          'sort': 'firstName'
        };
        const result = serializeParams(params);
        
        expect(result).not.toContain('filter[category]');
        expect(result).toContain('filter[name]');
        expect(result).toContain('sort');
      });

      it('should handle special characters in non-HRN values', () => {
        const params = {
          'filter[email]': 'eq:user@example.com'
        };
        const result = serializeParams(params);
        
        expect(result).toBe('filter[email]=eq:user%40example.com');
        expect(result).toContain('%40'); // @ should be encoded
      });

      it('should handle spaces in values', () => {
        const params = {
          'filter[name]': 'eq:John Doe'
        };
        const result = serializeParams(params);
        
        expect(result).toContain('eq:John%20Doe');
      });
    });

    describe('complex query string', () => {
      it('should handle multiple parameters of different types', () => {
        const params = {
          'pagination[offset]': 0,
          'pagination[pageSize]': 10,
          'filter[includeInactive]': 'eq:true',
          'filter[includeInternal]': 'eq:true',
          'filter[roles]': 'eq:hrn:hrs:lists:roles/agreements-site-manager',
          'include': 'firstName,lastName,userId,employer,id,active,roles',
          'sort': 'firstName'
        };
        const result = serializeParams(params);
        
        expect(result).toContain('pagination[offset]=0');
        expect(result).toContain('pagination[pageSize]=10');
        expect(result).toContain('filter[includeInactive]=eq:true');
        expect(result).toContain('filter[includeInternal]=eq:true');
        expect(result).toContain('filter[roles]=eq:hrn%3Ahrs%3Alists%3Aroles%2Fagreements-site-manager');
        expect(result).toContain('include=firstName,lastName,userId,employer,id,active,roles');
        expect(result).toContain('sort=firstName');
        
        // Verify brackets are not encoded
        expect(result).not.toContain('%5B');
        expect(result).not.toContain('%5D');
      });

      it('should match expected Huron API URL format', () => {
        const params = {
          'filter[roles]': 'eq:hrn:hrs:lists:roles/reviewer-roles/primary',
          'pagination[offset]': 0,
          'pagination[pageSize]': 500
        };
        const result = serializeParams(params);
        
        // Should produce: filter[roles]=eq:hrn%3Ahrs%3Alists%3Aroles%2Freviewer-roles%2Fprimary&...
        expect(result).toContain('filter[roles]=eq:hrn%3Ahrs%3Alists%3Aroles%2Freviewer-roles%2Fprimary');
        expect(result).toContain('pagination[offset]=0');
        expect(result).toContain('pagination[pageSize]=500');
      });
    });
  });
});
