import { CrudOperation, Input, TestEnvironment } from "integration-core";
import { main } from "../../SyncPersonBatch";
import { getLocalConfig, setFileLogging } from "../../Utils";
import { DataMapper, getDataMapper } from "../../data-mapper/DataMapper";
import { ConfigManager } from "../../config/ConfigManager";
import { Config } from "../../config/Config";
import * as fs from 'fs';
import * as path from 'path';

type RoleAssignment = {
  buid: string;
  name?: string;
  "role-hrns": string[];
  completed?: boolean;
};

type CustomRoleDataMapperParams = {
  params: ConstructorParameters<typeof DataMapper>[0];
  roleAssignments: Map<string, string[]>;
  replace: boolean;
  override: boolean;
};

/**
 * Custom DataMapper implementation that uses a configuration file to:
 * 
 * 1) Create new people each with their own specific set of roles 
 *    or...
 * 2) Update people with a specific set of roles if they already exist.
 *  
 * This extends the standard DataMapper and overrides the getMappedData 
 * method to inject custom role assignments while preserving the default role 
 * (hrn:hrs:lists:roles/irb-general-user).
 */
class CustomRoleDataMapper extends DataMapper {
  private roleAssignments: Map<string, string[]>;
  private replace: boolean;
  private override: boolean;

  /**
   * Create an instance with role assignments loaded from a JSON file.
   * @param config 
   * @param params 
   * @param rolesFilePath Path to the JSON file containing role assignments
   * @returns 
   */
  public static getInstance = async (
    config: Config, 
    params: CustomRoleDataMapperParams
  ): Promise<CustomRoleDataMapper> => {
    return new CustomRoleDataMapper(params);
  }

  private constructor(params: CustomRoleDataMapperParams) {
    super(params.params);
    this.roleAssignments = params.roleAssignments;
    this.replace = params.replace;
    this.override = params.override;
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  };

  /**
   * Override the standard getMappedData to inject custom role assignments into the mapped data.
   * For people with custom role assignments, roles are either replaced or appended based on
   * the replace flag. The override flag determines whether to use only custom roles or combine
   * with existing roles from the source data.
   * @param params 
   * @returns 
   */
  public getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    const standardMappedData = super.getMappedData(params);

    // Mutate the standard mapping to add or override roles for specific people
    const modifiedFieldSets = standardMappedData.fieldSets.map(fieldSet => {
      // Find the sourceIdentifier (BUID) for this person
      const sourceIdentifierField = fieldSet.fieldValues.find(field => 'sourceIdentifier' in field);
      const buidValue = sourceIdentifierField?.sourceIdentifier;
      
      // Ensure BUID is a string
      const buid = typeof buidValue === 'string' ? buidValue : String(buidValue);

      // If this person has custom role assignments, modify the roles field
      if (buid && this.roleAssignments.has(buid)) {
        const customRoleHrns = this.roleAssignments.get(buid)!;
        
        const modifiedFields = fieldSet.fieldValues.map(field => {
          if ('roles' in field) {
            if (this.override) {
              // Use only the custom roles
              return { 
                roles: customRoleHrns.map(hrn => ({ hrn }))
              };
            } else {
              // Combine standard roles with custom roles and remove duplicates
              const existingRoles = Array.isArray(field.roles) ? field.roles : [];
              const existingHrns = existingRoles.map(role => 
                typeof role === 'object' && role !== null && 'hrn' in role ? role.hrn : null
              ).filter((hrn): hrn is string => hrn !== null);
              
              // Combine and remove duplicates
              const allHrns = [...existingHrns, ...customRoleHrns];
              const uniqueHrns = Array.from(new Set(allHrns));
              
              return { 
                roles: uniqueHrns.map(hrn => ({ hrn }))
              };
            }
          }
          
          // Update __arrayFieldOperations based on replace flag
          if ('__arrayFieldOperations' in field && !this.replace) {
            // Keep append behavior when not replacing
            return field;
          }
          if ('__arrayFieldOperations' in field && this.replace) {
            // Remove append instruction when replacing (use default replace behavior)
            return { __arrayFieldOperations: {} };
          }
          
          return field;
        });

        return { ...fieldSet, fieldValues: modifiedFields };
      }

      // No custom roles for this person, return unchanged
      return fieldSet;
    });

    return { ...standardMappedData, fieldSets: modifiedFieldSets };
  }
}

/**
 * Load role assignments from a JSON file and return as a Map of BUID to role HRNs.
 * Only includes entries where completed !== false.
 * @param rolesFilePath 
 * @returns 
 */
function loadRoleAssignments(rolesFilePath: string): Map<string, string[]> {
  const roleAssignments = new Map<string, string[]>();
  
  if (!fs.existsSync(rolesFilePath)) {
    throw new Error(`Roles file not found: ${rolesFilePath}`);
  }

  const fileContent = fs.readFileSync(rolesFilePath, 'utf-8');
  const assignments: RoleAssignment[] = JSON.parse(fileContent);

  // Only include entries where completed is not false
  assignments
    .filter(assignment => assignment.completed !== true)
    .forEach(assignment => {
      roleAssignments.set(assignment.buid, assignment["role-hrns"]);
    });

  return roleAssignments;
}

/**
 * Build SYNC_BUIDS from the role assignments (entries where completed !== true)
 * @param roleAssignments 
 * @returns 
 */
function buildSyncBuids(roleAssignments: Map<string, string[]>): string {
  return Array.from(roleAssignments.keys()).join(',');
}

async function _main() {
  // Load role assignments from file
  const rolesFilePath = process.env.ROLES_FILE_PATH;
  if (!rolesFilePath) {
    throw new Error('ROLES_FILE_PATH environment variable is required');
  }

  const resolvedPath = path.resolve(rolesFilePath);
  console.log(`Loading role assignments from: ${resolvedPath}`);
  
  const roleAssignments = loadRoleAssignments(resolvedPath);
  console.log(`Loaded ${roleAssignments.size} role assignments`);

  // Build and set SYNC_BUIDS dynamically
  const syncBuids = buildSyncBuids(roleAssignments);
  process.env.SYNC_BUIDS = syncBuids;
  console.log(`Set SYNC_BUIDS: ${syncBuids}`);

  // Load configuration
  const { HURON_PERSON_CONFIG_PATH } = process.env;
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = configManager.reset()
    .fromEnvironment()
    .fromFileSystem(localConfigPath)
    .getConfig('person');

  // Get a standard DataMapper instance to extract params and mappings for the CustomRoleDataMapper
  const standardMapper: DataMapper = await getDataMapper(config, { 
    orgMap: false, stateMap: true, countryMap: true 
  });

  // Parse REPLACE and OVERRIDE flags from environment
  const { REPLACE, OVERRIDE } = process.env;
  const replace = `${REPLACE}`.trim().toLowerCase() === 'true';
  const override = `${OVERRIDE}`.trim().toLowerCase() === 'true';

  console.log(`REPLACE mode: ${replace ? 'enabled (replace existing roles)' : 'disabled (append to existing roles)'}`);
  console.log(`OVERRIDE mode: ${override ? 'enabled (custom roles only)' : 'disabled (combine with source roles)'}`);

  // Create an instance of the CustomRoleDataMapper with the same params as the standard mapper
  const customMapper = await CustomRoleDataMapper.getInstance(config, {
    params: standardMapper.params,
    roleAssignments,
    replace,
    override
  });

  if (!customMapper) {
    throw new Error('Failed to create CustomRoleDataMapper instance');
  }

  /**
   * Force updates to ensure role assignments are applied even if source and target are in 
   * sync. This is necessary because the standard sync process determines if source and target
   * are in sync by comparing computed hashes. These hashes are generated without considering
   * roles (see src\data-mapper\FieldFilter.ts). This in turn would prevent role assignments 
   * from being applied because the sync process would skip the update.
   */
  const forceUpdate = true;

  // Pass the custom DataMapper to the main sync function in SyncPersonBatch, which will use it for 
  // all data mapping during the standard sync process
  await main({ dataMapper: customMapper, forceUpdate });
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('SYNC_PERSON_BATCH_CUSTOM_ROLE_ASSIGN');

  [
    'SYNC_PREVIEW', 
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'ROLES_FILE_PATH',
    'REPLACE',
    'OVERRIDE',
    'OUTPUT_FILE_PATH'
  ].forEach(testEnvironment.getVar);

  const logFilePath = process.env.OUTPUT_FILE_PATH || 'data/sync_person_batch_custom_role_assignments.json';
  setFileLogging(logFilePath);

  _main();
}
