import { CrudOperation, FieldSet, Status } from 'integration-core';
import { ConfigManager } from '../src/config/ConfigManager';
import { ReadOrganization } from '../src/data-target/crud/ReadOrganization';
import { HuronOrganizationDataTarget } from '../src/data-target/OrganizationDataTarget';
import { createMockConfig } from './helpers/mockConfig';

jest.mock('../src/data-target/ApiClientForJWT');
jest.mock('../src/data-target/crud/ReadOrganization');
jest.mock('../src/data-target/crud/ReadOrganizations');

const fieldSet = (): FieldSet => ({
  fieldValues: [{ id: 'org1' }, { name: 'Org One' }, { hrn: 'hrn:hrs:orgs:source-org1' }]
});

describe('HuronOrganizationDataTarget', () => {
  let target: HuronOrganizationDataTarget;
  let api: { post: jest.Mock, patch: jest.Mock, setErrorEventDetails: jest.Mock };
  let readById: jest.Mock;

  beforeEach(() => {
    const config = ConfigManager.getInstance().reset().fromPartial(createMockConfig()).getConfig('none');
    target = new HuronOrganizationDataTarget({ config });
    api = {
      post: jest.fn().mockResolvedValue({ data: { hrn: 'hrn:hrs:orgs:new' }, status: 201, statusText: 'Created' }),
      patch: jest.fn().mockResolvedValue({ data: {}, status: 200, statusText: 'OK' }),
      setErrorEventDetails: jest.fn()
    };
    (target as any).apiClient = api;
    readById = jest.fn().mockResolvedValue([]);
    (ReadOrganization as jest.Mock).mockImplementation(() => ({ readOrganizationById: readById }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('should return the hrn of a created organization', async () => {
    const result = await target.pushOne({ data: fieldSet(), crud: CrudOperation.CREATE });
    expect(result.status).toBe(Status.SUCCESS);
    expect(result.primaryKey).toEqual([{ hrn: 'hrn:hrs:orgs:new' }]);
  });

  describe('upsertOne', () => {
    it('should create, without the source hrn, when the org does not exist', async () => {
      const result = await target.upsertOne({ data: fieldSet() });

      expect(readById).toHaveBeenCalledWith('org1');
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('hrn');
      expect(result.crud).toBe(CrudOperation.CREATE);
      expect(result.primaryKey).toEqual([{ hrn: 'hrn:hrs:orgs:new' }]);
    });

    it('should patch using the hrn found by looking up the id', async () => {
      readById.mockResolvedValue([{ id: 'org1', hrn: 'hrn:hrs:orgs:found' }]);
      const result = await target.upsertOne({ data: fieldSet() });

      expect(api.post).not.toHaveBeenCalled();
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch.mock.calls[0][0]).toMatch(/hrn:hrs:orgs:found$/);
      expect(api.patch.mock.calls[0][1].hrn).toBe('hrn:hrs:orgs:found');
      expect(result.crud).toBe(CrudOperation.UPDATE);
    });

    it('should use a known hrn without any lookup', async () => {
      await target.upsertOne({ data: fieldSet(), existingHrn: 'hrn:hrs:orgs:known' });
      expect(readById).not.toHaveBeenCalled();
      expect(api.patch.mock.calls[0][1].hrn).toBe('hrn:hrs:orgs:known');
    });

    it('should not look up when told the org does not exist', async () => {
      await target.upsertOne({ data: fieldSet(), skipLookup: true });
      expect(readById).not.toHaveBeenCalled();
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('should leave an existing org alone when onExisting is skip', async () => {
      const result = await target.upsertOne({ data: fieldSet(), existingHrn: 'hrn:hrs:orgs:known', onExisting: 'skip' });
      expect(api.patch).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(result.status).toBe(Status.SUCCESS);
      expect(result.skipReason).toBeDefined();
      expect(result.primaryKey).toEqual([{ hrn: 'hrn:hrs:orgs:known' }]);
    });

    it('should fail when the lookup fails', async () => {
      readById.mockRejectedValue(new Error('lookup down'));
      const result = await target.upsertOne({ data: fieldSet() });
      expect(result.status).toBe(Status.FAILURE);
      expect(result.message).toContain('lookup down');
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
