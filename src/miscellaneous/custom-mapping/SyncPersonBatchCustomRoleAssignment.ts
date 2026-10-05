import * as fs from 'fs';
import { CrudOperation, Input, TestEnvironment } from "integration-core";
import * as path from 'path';
import { main } from "../../SyncPersonBatch";
import { getLocalConfig, setFileLogging } from "../../Utils";
import { Config } from '../../config/Config';
import { ConfigManager } from "../../config/ConfigManager";
import { DataMapper, getDataMapper } from "../../data-mapper/DataMapper";

type RoleAssignment = {
  buid: string;
  name?: string;
  "role-hrns": string[];
  completed?: boolean;
};

type CustomRoleDataMapperParams = {
  params: ConstructorParameters<typeof DataMapper>[0];
  roleAssignments: Map<string, string[]>;
  operation: 'append' | 'replace' | 'remove';
  innerMapper?: DataMapper; // Optional inner mapper for decorator chaining
};

/**
 * Custom DataMapper implementation that uses a configuration file to:
 * 
 * 1) Create new people each with their own specific set of roles 
 *    or...
 * 2) Update people with a specific set of roles if they already exist.
 *  
 * This extends the standard DataMapper and overrides the getMappedData 
 * method to inject custom role assignments on a per-person basis.
 * 
 * Supports three operations:
 * - 'append': Add custom roles to existing roles (merge and append at target)
 * - 'replace': Replace all roles with only custom roles (ignore source roles)
 * - 'remove': Remove custom roles from existing roles (subtract specified roles)
 * 
 * NOTE: This differs from SyncPersonBatchCustomRolePatcher in that it assigns roles on a 
 * per-person basis, where each set of roles applied is specific to the individual, rather than 
 * applying the same set of roles to all people as a blanket operation.
 */
class CustomRoleDataMapper extends DataMapper {
  private roleAssignments: Map<string, string[]>;
  private operation: 'append' | 'replace' | 'remove';
  private innerMapper?: DataMapper;

  constructor(params: CustomRoleDataMapperParams) {
    super(params.params);
    this.roleAssignments = params.roleAssignments;
    this.operation = params.operation;
    this.innerMapper = params.innerMapper;
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  };

  /**
   * Override the standard getMappedData to inject custom role assignments into the mapped data.
   * For people with custom role assignments, roles are modified according to the operation mode.
   * 
   * Operation modes:
   * - 'append': Send only NEW roles (delta) not already present, use append directive
   * - 'replace': Use only custom roles, use replace directive
   * - 'remove': Calculate remaining roles after removal, use replace directive
   * 
   * @param params 
   * @returns 
   */
  public getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    // Use innerMapper if provided, else fall back to super (standard DataMapper)
    const standardMappedData = this.innerMapper 
      ? this.innerMapper.getMappedData(params)
      : super.getMappedData(params);

    // Mutate the standard mapping to modify roles for specific people
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
            const existingRoles = Array.isArray(field.roles) ? field.roles : [];
            const existingHrns = existingRoles.map(role => 
              typeof role === 'object' && role !== null && 'hrn' in role ? role.hrn : null
            ).filter((hrn): hrn is string => hrn !== null);
            
            if (this.operation === 'replace') {
              // Replace all roles with only custom roles
              return { 
                roles: customRoleHrns.map(hrn => ({ hrn }))
              };
            } else if (this.operation === 'append') {
              // Send only NEW roles (delta) - append directive will add them to existing
              const existingHrnSet = new Set(existingHrns);
              const deltaHrns = customRoleHrns.filter(hrn => !existingHrnSet.has(hrn));
              return { 
                roles: deltaHrns.map(hrn => ({ hrn }))
              };
            } else if (this.operation === 'remove') {
              // Calculate remaining roles after removal - replace directive will overwrite
              const customHrnSet = new Set(customRoleHrns);
              const remainingHrns = existingHrns.filter(hrn => !customHrnSet.has(hrn));
              return { 
                roles: remainingHrns.map(hrn => ({ hrn }))
              };
            }
          }
          
          // Update __arrayFieldOperations based on operation mode
          if ('__arrayFieldOperations' in field) {
            if (this.operation === 'replace' || this.operation === 'remove') {
              // Use replace directive for both replace and remove operations
              // Remove append instruction when replacing (use default replace behavior)
              // return { __arrayFieldOperations: {} }; // This won't work - defaults to append
              return { };
            } else {
              // Keep append directive for append operation
              return field;
            }
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

async function _main({ config, innerMapper }: { config?: Config; innerMapper?: DataMapper }) {

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

  if(!config) {
    // Load configuration
    const { HURON_PERSON_CONFIG_PATH } = process.env;
    const configManager = ConfigManager.getInstance();
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    config = configManager.reset()
      .fromEnvironment()
      .fromFileSystem(localConfigPath)
      .getConfig('person');
  }

  // Get mapper to decorate (either provided innerMapper or create standard mapper)
  let mapperToDecorate: DataMapper;
  if (innerMapper) {
    mapperToDecorate = innerMapper;
  } else {
    mapperToDecorate = await getDataMapper(config, { 
      orgMap: false, stateMap: true, countryMap: true 
    });
  }

  // Parse and validate operation mode
  const operation = process.env.OPERATION?.toLowerCase();
  if (operation !== 'append' && operation !== 'replace' && operation !== 'remove') {
    throw new Error(`Invalid OPERATION value: '${operation}'. Must be 'append', 'replace', or 'remove'.`);
  }
  console.log(`Operation mode: ${operation.toUpperCase()}`);

  // Create an instance of the CustomRoleDataMapper wrapping the mapper
  const customMapper = new CustomRoleDataMapper({
    params: mapperToDecorate.params,
    roleAssignments,
    operation,
    innerMapper: mapperToDecorate
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

  // Pass the custom DataMapper to the main sync function in SyncPersonBatch
  await main({ dataMapper: customMapper, forceUpdate, config });
}

// Run if this file is executed directly
if (require.main === module) {
  // Gather environment variables
  const testEnvironment = TestEnvironment('SYNC_PERSON_BATCH_CUSTOM_ROLE_ASSIGN');

  [
    'SYNC_PREVIEW', 
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'ROLES_FILE_PATH',
    'OPERATION',
    'OUTPUT_FILE_PATH'
  ].forEach(testEnvironment.getVar);

  const logFilePath = process.env.OUTPUT_FILE_PATH || 'data/sync_person_batch_custom_role_assignments.json';
  setFileLogging(logFilePath);

  _main({});
}
