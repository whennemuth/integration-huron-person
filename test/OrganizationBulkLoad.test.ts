import { CrudOperation, SinglePushResult, Status } from 'integration-core';
import { HuronOrganization } from '../src/data-target/crud/Organization';
import { OrganizationBulkLoad, OrganizationUpserter } from '../src/data-target/OrganizationBulkLoad';
import { UpsertOneParms } from '../src/data-target/OrganizationDataTarget';

const org = (id: string, parentId?: string, extra: any = {}): HuronOrganization => ({
  id,
  name: `Org ${id}`,
  sourceIdentifier: id,
  hrn: `hrn:hrs:orgs:source-${id}`,
  active: true,
  alias: null,
  notes: null,
  dateCreated: '2026-01-01T00:00:00Z',
  dateModified: '2026-01-02T00:00:00Z',
  category: { hrn: 'hrn:hrs:lists:org-categories/bu~institution', name: 'institution' },
  parent: parentId ? { hrn: `hrn:hrs:orgs:source-${parentId}`, name: `Org ${parentId}`, id: parentId } : null,
  ...extra
} as any);

const getValue = (params: UpsertOneParms, field: string): any => {
  return params.data.fieldValues.find(fv => field in fv)?.[field];
};

/** Fake target that creates orgs with a hrn derived from the id, and records the calls made. */
const fakeTarget = (opts: { failIds?: string[] } = {}) => {
  const calls: UpsertOneParms[] = [];
  const upserter: OrganizationUpserter = {
    upsertOne: async (params) => {
      calls.push(params);
      const id = getValue(params, 'id');
      if (opts.failIds?.includes(id)) {
        return { status: Status.FAILURE, message: `boom ${id}`, primaryKey: [{ id }] } as SinglePushResult;
      }
      if (params.existingHrn && params.onExisting === 'skip') {
        return { status: Status.SUCCESS, primaryKey: [{ hrn: params.existingHrn }], skipReason: 'exists' } as SinglePushResult;
      }
      return {
        status: Status.SUCCESS,
        primaryKey: [{ hrn: params.existingHrn || `hrn:hrs:orgs:target-${id}` }],
        crud: params.existingHrn ? CrudOperation.UPDATE : CrudOperation.CREATE
      } as SinglePushResult;
    }
  };
  return { upserter, calls };
};

describe('OrganizationBulkLoad', () => {

  describe('buildLevels', () => {
    it('should order orgs level by level regardless of their order in the dump', () => {
      const { levels, orphans, unreachable } = OrganizationBulkLoad.buildLevels([
        org('grandchild', 'child'), org('child', 'root'), org('root'), org('root2')
      ]);
      expect(levels.map(l => l.map(o => o.id).sort())).toEqual([['root', 'root2'], ['child'], ['grandchild']]);
      expect(orphans).toEqual([]);
      expect(unreachable).toEqual([]);
    });

    it('should treat orgs whose parent is not in the dump as top level orphans', () => {
      const { levels, orphans } = OrganizationBulkLoad.buildLevels([org('a', 'missing'), org('b', 'a')]);
      expect(orphans).toEqual(['a']);
      expect(levels.map(l => l.map(o => o.id))).toEqual([['a'], ['b']]);
    });

    it('should fall back to matching the parent by hrn', () => {
      const child = org('child', 'root');
      (child.parent as any).id = undefined;
      const { levels } = OrganizationBulkLoad.buildLevels([child, org('root')]);
      expect(levels.map(l => l.map(o => o.id))).toEqual([['root'], ['child']]);
    });

    it('should report parent cycles as unreachable and duplicate ids', () => {
      const { unreachable, duplicates } = OrganizationBulkLoad.buildLevels([
        org('x', 'y'), org('y', 'x'), org('ok'), org('ok')
      ]);
      expect(unreachable.sort()).toEqual(['x', 'y']);
      expect(duplicates).toEqual(['ok']);
    });
  });

  describe('toFieldSet', () => {
    it('should drop read-only and null fields and reduce references to their hrn', () => {
      const source = org('1', '2', {
        functions: [{ hrn: 'hrn:hrs:lists:org-functions/a', name: 'A' }],
        contactInformation: { city: 'Boston', phone: null, country: { hrn: 'hrn:hrs:lists:countries/usa', name: 'USA' } }
      });
      const { fieldValues } = OrganizationBulkLoad.toFieldSet(source, 'hrn:hrs:orgs:target-2');
      const payload = Object.assign({}, ...fieldValues);

      expect(payload).not.toHaveProperty('hrn');
      expect(payload).not.toHaveProperty('dateCreated');
      expect(payload).not.toHaveProperty('dateModified');
      expect(payload).not.toHaveProperty('alias');
      expect(payload).not.toHaveProperty('notes');
      expect(payload.parent).toEqual({ hrn: 'hrn:hrs:orgs:target-2' });
      expect(payload.category).toEqual({ hrn: 'hrn:hrs:lists:org-categories/bu~institution' });
      expect(payload.functions).toEqual([{ hrn: 'hrn:hrs:lists:org-functions/a' }]);
      expect(payload.contactInformation).toEqual({ city: 'Boston', country: { hrn: 'hrn:hrs:lists:countries/usa' } });
      expect(payload.active).toBe(true);
    });

    it('should omit parent when there is no target parent and apply list hrn overrides', () => {
      const { fieldValues } = OrganizationBulkLoad.toFieldSet(org('1', '2'), undefined, {
        'hrn:hrs:lists:org-categories/bu~institution': 'hrn:hrs:lists:org-categories/other'
      });
      const payload = Object.assign({}, ...fieldValues);
      expect(payload).not.toHaveProperty('parent');
      expect(payload.category).toEqual({ hrn: 'hrn:hrs:lists:org-categories/other' });
    });
  });

  describe('load', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    it('should create parents first and point children at the target hrn of their parent', async () => {
      const { upserter, calls } = fakeTarget();
      const report = await new OrganizationBulkLoad({
        dataTarget: upserter, orgs: [org('child', 'root'), org('root')]
      }).load();

      expect(calls.map(c => getValue(c, 'id'))).toEqual(['root', 'child']);
      expect(getValue(calls[1], 'parent')).toEqual({ hrn: 'hrn:hrs:orgs:target-root' });
      expect(calls[0].skipLookup).toBe(true);
      expect(report.created.sort()).toEqual(['child', 'root']);
      expect(report.hrnMap).toEqual({ root: 'hrn:hrs:orgs:target-root', child: 'hrn:hrs:orgs:target-child' });
    });

    it('should update existing orgs and pass their known hrn', async () => {
      const { upserter, calls } = fakeTarget();
      const report = await new OrganizationBulkLoad({
        dataTarget: upserter, orgs: [org('child', 'root'), org('root')],
        existingOrgs: new Map([['root', 'hrn:hrs:orgs:existing-root']])
      }).load();

      expect(calls[0].existingHrn).toBe('hrn:hrs:orgs:existing-root');
      expect(getValue(calls[1], 'parent')).toEqual({ hrn: 'hrn:hrs:orgs:existing-root' });
      expect(report.updated).toEqual(['root']);
      expect(report.created).toEqual(['child']);
    });

    it('should skip existing orgs but still use their hrn for children when onExisting is skip', async () => {
      const { upserter, calls } = fakeTarget();
      const report = await new OrganizationBulkLoad({
        dataTarget: upserter, orgs: [org('child', 'root'), org('root')], onExisting: 'skip',
        existingOrgs: new Map([['root', 'hrn:hrs:orgs:existing-root']])
      }).load();

      expect(report.skippedExisting).toEqual(['root']);
      expect(getValue(calls[1], 'parent')).toEqual({ hrn: 'hrn:hrs:orgs:existing-root' });
    });

    it('should not push orgs already in the supplied hrn map, but still parent children to them', async () => {
      const { upserter, calls } = fakeTarget();
      const report = await new OrganizationBulkLoad({
        dataTarget: upserter, orgs: [org('child', 'root'), org('root')],
        hrnMap: { root: 'hrn:hrs:orgs:earlier-root' }
      }).load();

      expect(calls.map(c => getValue(c, 'id'))).toEqual(['child']);
      expect(getValue(calls[0], 'parent')).toEqual({ hrn: 'hrn:hrs:orgs:earlier-root' });
      expect(report.resumed).toEqual(['root']);
    });

    it('should skip all descendants of a failed org but carry on with the rest', async () => {
      const { upserter, calls } = fakeTarget({ failIds: ['bad'] });
      const report = await new OrganizationBulkLoad({
        dataTarget: upserter, maxRetryPasses: 0,
        orgs: [org('bad'), org('kid', 'bad'), org('grandkid', 'kid'), org('good'), org('goodkid', 'good')]
      }).load();

      expect(calls.map(c => getValue(c, 'id')).sort()).toEqual(['bad', 'good', 'goodkid']);
      expect(report.failed).toEqual([{ id: 'bad', message: 'boom bad' }]);
      expect(report.skippedDescendants).toEqual([
        { id: 'kid', ancestorId: 'bad' }, { id: 'grandkid', ancestorId: 'bad' }
      ]);
      expect(report.created.sort()).toEqual(['good', 'goodkid']);
    });

    it('should report progress after each level and at the end', async () => {
      const { upserter } = fakeTarget();
      const onProgress = jest.fn();
      await new OrganizationBulkLoad({
        dataTarget: upserter, orgs: [org('child', 'root'), org('root')], onProgress
      }).load();
      // 2 levels + final
      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    it('should persist progress even if the target throws', async () => {
      const onProgress = jest.fn();
      const upserter: OrganizationUpserter = { upsertOne: jest.fn().mockRejectedValue(new Error('network down')) };
      await expect(new OrganizationBulkLoad({ dataTarget: upserter, orgs: [org('root')], onProgress }).load())
        .rejects.toThrow('network down');
      expect(onProgress).toHaveBeenCalledTimes(1);
    });

    it('should not call the target on a dry run but still walk the hierarchy', async () => {
      const { upserter, calls } = fakeTarget();
      const report = await new OrganizationBulkLoad({
        dataTarget: upserter, orgs: [org('child', 'root'), org('root')], dryRun: true
      }).load();

      expect(calls).toHaveLength(0);
      expect(report.created.sort()).toEqual(['child', 'root']);
    });

    describe('retry passes', () => {
      const timeout = (id: string) => ({
        status: Status.FAILURE, message: '{"message":"Endpoint request timed out"}', primaryKey: [{ id }]
      } as SinglePushResult);

      /** Fails each org in failTimes that many times (before applying it unless appliedDespiteFailure). */
      const flakyTarget = (failTimes: Record<string, number>, appliedDespiteFailure: string[] = []) => {
        const calls: UpsertOneParms[] = [];
        const remaining = { ...failTimes };
        const applied = new Set<string>();
        const upserter: OrganizationUpserter = {
          upsertOne: async (params) => {
            calls.push(params);
            const id = getValue(params, 'id');
            if (remaining[id] > 0) {
              remaining[id]--;
              if (appliedDespiteFailure.includes(id)) applied.add(id);
              return timeout(id);
            }
            if (applied.has(id)) {
              // A blind create would now be rejected as a duplicate
              if (params.skipLookup) {
                return { status: Status.FAILURE, message: 'duplicate', primaryKey: [{ id }] } as SinglePushResult;
              }
              return { status: Status.SUCCESS, primaryKey: [{ hrn: `hrn:hrs:orgs:target-${id}` }], crud: CrudOperation.UPDATE } as SinglePushResult;
            }
            return {
              status: Status.SUCCESS, primaryKey: [{ hrn: `hrn:hrs:orgs:target-${id}` }], crud: CrudOperation.CREATE
            } as SinglePushResult;
          }
        };
        return { upserter, calls };
      };

      it('should retry a failed org and then its skipped descendants, parents first', async () => {
        const { upserter, calls } = flakyTarget({ root: 1 });
        const sleep = jest.fn().mockResolvedValue(undefined);
        const passes: number[] = [];
        const report = await new OrganizationBulkLoad({
          dataTarget: upserter, sleep, orgs: [org('grandkid', 'kid'), org('kid', 'root'), org('root'), org('other')],
          onPassComplete: (pass) => passes.push(pass)
        }).load();

        expect(calls.map(c => getValue(c, 'id'))).toEqual(['root', 'other', 'root', 'kid', 'grandkid']);
        expect(getValue(calls[3], 'parent')).toEqual({ hrn: 'hrn:hrs:orgs:target-root' });
        expect(report.retryPasses).toBe(1);
        expect(report.failed).toEqual([]);
        expect(report.skippedDescendants).toEqual([]);
        expect(report.created.sort()).toEqual(['grandkid', 'kid', 'other', 'root']);
        expect(passes).toEqual([0, 1]);
        expect(sleep).toHaveBeenCalledTimes(1);
      });

      it('should look the org up on a retry, since a timed out create may have been applied', async () => {
        const { upserter, calls } = flakyTarget({ root: 1 }, ['root']);
        const report = await new OrganizationBulkLoad({
          dataTarget: upserter, sleep: async () => {}, orgs: [org('root')]
        }).load();

        expect(calls.map(c => c.skipLookup)).toEqual([true, false]);
        expect(report.failed).toEqual([]);
        expect(report.updated).toEqual(['root']);
      });

      it('should stop at the retry limit, double the delay each pass and report what is left', async () => {
        const { upserter, calls } = flakyTarget({ bad: 100 });
        const sleep = jest.fn().mockResolvedValue(undefined);
        const report = await new OrganizationBulkLoad({
          dataTarget: upserter, sleep, maxRetryPasses: 3, retryBaseDelayMs: 1000,
          orgs: [org('bad'), org('kid', 'bad'), org('good')]
        }).load();

        expect(calls.filter(c => getValue(c, 'id') === 'bad')).toHaveLength(4);
        expect(sleep.mock.calls.map(c => c[0])).toEqual([1000, 2000, 4000]);
        expect(report.retryPasses).toBe(3);
        expect(report.failed.map(f => f.id)).toEqual(['bad']);
        expect(report.skippedDescendants).toEqual([{ id: 'kid', ancestorId: 'bad' }]);
        expect(report.created).toEqual(['good']);
      });

      it('should cap the delay between passes', async () => {
        const { upserter } = flakyTarget({ bad: 100 });
        const sleep = jest.fn().mockResolvedValue(undefined);
        await new OrganizationBulkLoad({
          dataTarget: upserter, sleep, maxRetryPasses: 3, retryBaseDelayMs: 200000, orgs: [org('bad')]
        }).load();
        expect(sleep.mock.calls.map(c => c[0])).toEqual([200000, 300000, 300000]);
      });

      it('should not retry when everything loaded, on a dry run, or when retries are disabled', async () => {
        const sleep = jest.fn();
        const ok = fakeTarget();
        await new OrganizationBulkLoad({ dataTarget: ok.upserter, sleep, orgs: [org('root')] }).load();

        const dry = fakeTarget({ failIds: ['root'] });
        await new OrganizationBulkLoad({ dataTarget: dry.upserter, sleep, orgs: [org('root')], dryRun: true }).load();

        const off = fakeTarget({ failIds: ['root'] });
        await new OrganizationBulkLoad({ dataTarget: off.upserter, sleep, orgs: [org('root')], maxRetryPasses: 0 }).load();

        expect(sleep).not.toHaveBeenCalled();
        expect(off.calls).toHaveLength(1);
      });

      it('should not retry problems with the dump itself', async () => {
        const { upserter, calls } = fakeTarget();
        const sleep = jest.fn();
        const report = await new OrganizationBulkLoad({
          dataTarget: upserter, sleep, orgs: [org('ok'), org('ok')]
        }).load();

        expect(sleep).not.toHaveBeenCalled();
        expect(calls).toHaveLength(1);
        expect(report.failed).toEqual([{ id: 'ok', message: 'Duplicate id in the dump' }]);
      });

      it('should count orgs resumed from an earlier run once, in the first pass only', async () => {
        const { upserter } = flakyTarget({ kid: 1 });
        const report = await new OrganizationBulkLoad({
          dataTarget: upserter, sleep: async () => {}, orgs: [org('kid', 'root'), org('root')],
          hrnMap: { root: 'hrn:hrs:orgs:earlier-root' }
        }).load();

        expect(report.resumed).toEqual(['root']);
        expect(report.created).toEqual(['kid']);
      });

      it('should persist progress after each retry level', async () => {
        const { upserter } = flakyTarget({ root: 1 });
        const onProgress = jest.fn();
        await new OrganizationBulkLoad({
          dataTarget: upserter, sleep: async () => {}, orgs: [org('kid', 'root'), org('root')], onProgress
        }).load();
        // pass 0: 2 levels, retry pass: 2 levels, then final
        expect(onProgress).toHaveBeenCalledTimes(5);
      });
    });
  });
});
