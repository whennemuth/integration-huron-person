import { CrudOperation, Input, TestEnvironment } from "integration-core";
import { main } from "../../SyncPersonBatch";
import { getLocalConfig, setFileLogging } from "../../Utils";
import { DataMapper, getDataMapper } from "../../data-mapper/DataMapper";
import { ConfigManager } from "../../config/ConfigManager";
import { Config } from "../../config/Config";

type CustomRoleDataMapperParams = {
  params: ConstructorParameters<typeof DataMapper>[0];
  roleHrns: string[];
  replace: boolean;
  override: boolean;
};

/**
 * Custom DataMapper implementation that extends the standard DataMapper and overrides the 
 * getMappedData method to inject custom role assignments by either replacing or appending
 * the roles to ALL people being synced.
 */
class CustomRoleDataMapper extends DataMapper {
  private roleHrns: string[];
  private replace: boolean;
  private override: boolean;
  /**
   * Create an instance with role HRNs and operation mode.
   * @param config 
   * @param params 
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
    this.roleHrns = params.roleHrns;
    this.replace = params.replace;
    this.override = params.override;
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  };

  /**
   * Override the standard getMappedData to inject custom role assignments into the mapped data.
   * Either replaces all roles or appends to existing roles at the target system based on replace flag.
   * The override flag determines whether to use only the custom roles or combine with existing roles.
   * @param params 
   * @returns 
   */
  public getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    const standardMappedData = super.getMappedData(params);

    // Mutate the standard mapping to add or override roles for all people
    const modifiedFieldSets = standardMappedData.fieldSets.map(fieldSet => {
      const modifiedFields = fieldSet.fieldValues.map(field => {
        if ('roles' in field) {
          if (this.override) {
            // Use only the custom roles
            return { 
              roles: this.roleHrns.map(hrn => ({ hrn }))
            };
          } else {
            // Combine standard roles with custom roles and remove duplicates
            const existingRoles = Array.isArray(field.roles) ? field.roles : [];
            const existingHrns = existingRoles.map(role => 
              typeof role === 'object' && role !== null && 'hrn' in role ? role.hrn : null
            ).filter((hrn): hrn is string => hrn !== null);
            
            // Combine and remove duplicates
            const allHrns = [...existingHrns, ...this.roleHrns];
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
    });

    return { ...standardMappedData, fieldSets: modifiedFieldSets };
  }
}

async function _main() {
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

  // Parse replace flag
  const replace = process.env.REPLACE?.toLowerCase() === 'true';
  console.log(`Operation mode: ${replace ? 'REPLACE' : 'APPEND'}`);

  // Parse override flag
  const override = process.env.OVERRIDE?.toLowerCase() === 'true';
  console.log(`Override mode: ${override ? 'ENABLED' : 'DISABLED'}`);

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

  // Create an instance of the CustomRoleDataMapper with the same params as the standard mapper
  const customMapper = await CustomRoleDataMapper.getInstance(config, {
    params: standardMapper.params,
    roleHrns,
    replace,
    override
  });

  if (!customMapper) {
    throw new Error('Failed to create CustomRoleDataMapper instance');
  }

  // Pass the custom DataMapper to the main sync function in SyncPersonBatch, which will use it for 
  // all data mapping during the standard sync process
  await main(customMapper);
}

// Run if this file is executed directly

if (require.main === module) {
  const testEnvironment = TestEnvironment('SYNC_PERSON_BATCH_CUSTOM_ROLE_PATCHER');

  [
    'SYNC_PREVIEW', 
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'ROLE_HRNS',
    'REPLACE',
    'OVERRIDE',
    'OUTPUT_FILE_PATH'
  ].forEach(testEnvironment.getVar);

  [
    'SYNC_BUIDS_FILE_PATH', 
    'SYNC_BUIDS',
  ].forEach(testEnvironment.getVarOrEmptyString);

  const logFilePath = process.env.OUTPUT_FILE_PATH || 'data/sync_person_batch_custom_role_patcher_output.json';
  setFileLogging(logFilePath);

  _main();
}