import * as fs from 'fs';
import { CrudOperation, Input, TestEnvironment } from "integration-core";
import { main } from "../../SyncPersonBatch";
import { getLocalConfig, setFileLogging } from "../../Utils";
import { ConfigManager } from "../../config/ConfigManager";
import { DataMapper, getDataMapper } from "../../data-mapper/DataMapper";
import { loadAuthorizedBuids, UnassignedOrgEnforcer } from "./SyncPersonBatchUnassignedOrgEnforcer";

type CustomLegacySeederParams = {
  params: ConstructorParameters<typeof DataMapper>[0];
  buidRoleMap: Map<string, string[]>;
  innerMapper: DataMapper; // Required - typically UnassignedOrgEnforcer
  replaceRoles?: boolean; // Optional - default false, whether to replace orgs or not
};

/**
 * Custom DataMapper implementation that seeds legacy role assignments for specific people
 * after organization enforcement. This decorator is designed to chain with UnassignedOrgEnforcer
 * to ensure people get both proper org assignment AND legacy roles.
 * 
 * Purpose:
 * - Append legacy role HRNs to specific people identified by BUID
 * - Work as a decorator wrapping UnassignedOrgEnforcer
 * - Support file or string input with format: buid,role1,role2,role3
 * 
 * Design:
 * - Requires innerMapper (typically UnassignedOrgEnforcer)
 * - Calls innerMapper.getMappedData() to get org-enforced data
 * - Appends legacy roles to people found in buidRoleMap
 * - Deduplicates role HRNs to avoid duplicates
 * 
 * Usage Pattern:
 * StandardMapper → UnassignedOrgEnforcer → CustomLegacySeeder → (optional) other decorators
 */
class CustomLegacySeederDataMapper extends DataMapper {
  private buidRoleMap: Map<string, string[]>;
  private innerMapper: DataMapper;
  private replaceRoles: boolean;

  constructor(params: CustomLegacySeederParams) {
    super(params.params);
    this.buidRoleMap = params.buidRoleMap;
    this.innerMapper = params.innerMapper;
    this.replaceRoles = params.replaceRoles || false;

    if (!this.innerMapper) {
      throw new Error('innerMapper is required for CustomLegacySeederDataMapper (typically UnassignedOrgEnforcer)');
    }

    console.log(`CustomLegacySeederDataMapper initialized with ${this.buidRoleMap.size} BUID-role mappings`);
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  };

  /**
   * Override getMappedData to append legacy roles after org enforcement.
   * 
   * Flow:
   * 1. Call innerMapper.getMappedData() to get org-enforced mapped data
   * 2. Extract BUID from the mapped data
   * 3. If BUID has legacy roles in buidRoleMap, append them
   * 4. Deduplicate role HRNs
   * 
   * @param params 
   * @returns 
   */
  public getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    // Call innerMapper (typically UnassignedOrgEnforcer) to get org-enforced data
    const orgEnforcedMappedData = this.innerMapper.getMappedData(params);

    // Extract BUID from mapped data
    const buid = this.extractBuid(orgEnforcedMappedData);

    if (!buid) {
      console.warn('Could not extract BUID from mapped data, returning org-enforced data unchanged');
      return orgEnforcedMappedData;
    }

    // Check if this BUID has legacy roles to append
    if (!this.buidRoleMap.has(buid)) {
      // No legacy roles for this person, return org-enforced data unchanged
      console.log(`BUID ${buid} has no legacy roles - passing through org-enforced data`);
      return orgEnforcedMappedData;
    }

    // Append legacy roles
    const legacyRoles = this.buidRoleMap.get(buid)!;
    console.log(`BUID ${buid} - appending ${legacyRoles.length} legacy role(s)`);

    const mappedDataWithLegacyRoles = this.appendRolesToMappedData(orgEnforcedMappedData, legacyRoles);

    return mappedDataWithLegacyRoles;
  }

  /**
   * Extract BUID (sourceIdentifier) from mapped Input data.
   * @param mappedData 
   * @returns 
   */
  private extractBuid(mappedData: Input): string | undefined {
    if (!mappedData.fieldSets || mappedData.fieldSets.length === 0) {
      return undefined;
    }

    const fieldSet = mappedData.fieldSets[0];
    const sourceIdentifierField = fieldSet.fieldValues.find(field => 'sourceIdentifier' in field);

    if (sourceIdentifierField && 'sourceIdentifier' in sourceIdentifierField) {
      const buidValue = sourceIdentifierField.sourceIdentifier;
      return typeof buidValue === 'string' ? buidValue : String(buidValue);
    }

    return undefined;
  }

  /**
   * Append roles to mapped data, deduplicating with existing roles.
   * @param mappedData 
   * @param rolesToAppend 
   * @returns 
   */
  private appendRolesToMappedData(mappedData: Input, rolesToAppend: string[]): Input {
    if (rolesToAppend.length === 0) {
      return mappedData; // No roles to append
    }

    const modifiedFieldSets = mappedData.fieldSets.map(fieldSet => {
      const modifiedFields = fieldSet.fieldValues.map(field => {
        if ('roles' in field) {
          // Append new roles to existing roles
          const existingRoles = Array.isArray(field.roles) ? field.roles : [];
          const existingHrns = existingRoles
            .map(role => typeof role === 'object' && role !== null && 'hrn' in role ? role.hrn : null)
            .filter((hrn): hrn is string => hrn !== null);

          // Combine and deduplicate
          const allHrns = [...existingHrns, ...rolesToAppend];
          const uniqueHrns = Array.from(new Set(allHrns));

          console.log(`  Roles: ${existingHrns.length} existing + ${rolesToAppend.length} legacy = ${uniqueHrns.length} unique`);

          return { 
            roles: uniqueHrns.map(hrn => ({ hrn }))
          };
        }

                  
        // Update __arrayFieldOperations based on replace flag
        if ('__arrayFieldOperations' in field && !this.replaceRoles) {
          // Keep append behavior when not replacing
          return field;
        }
        if ('__arrayFieldOperations' in field && this.replaceRoles) {
          // Remove append instruction when replacing (use default replace behavior)
          // return { __arrayFieldOperations: {} }; // This won't work - defaults to append
          return { };
        }

        return field;
      });

      return { ...fieldSet, fieldValues: modifiedFields };
    });

    return { ...mappedData, fieldSets: modifiedFieldSets };
  }
}

/**
 * Load BUID-role mappings from file or string.
 * 
 * Format: buid,role1,role2,role3
 * - One entry per line
 * - Lines starting with # are comments
 * - Empty lines ignored
 * - BUIDs with no roles (just "buid,") are allowed (0 roles to append)
 * 
 * @param source - File path or string content
 * @param isFilePath - True if source is a file path, false if it's content
 * @returns Map of BUID to role HRNs
 */
function loadBuidRoles(source: string, isFilePath: boolean): Map<string, string[]> {
  let content: string;
  let lines: string[];

  if (isFilePath) {
    if (!fs.existsSync(source)) {
      throw new Error(`BUID-roles file not found: ${source}`);
    }
    content = fs.readFileSync(source, 'utf-8');
    lines = content.split('\n');
  } else {
    content = source;
    lines = content.split(/[\n|]+/); // Split on newlines or pipe characters
  }

  const buidRoleMap = new Map<string, string[]>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const parts = trimmed.split(',').map(s => s.trim());
    if (parts.length === 0) {
      continue;
    }

    const [buid, ...roles] = parts;

    // Validate BUID is not empty
    if (!buid) {
      console.warn(`Skipping line with empty BUID: ${line}`);
      continue;
    }

    /**
     * Roles may not be full HRNs, so we need to convert them to HRNs if they are aliases.
     * For example, "pi" should become "hrn:hrs:lists:roles/irb-principal-investigator".
     * We'll define a simple mapping for known aliases.
     * @param role 
     * @returns 
     */
    const getHrnFromAlias = (role: string): string => {
      if (!role) {
        return ''; // Skip empty roles
      }
      const hrnPrefix = 'hrn:hrs:lists:roles';
      const aliases = new Map<string, string>([
        ['pi', 'hrn:hrs:lists:roles/irb-principal-investigator'],
        ['reviewer', 'hrn:hrs:lists:reviewer-roles/primary']
      ]);
      let _role = role.trim();
      if (_role.startsWith('hrn:')) {
        return _role; // Already an HRN
      }
      if(aliases.has(_role.toLowerCase())) {
        return aliases.get(_role.toLowerCase())!;
      }
      return `${hrnPrefix}/${_role}`; // Convert alias to HRN
    };

    let validRoles = roles.map(role => {
      const _role = getHrnFromAlias(role);
      if (!_role) return ''; // Skip empty roles
      if (!_role.startsWith('hrn:')) {
        console.warn(`Invalid role HRN for BUID ${buid}: ${_role} (must start with 'hrn:')`);
        return ''; // Skip invalid roles
      }
      return _role;
    }).filter(role => role !== ''); // Remove empty strings
    buidRoleMap.set(buid, validRoles);
  }

  console.log(`Loaded ${buidRoleMap.size} BUID-role mappings from ${isFilePath ? 'file' : 'string'}`);
  return buidRoleMap;
}

/**
 * Build SYNC_BUIDS from BUID-role map.
 * @param buidRoleMap 
 * @returns 
 */
function buildSyncBuids(buidRoleMap: Map<string, string[]>): string {
  return Array.from(buidRoleMap.keys()).join(',');
}

async function _main(innerMapper?: DataMapper) {
  // Gather environment variables
  const testEnvironment = TestEnvironment('SYNC_PERSON_BATCH_CUSTOM_LEGACY_SEEDER');

  [
    'SYNC_PREVIEW', 
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'AUTHORIZED_BUIDS_FILE_PATH', // From UnassignedOrgEnforcer
    'OUTPUT_FILE_PATH',
    'REPLACE_ROLES' // Optional - default false, whether to replace orgs or not
  ].forEach(testEnvironment.getVar);

  [
    'SYNC_BUIDS_AND_ROLES_FILE_PATH',
    'SYNC_BUIDS_AND_ROLES'
  ].forEach(testEnvironment.getVarOrEmptyString);

  const logFilePath = process.env.OUTPUT_FILE_PATH || 'data/sync_person_batch_custom_legacy_seeder_output.json';
  setFileLogging(logFilePath);
  const replaceRoles = process.env.REPLACE_ROLES === 'true';

  // Parse SYNC_BUIDS_AND_ROLES source
  const { SYNC_BUIDS_AND_ROLES_FILE_PATH, SYNC_BUIDS_AND_ROLES } = process.env;

  let buidRoleMap: Map<string, string[]>;
  if (SYNC_BUIDS_AND_ROLES) {
    buidRoleMap = loadBuidRoles(SYNC_BUIDS_AND_ROLES, false);
  } else if (SYNC_BUIDS_AND_ROLES_FILE_PATH) {
    buidRoleMap = loadBuidRoles(SYNC_BUIDS_AND_ROLES_FILE_PATH, true);
  } else {
    throw new Error('Either SYNC_BUIDS_AND_ROLES_FILE_PATH or SYNC_BUIDS_AND_ROLES is required');
  }

  // Set SYNC_BUIDS for batch processing (extract BUIDs from buidRoleMap)
  const syncBuids = buildSyncBuids(buidRoleMap);
  process.env.SYNC_BUIDS = syncBuids;
  console.log(`Set SYNC_BUIDS: ${syncBuids}`);

  // Load configuration
  const { HURON_PERSON_CONFIG_PATH, AUTHORIZED_BUIDS_FILE_PATH } = process.env;
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = configManager.reset()
    .fromEnvironment()
    .fromFileSystem(localConfigPath)
    .getConfig('person');

  // Determine the mapper to use as innerMapper for this decorator
  let mapperToDecorate: DataMapper;

  if (innerMapper) {
    // An innerMapper was provided (chaining scenario)
    mapperToDecorate = innerMapper;
  } else {
    // Create the standard decorator chain: StandardMapper → UnassignedOrgEnforcer
    if (!AUTHORIZED_BUIDS_FILE_PATH) {
      throw new Error('AUTHORIZED_BUIDS_FILE_PATH environment variable is required for UnassignedOrgEnforcer');
    }

    const standardMapper = await getDataMapper(config, { 
      orgMap: true, stateMap: true, countryMap: true 
    });

    // Create UnassignedOrgEnforcer as innerMapper
    const authorizedBuids = loadAuthorizedBuids(AUTHORIZED_BUIDS_FILE_PATH);
    const enforcerMapper = new UnassignedOrgEnforcer({
      params: standardMapper.params,
      authorizedBuids,
      innerMapper: standardMapper
    });

    mapperToDecorate = enforcerMapper;
  }

  // Create CustomLegacySeeder wrapping the innerMapper
  const legacySeederMapper = new CustomLegacySeederDataMapper({
    params: mapperToDecorate.params,
    buidRoleMap,
    innerMapper: mapperToDecorate,
    replaceRoles
  });

  /**
   * Force updates to ensure legacy role seeding is applied even if source and target are in 
   * sync. This is necessary because roles are excluded from hash comparison 
   * (see src\data-mapper\FieldFilter.ts).
   */
  const forceUpdate = true;

  // Pass to batch sync
  await main({ dataMapper: legacySeederMapper, forceUpdate });
}

// Run if this file is executed directly
if (require.main === module) {
  _main();
}

export { CustomLegacySeederDataMapper, loadBuidRoles, buildSyncBuids };
