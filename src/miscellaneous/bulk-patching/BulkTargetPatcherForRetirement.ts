import * as fs from 'fs';
import { FieldSet, TestEnvironment } from 'integration-core';
import { HuronPerson } from "../../data-target/crud/Person";
import { AbstractBulkTargetPatcher } from "./BulkTargetPatcher";
import { Config } from "../../config/Config";
import { ConfigManager } from "../../config/ConfigManager";
import { getLocalConfig } from '../../Utils';
import { ReadOrganization } from '../../data-target/crud/ReadOrganization';

/**
 * Implementation that retires people by setting them to inactive and assigning them to 
 * the UNASSIGNED organization. This patcher reads a file containing personids that should 
 * be EXCLUDED from retirement (i.e., kept active). All other people fetched from the target 
 * system will be marked as inactive and moved to the UNASSIGNED organization.
 * 
 * The isPatchable method returns false for personids in the exclusion file, and true for 
 * all others, meaning those others will be patched with the retirement fieldset.
 */
export class BulkTargetPatcherForRetirement extends AbstractBulkTargetPatcher {
  private excludedPersonIds: Set<string> = new Set();
  private unassignedOrgHrn: string | null = null;

  constructor(config: Config, personIdFile: string, dryRun: boolean) {
    // SelectConfig to fetch ALL persons with ALL fields
    super(config, {}, dryRun);
    
    // Load the personids from file into the exclusion set
    this.loadPersonIdsFromFile(personIdFile);
  }

  /**
   * Load personids from file (one per line) into the exclusion set.
   * Lines are trimmed and empty lines are skipped.
   */
  private loadPersonIdsFromFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Person ID file not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    for (const line of lines) {
      const personId = line.trim();
      if (personId.length > 0) {
        this.excludedPersonIds.add(personId);
      }
    }

    console.log(`Loaded ${this.excludedPersonIds.size} personids from exclusion file: ${filePath}`);
  }

  /**
   * Fetch the HRN for the UNASSIGNED organization by querying for sourceIdentifier "UNASSIGNED".
   * Caches the result after first lookup.
   */
  private async getUnassignedOrgHrn(): Promise<string> {
    if (this.unassignedOrgHrn) {
      return this.unassignedOrgHrn;
    }

    console.log('Looking up UNASSIGNED organization...');
    const reader = new ReadOrganization(this.config);
    const organizations = await reader.readOrganizationBySourceIdentifier('UNASSIGNED', ['hrn', 'id', 'name']);

    if (!organizations || organizations.length === 0) {
      throw new Error('UNASSIGNED organization not found in target system');
    }

    if (organizations.length > 1) {
      console.warn(`Warning: Found ${organizations.length} organizations with sourceIdentifier "UNASSIGNED", using first one`);
    }

    this.unassignedOrgHrn = organizations[0].hrn!;
    console.log(`UNASSIGNED organization HRN: ${this.unassignedOrgHrn}`);
    
    return this.unassignedOrgHrn;
  }

  /**
   * Determines if a person is patchable for retirement.
   * Returns FALSE if the personid exists in the exclusion set (should not be retired).
   * Returns TRUE if the personid does NOT exist in the exclusion set (should be retired).
   */
  public isPatchable = async (person: HuronPerson): Promise<boolean> => {
    const { id, sourceIdentifier } = person;
    const sid = sourceIdentifier ?? id;
    
    // If no ID, cannot determine patchability - exclude from patching
    if (!sid) {
      return false;
    }

    if ( ! /^U\d{7,8}$/.test(sid)) {
      console.log(`Person ID ${sid} does not match expected pattern U####### or U########, excluding from patching.`);
      return false;
    }

    // Return false if personid is in the exclusion set, true otherwise
    const isExcluded = this.excludedPersonIds.has(sid);
    return !isExcluded;
  }

  /**
   * Generate the fieldset for retiring a person:
   * - Set active to false
   * - Set employer to UNASSIGNED organization
   * - Set organization to UNASSIGNED organization
   */
  public getPatchFieldset = async (person: HuronPerson): Promise<FieldSet> => {
    const unassignedHrn = await this.getUnassignedOrgHrn();

    const { firstName, lastName, employer, organization, active, id, employeeId } = person;
    console.log(JSON.stringify({ firstName, lastName, employer, organization, active }, null, 2));

    const buid = id && /^U\d{8}$/.test(id) ? id : employeeId!;

    return {
      fieldValues: [
        { 'sourceIdentifier': buid },
        { 'active': false },
        { 'employer': { hrn: unassignedHrn } },
        { 'organization': { hrn: unassignedHrn } }
      ]
    } as FieldSet;
  }

  /**
   * Static method to run the retirement patcher.
   * @param config Configuration for accessing the target system
   * @param personIdFile Path to file containing personids to EXCLUDE from retirement (one per line)
   * @param dryRun If true, logs operations without executing patches
   */
  public static runPatcher = async (config: Config, personIdFile: string, dryRun: boolean): Promise<void> => {
    const patcher = new BulkTargetPatcherForRetirement(config, personIdFile, dryRun);
    await patcher.patchPeople();
  }
}

async function main(): Promise<void> {
  const { 
    DRY_RUN, 
    HURON_PERSON_CONFIG_PATH, 
    SECRET_ARN, 
    CACHE_ENABLED, 
    CACHE_PATH,
    PERSON_ID_FILE 
  } = process.env;
  
  const dryRun = DRY_RUN === 'true';

  if (CACHE_ENABLED !== 'true') {
    console.log('CACHE_ENABLED environment variable is not set to "true". You need to cache the access token for bulk operations.');
    return;
  }

  if (!CACHE_PATH) {
    console.log('CACHE_PATH environment variable is not set. You need to set this to a writable path for caching the access token for bulk operations.');
    return;
  }

  if (!PERSON_ID_FILE) {
    console.log('PERSON_ID_FILE environment variable is not set. You need to provide a file containing personids to EXCLUDE from retirement.');
    return;
  }

  // Load configuration
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = await configManager
    .reset()
    .fromJsonString('HURON_PERSON_CONFIG_JSON')   // ← TaskDef secret injection
    .fromSecretManager(SECRET_ARN)                // ← Fallback to Secrets Manager
    .fromEnvironment()                            // ← Fallback to individual env var overrides
    .fromFileSystem(localConfigPath)              // ← Local dev only
    .getConfigAsync('person');

  await BulkTargetPatcherForRetirement.runPatcher(config, PERSON_ID_FILE, dryRun);
}

if (require.main === module) {
  const testEnvironment = TestEnvironment('BULK_TARGET_PATCHER_FOR_RETIREMENT');

  [
    'CACHE_ENABLED',
    'CACHE_PATH',
    'HURON_PERSON_CONFIG_PATH',
    'SECRET_ARN',
    'DRY_RUN',
    'PERSON_ID_FILE'
  ].forEach(testEnvironment.getVarOrEmptyString);

  main();
}
