import { CrudOperation, Input, TestEnvironment } from "integration-core";
import { main } from "../../SyncPersonBatch";
import { getLocalConfig, setFileLogging } from "../../Utils";
import { Config } from '../../config/Config';
import { ConfigManager } from "../../config/ConfigManager";
import { DataMapper, getDataMapper } from "../../data-mapper/DataMapper";

type CustomRoleDataMapperParams = {
  params: ConstructorParameters<typeof DataMapper>[0];
  roleHrns: string[];
  operation: 'append' | 'replace' | 'remove';
  innerMapper?: DataMapper; // Optional inner mapper for decorator chaining
};

/**
 * Custom DataMapper implementation that extends the standard DataMapper and overrides the 
 * getMappedData method to inject custom role assignments to ALL people being synced.
 * 
 * Supports three operations:
 * - 'append': Add custom roles to existing roles (merge and append at target)
 * - 'replace': Replace all roles with only custom roles (ignore source roles)
 * - 'remove': Remove custom roles from existing roles (subtract specified roles)
 * 
 * NOTE: This differs from SyncPersonBatchCustomRoleAssignment in that it applies the same 
 * set of roles to all people as a blanket operation, rather than assigning roles on a 
 * per-person basis, where each set of roles applied is specific to the individual.
 */
class CustomRoleDataMapper extends DataMapper {
  private roleHrns: string[];
  private operation: 'append' | 'replace' | 'remove';
  private innerMapper?: DataMapper;

  constructor(params: CustomRoleDataMapperParams) {
    super(params.params);
    this.roleHrns = params.roleHrns;
    this.operation = params.operation;
    this.innerMapper = params.innerMapper;
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  };

  /**
   * Override the standard getMappedData to inject custom role assignments into the mapped data.
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

    // Mutate the standard mapping to modify roles for all people
    const modifiedFieldSets = standardMappedData.fieldSets.map(fieldSet => {
      const modifiedFields = fieldSet.fieldValues.map(field => {
        if ('roles' in field) {
          const existingRoles = Array.isArray(field.roles) ? field.roles : [];
          const existingHrns = existingRoles.map(role => 
            typeof role === 'object' && role !== null && 'hrn' in role ? role.hrn : null
          ).filter((hrn): hrn is string => hrn !== null);
          
          if (this.operation === 'replace') {
            // Replace all roles with only custom roles
            return { 
              roles: this.roleHrns.map(hrn => ({ hrn }))
            };
          } else if (this.operation === 'append') {
            // Send only NEW roles (delta) - append directive will add them to existing
            const existingHrnSet = new Set(existingHrns);
            const deltaHrns = this.roleHrns.filter(hrn => !existingHrnSet.has(hrn));
            return { 
              roles: deltaHrns.map(hrn => ({ hrn }))
            };
          } else if (this.operation === 'remove') {
            // Calculate remaining roles after removal - replace directive will overwrite
            const customHrnSet = new Set(this.roleHrns);
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
    });

    return { ...standardMappedData, fieldSets: modifiedFieldSets };
  }
}

async function _main({ config, innerMapper }: { config?: Config; innerMapper?: DataMapper }) {
  // Parse role HRNs from environment
  const roleHrnsEnv = process.env.ROLE_HRNS;
  if (!roleHrnsEnv) {
    throw new Error('ROLE_HRNS environment variable is required');
  }
  let roleHrns = roleHrnsEnv
    .split(',')
    .map(hrn => hrn.trim())
    .map(hrn => hrn.startsWith('hrn:') ? hrn : `hrn:hrs:lists:roles/${hrn}`)
    .filter(hrn => hrn.length > 0);
  console.log(`Applying ${roleHrns.length} role(s) to all people`);

  // Parse and validate operation mode
  const operation = process.env.OPERATION?.toLowerCase();
  if (operation !== 'append' && operation !== 'replace' && operation !== 'remove') {
    throw new Error(`Invalid OPERATION value: '${operation}'. Must be 'append', 'replace', or 'remove'.`);
  }
  console.log(`Operation mode: ${operation.toUpperCase()}`);

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

  // Create an instance of the CustomRoleDataMapper wrapping the mapper
  const customMapper = new CustomRoleDataMapper({
    params: mapperToDecorate.params,
    roleHrns,
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
  const testEnvironment = TestEnvironment('SYNC_PERSON_BATCH_CUSTOM_ROLE_PATCHER');

  [
    'SYNC_PREVIEW', 
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'ROLE_HRNS',
    'OPERATION',
    'OUTPUT_FILE_PATH'
  ].forEach(testEnvironment.getVar);

  [
    'SYNC_BUIDS_FILE_PATH', 
    'SYNC_BUIDS',
  ].forEach(testEnvironment.getVarOrEmptyString);

  const logFilePath = process.env.OUTPUT_FILE_PATH || 'data/sync_person_batch_custom_role_patcher_output.json';
  setFileLogging(logFilePath);

  _main({});
}