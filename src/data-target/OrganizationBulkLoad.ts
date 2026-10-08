import { CrudOperation, FieldSet, FieldValue, SinglePushResult, Status, TestEnvironment } from 'integration-core';
import { BasicCache } from '../Cache';
import { ConfigManager } from '../config/ConfigManager';
import { getLocalConfig, removeNullValues, setFileLogging } from '../Utils';
import { HuronOrganization } from './crud/Organization';
import { ReadOrganizations } from './crud/ReadOrganizations';
import { HuronOrganizationDataTarget, OnExistingOrganization, UpsertOneParms } from './OrganizationDataTarget';

/** The part of HuronOrganizationDataTarget that the bulk load depends on */
export type OrganizationUpserter = {
  upsertOne: (params: UpsertOneParms) => Promise<SinglePushResult>;
};

export type OrganizationBulkLoadParams = {
  dataTarget: OrganizationUpserter;
  /** The organizations from a json dump of one Huron environment */
  orgs: HuronOrganization[];
  /** Organization id -> hrn for orgs already in the target system, to avoid a lookup per org */
  existingOrgs?: Map<string, string>;
  /** What to do with orgs that already exist in the target system. Default 'update' */
  onExisting?: OnExistingOrganization;
  /** Walk the hierarchy and log what would be sent, but make no calls to the target system */
  dryRun?: boolean;
  /** Organization id -> target hrn from an earlier, interrupted run. These orgs are not pushed again */
  hrnMap?: Record<string, string>;
  /** Source list hrn -> target list hrn, for category/function/tag/state/country refs that differ between environments */
  listHrnOverrides?: Record<string, string>;
  /** Called with the current hrnMap after every level and when the load ends (including on error) */
  onProgress?: (hrnMap: Record<string, string>) => void | Promise<void>;
  /** How many times to rerun the load over orgs that failed or were skipped due to a failed ancestor. Default 5 */
  maxRetryPasses?: number;
  /** Delay before the first retry pass, doubled for each later pass (capped at 5 minutes). Default 30000 */
  retryBaseDelayMs?: number;
  /** Waits between retry passes. Replaceable so tests need not actually wait */
  sleep?: (ms: number) => Promise<void>;
  /** Called after the first pass (0) and after each retry pass (1..n), with what that pass alone did */
  onPassComplete?: (pass: number, passReport: OrganizationBulkLoadPassReport, report: OrganizationBulkLoadReport) => void;
};

export type OrganizationBulkLoadReport = {
  created: string[];
  updated: string[];
  /** Existed already and onExisting is 'skip' */
  skippedExisting: string[];
  /** Already loaded by an earlier run, according to the supplied hrnMap */
  resumed: string[];
  /** Orgs that still failed after the last pass */
  failed: { id: string, message: string }[];
  /** Not attempted because an ancestor failed to load, as of the last pass */
  skippedDescendants: { id: string, ancestorId: string }[];
  /** Has a parent that is not in the dump, so was loaded as a top level org */
  orphans: string[];
  hrnMap: Record<string, string>;
  /** Number of retry passes that were run after the first pass */
  retryPasses: number;
};

export type OrganizationBulkLoadPassReport = Pick<OrganizationBulkLoadReport,
  'created' | 'updated' | 'skippedExisting' | 'resumed' | 'failed' | 'skippedDescendants'>;

const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

type Levels = {
  levels: HuronOrganization[][];
  /** org id -> id of its parent, for orgs whose parent is in the dump */
  parentIds: Map<string, string>;
  orphans: string[];
  duplicates: string[];
  /** Orgs that are not reachable from a root, i.e. part of a parent cycle */
  unreachable: string[];
};

/**
 * Upserts all the organizations found in a json dump of one Huron environment (produced by
 * src/data-target/crud/ReadOrganizations.ts with task "pages") into the target system.
 * Orgs without a parent go first, then their children, grandchildren, etc. The hrn of each
 * upserted org is captured so that its children can reference it as their parent, since hrns
 * of the same org differ between environments.
 *
 * TEST HARNESS USAGE (env vars, prefix ORGANIZATION_BULK_LOAD_ optional):
 *  - JSON_FILE_PATH: the dump, e.g. ./data/read-organizations-staging.json
 *  - ON_EXISTING: "update" (default) or "skip" - what to do with orgs already in the target
 *  - DRY_RUN: "true" to make no changes to the target
 *  - HRN_MAP_FILE_PATH: where the id -> target hrn map is kept so an interrupted load can resume
 *  - LIST_HRN_OVERRIDES_FILE_PATH: json of source list hrn -> target list hrn
 *  - MAX_RETRY_PASSES: reruns over failed/skipped orgs once the first pass ends (default 5, 0 disables)
 *  - RETRY_BASE_DELAY_MS: wait before the first retry pass, doubling each pass (default 30000)
 */
export class OrganizationBulkLoad {
  private readonly hrnMap: Record<string, string>;

  constructor(private readonly params: OrganizationBulkLoadParams) {
    this.hrnMap = { ...(params.hrnMap || {}) };
  }

  /**
   * Group orgs into levels - roots, then their children, and so on. A parent is identified by
   * its id, falling back to its hrn matching an org in the dump.
   */
  public static buildLevels(allOrgs: HuronOrganization[]): Levels {
    const duplicates: string[] = [];
    const byId = new Map<string, HuronOrganization>();
    for (const org of allOrgs) {
      if (byId.has(org.id)) {
        duplicates.push(org.id);
        continue;
      }
      byId.set(org.id, org);
    }

    const idByHrn = new Map<string, string>();
    byId.forEach(org => org.hrn && idByHrn.set(org.hrn, org.id));

    const parentIds = new Map<string, string>();
    const orphans: string[] = [];
    const roots: HuronOrganization[] = [];
    const children = new Map<string, HuronOrganization[]>();

    byId.forEach(org => {
      const parent: any = org.parent;
      if ( ! parent) {
        roots.push(org);
        return;
      }
      const parentId = byId.has(parent.id) ? parent.id : idByHrn.get(parent.hrn);
      if ( ! parentId) {
        orphans.push(org.id);
        roots.push(org);
        return;
      }
      parentIds.set(org.id, parentId);
      children.set(parentId, [...(children.get(parentId) || []), org]);
    });

    const levels: HuronOrganization[][] = [];
    const visited = new Set<string>();
    let current = roots;
    while (current.length > 0) {
      levels.push(current);
      current.forEach(org => visited.add(org.id));
      current = current.flatMap(org => children.get(org.id) || []);
    }

    const unreachable = Array.from(byId.keys()).filter(id => ! visited.has(id));

    return { levels, parentIds, orphans, duplicates, unreachable };
  }

  /**
   * Convert an org from the dump into the payload accepted by the target api: read-only and null
   * fields are dropped, hrn references are reduced to just the hrn, and the parent is set to the
   * hrn of the parent in the target system.
   */
  public static toFieldSet(org: HuronOrganization, parentHrn?: string, listHrnOverrides: Record<string, string> = {}): FieldSet {
    const { hrn, dateCreated, dateModified, links, parent, ...rest } = org;
    const payload: any = removeNullValues(rest) || {};

    const toRef = (ref: any) => {
      return ref?.hrn ? { hrn: listHrnOverrides[ref.hrn] ?? ref.hrn } : undefined;
    };

    if (payload.category) payload.category = toRef(payload.category);
    if (payload.functions) payload.functions = payload.functions.map(toRef).filter(Boolean);
    if (payload.tags) payload.tags = payload.tags.map(toRef).filter(Boolean);
    if (payload.contactInformation) {
      const { stateProvince, country } = payload.contactInformation;
      if (stateProvince) payload.contactInformation.stateProvince = toRef(stateProvince);
      if (country) payload.contactInformation.country = toRef(country);
    }
    if (parentHrn) {
      payload.parent = { hrn: parentHrn };
    }

    const fieldValues = Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ [key]: value as FieldValue }));

    return { fieldValues };
  }

  /**
   * Collect the distinct list hrns (category, function, tag, state, country) used in the orgs.
   * These must exist in the target system, but the api offers no way to check that.
   */
  public static getListHrns(orgs: HuronOrganization[]): Record<string, string[]> {
    const found: Record<string, Set<string>> = {
      categories: new Set(), functions: new Set(), tags: new Set(), states: new Set(), countries: new Set()
    };
    for (const org of orgs) {
      if (org.category?.hrn) found.categories.add(org.category.hrn);
      org.functions?.forEach(f => f?.hrn && found.functions.add(f.hrn));
      org.tags?.forEach(t => t?.hrn && found.tags.add(t.hrn));
      const { stateProvince, country } = org.contactInformation || {};
      if (stateProvince?.hrn) found.states.add(stateProvince.hrn);
      if (country?.hrn) found.countries.add(country.hrn);
    }
    return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, Array.from(v).sort()]));
  }

  public async load(): Promise<OrganizationBulkLoadReport> {
    const {
      orgs, dryRun = false, onProgress, maxRetryPasses = 5, retryBaseDelayMs = 30000, onPassComplete,
      sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    } = this.params;
    const built = OrganizationBulkLoad.buildLevels(orgs);
    const { levels, orphans, duplicates, unreachable } = built;

    // Problems with the dump itself cannot be fixed by trying again
    const dumpFailures: OrganizationBulkLoadReport['failed'] = [
      ...duplicates.map(id => ({ id, message: 'Duplicate id in the dump' })),
      ...unreachable.map(id => ({ id, message: 'Not reachable from a top level org (parent cycle)' }))
    ];

    const report: OrganizationBulkLoadReport = {
      created: [], updated: [], skippedExisting: [], resumed: [], failed: [...dumpFailures], skippedDescendants: [],
      orphans, hrnMap: this.hrnMap, retryPasses: 0
    };

    orphans.forEach(id => console.warn(`Org ${id} has a parent that is not in the dump - loading it as a top level org`));
    console.log(`Loading ${orgs.length} organizations in ${levels.length} levels${dryRun ? ' (DRY RUN)' : ''}`);
    console.log('List hrns referenced by the dump:', JSON.stringify(OrganizationBulkLoad.getListHrns(orgs), null, 2));

    try {
      let pass = await this.runPass(built, false);
      report.created.push(...pass.created);
      report.updated.push(...pass.updated);
      report.skippedExisting.push(...pass.skippedExisting);
      report.resumed.push(...pass.resumed);
      report.failed = [...dumpFailures, ...pass.failed];
      report.skippedDescendants = pass.skippedDescendants;
      onPassComplete?.(0, { ...pass, failed: report.failed }, report);

      while ( ! dryRun && report.retryPasses < maxRetryPasses && (pass.failed.length + pass.skippedDescendants.length) > 0) {
        const delayMs = Math.min(retryBaseDelayMs * 2 ** report.retryPasses, MAX_RETRY_DELAY_MS);
        report.retryPasses++;
        console.log(`${pass.failed.length} failed and ${pass.skippedDescendants.length} skipped - retry pass ${report.retryPasses}/${maxRetryPasses} in ${delayMs}ms`);
        await sleep(delayMs);

        pass = await this.runPass(built, true);
        report.created.push(...pass.created);
        report.updated.push(...pass.updated);
        report.skippedExisting.push(...pass.skippedExisting);
        report.failed = [...dumpFailures, ...pass.failed];
        report.skippedDescendants = pass.skippedDescendants;
        onPassComplete?.(report.retryPasses, pass, report);
      }
    }
    finally {
      await onProgress?.(this.hrnMap);
    }

    return report;
  }

  /**
   * Push every org that is not yet in the hrnMap, level by level. On a retry pass the lookup by id
   * is never skipped, because a create that timed out may still have been applied in the target
   * system, which the initial list of existing orgs cannot know about.
   */
  private async runPass(built: Levels, retry: boolean): Promise<OrganizationBulkLoadPassReport> {
    const { dataTarget, existingOrgs = new Map(), onExisting = 'update', dryRun = false, listHrnOverrides, onProgress } = this.params;
    const { levels, parentIds } = built;

    const pass: OrganizationBulkLoadPassReport = {
      created: [], updated: [], skippedExisting: [], resumed: [], failed: [], skippedDescendants: []
    };

    // Orgs that did not load, mapped to the id of the ancestor that is the root cause
    const blocked = new Map<string, string>();

    for (let i = 0; i < levels.length; i++) {
      const pending = levels[i].filter(org => ! this.hrnMap[org.id]).length;
      if (retry && pending === 0) {
        continue;
      }
      console.log(`${retry ? 'Retry level' : 'Level'} ${i}: ${retry ? pending : levels[i].length} organizations`);

      for (const org of levels[i]) {
        const { id } = org;

        if (this.hrnMap[id]) {
          if ( ! retry) {
            pass.resumed.push(id);
          }
          continue;
        }

        const parentId = parentIds.get(id);
        if (parentId && blocked.has(parentId)) {
          const ancestorId = blocked.get(parentId)!;
          blocked.set(id, ancestorId);
          pass.skippedDescendants.push({ id, ancestorId });
          continue;
        }

        const parentHrn = parentId ? this.hrnMap[parentId] : undefined;
        const data = OrganizationBulkLoad.toFieldSet(org, parentHrn, listHrnOverrides);
        const existingHrn = existingOrgs.get(id);

        if (dryRun) {
          console.log(`[DRY RUN] Would ${existingHrn ? onExisting : 'create'} ${id}:`, JSON.stringify(data.fieldValues));
          this.hrnMap[id] = existingHrn || `dryrun:${id}`;
          (existingHrn ? (onExisting === 'skip' ? pass.skippedExisting : pass.updated) : pass.created).push(id);
          continue;
        }

        const result = await dataTarget.upsertOne({ data, onExisting, existingHrn, skipLookup: ! existingHrn && ! retry });
        const hrn = result.primaryKey.find(key => 'hrn' in key)?.hrn as string | undefined;

        if (result.status !== Status.SUCCESS || ! (hrn || existingHrn)) {
          console.error(`Failed to load ${id}: ${result.message}`);
          pass.failed.push({ id, message: result.message || 'No hrn returned' });
          blocked.set(id, id);
          continue;
        }

        this.hrnMap[id] = hrn || existingHrn!;
        if (result.skipReason) {
          pass.skippedExisting.push(id);
        }
        else if (result.crud === CrudOperation.CREATE) {
          pass.created.push(id);
        }
        else {
          pass.updated.push(id);
        }
      }

      await onProgress?.(this.hrnMap);
    }

    return pass;
  }
}

async function main() {
  const {
    JSON_FILE_PATH,
    HURON_PERSON_CONFIG_PATH,
    SECRET_ARN,
    ON_EXISTING = 'update',
    DRY_RUN = 'false',
    HRN_MAP_FILE_PATH,
    LIST_HRN_OVERRIDES_FILE_PATH,
    MAX_RETRY_PASSES,
    RETRY_BASE_DELAY_MS,
    LANDSCAPE
  } = process.env;
  const fs = require('fs');

  if ( ! JSON_FILE_PATH) {
    throw new Error('No JSON_FILE_PATH provided - set it to the organizations dump produced by ReadOrganizations "pages"');
  }
  if ( ! ['update', 'skip'].includes(ON_EXISTING)) {
    throw new Error(`Invalid ON_EXISTING: ${ON_EXISTING}. Must be "update" or "skip"`);
  }
  const dryRun = DRY_RUN.toLowerCase().trim() === 'true';

  const parseCount = (name: string, value: string | undefined) => {
    if (value === undefined || value.trim() === '') {
      return undefined;
    }
    const parsed = Number(value);
    if ( ! Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Invalid ${name}: ${value}. Must be a non-negative integer`);
    }
    return parsed;
  };
  const maxRetryPasses = parseCount('MAX_RETRY_PASSES', MAX_RETRY_PASSES);
  const retryBaseDelayMs = parseCount('RETRY_BASE_DELAY_MS', RETRY_BASE_DELAY_MS);

  const readJson = (path: string | undefined) => {
    return path && fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf-8')) : undefined;
  };

  const orgs: HuronOrganization[] = readJson(JSON_FILE_PATH);
  if ( ! orgs) {
    throw new Error(`File not found: ${JSON_FILE_PATH}`);
  }
  const hrnMapFilePath = HRN_MAP_FILE_PATH || `data/org-bulk-load-hrn-map-${LANDSCAPE || 'default'}.json`;
  const hrnMap = readJson(hrnMapFilePath);
  const listHrnOverrides = readJson(LIST_HRN_OVERRIDES_FILE_PATH);
  if (hrnMap) {
    console.log(`Resuming with ${Object.keys(hrnMap).length} orgs already loaded, from ${hrnMapFilePath}`);
  }

  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = await ConfigManager.getInstance()
    .reset()
    .fromFileSystem(localConfigPath)              // ← Local dev only
    .fromJsonString('HURON_PERSON_CONFIG_JSON')   // ← TaskDef secret injection
    .fromEnvironment()                            // ← Fallback to individual env var overrides
    .fromSecretManager(SECRET_ARN)                // ← Fallback to Secrets Manager
    .getConfigAsync('person');

  const cache = BasicCache.getInstance(config);
  const dataTarget = new HuronOrganizationDataTarget({ config, cache });
  await dataTarget.ensureValidToken();

  console.log('Reading the organizations that already exist in the target system...');
  const existing = await new ReadOrganizations({ config }).readAllOrganizations();
  const existingOrgs = new Map<string, string>();
  existing.forEach(org => org.hrn && existingOrgs.set(org.id, org.hrn));
  console.log(`Found ${existingOrgs.size} existing organizations`);

  const loader = new OrganizationBulkLoad({
    dataTarget,
    orgs,
    existingOrgs,
    onExisting: ON_EXISTING as OnExistingOrganization,
    dryRun,
    hrnMap,
    listHrnOverrides,
    maxRetryPasses,
    retryBaseDelayMs,
    onProgress: (map) => {
      if ( ! dryRun) {
        fs.writeFileSync(hrnMapFilePath, JSON.stringify(map, null, 2));
      }
    },
    onPassComplete: (pass, passReport, fullReport) => {
      printSummary(pass === 0 ? 'BULK LOAD SUMMARY' : `BULK LOAD (retry ${pass}) SUMMARY`, passReport, pass === 0 ? fullReport.orphans : undefined);
    }
  });
  const report = await loader.load();

  if (report.retryPasses > 0) {
    printSummary('BULK LOAD (overall) SUMMARY', report, report.orphans);
  }
}

function printSummary(title: string, report: OrganizationBulkLoadPassReport, orphans?: string[]) {
  console.log(`\n=== ${title} ===`);
  console.log(`Created: ${report.created.length}`);
  console.log(`Updated: ${report.updated.length}`);
  console.log(`Skipped (already exist): ${report.skippedExisting.length}`);
  console.log(`Resumed (loaded by earlier run): ${report.resumed.length}`);
  if (orphans) {
    console.log(`Loaded as top level due to missing parent: ${orphans.length}`);
  }
  console.log(`Failed: ${report.failed.length}`);
  console.log(`Skipped due to failed ancestor: ${report.skippedDescendants.length}`);
  report.failed.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
  report.skippedDescendants.forEach(s => console.log(`  - ${s.id}: ancestor ${s.ancestorId} failed`));
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('ORGANIZATION_BULK_LOAD');

  [
    'JSON_FILE_PATH',
    'HURON_PERSON_CONFIG_PATH',
    'SECRET_ARN',
    'ON_EXISTING',
    'DRY_RUN',
    'HRN_MAP_FILE_PATH',
    'LIST_HRN_OVERRIDES_FILE_PATH',
    'MAX_RETRY_PASSES',
    'RETRY_BASE_DELAY_MS',
    'OUTPUT_FILE_PATH'
  ].forEach(testEnvironment.getVarOrEmptyString);

  const logFilePath = process.env.OUTPUT_FILE_PATH;
  if (logFilePath) {
    setFileLogging(logFilePath);
  }

  main().catch(error => {
    console.error('Organization bulk load failed:', error);
    process.exitCode = 1;
  });
}
