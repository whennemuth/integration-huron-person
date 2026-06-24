import { CrudOperation, Input, TestEnvironment } from "integration-core";
import { main } from "../SyncPersonBatch";
import { getLocalConfig, setFileLogging } from "../Utils";
import { DataMapper, getDataMapper } from "../data-mapper/DataMapper";
import { ConfigManager } from "../config/ConfigManager";
import { Config } from "../config/Config";
import { ReadOrganization } from "../data-target/crud/ReadOrganization";

type OrgFields = {
  hrn?: string, sourceIdentifier?: string
};
type CustomOrgDataMapperParams = {
  params: ConstructorParameters<typeof DataMapper>[0];
  organization?: OrgFields;
  employer?: OrgFields;
};

/**
 * Custom DataMapper implementation that can override (but probably fills missing) organization and 
 * employer fields with fixed HRNs for all records. This is used to simulate a scenario where the 
 * source data does not contain reliable organization/employer identifiers, and we want to force all 
 * records to be associated with specific HRNs. The custom DataMapper extends the standard 
 * DataMapper and overrides the getMappedData method to apply the custom logic.
 */
class CustomOrgDataMapper extends DataMapper {
  private org?: OrgFields;
  private emp?: OrgFields;

  /**
   * Set both organization and employer HRNs either by directly providing HRNs or by looking them up 
   * using source identifiers.
   * @param params 
   * @returns 
   */
  public static getInstance = async (config: Config, params: CustomOrgDataMapperParams): Promise<CustomOrgDataMapper|undefined> => {
    let { 
      organization: { hrn: orgHrn, sourceIdentifier: orgSid } = {}, 
      employer: { hrn: empHrn, sourceIdentifier: empSid } = {}
    } = params;

    if(orgHrn && empHrn) {
      // If HRNs are directly provided, use them
      return new CustomOrgDataMapper(params);
    }

    if(orgHrn && !empSid) {
      params.employer = { hrn: orgHrn };
      return new CustomOrgDataMapper(params);
    }

    if(empHrn && !orgSid) {
      params.organization = { hrn: empHrn };
      return new CustomOrgDataMapper(params);
    }

    if(orgHrn) {
      const empHrn = await this.lookupOrganizationHrn(config, empSid!);
      params.employer = { hrn: empHrn };
      return new CustomOrgDataMapper(params);
    }

    if(empHrn) {
      const orgHrn = await this.lookupOrganizationHrn(config, orgSid!);
      params.organization = { hrn: orgHrn };
      return new CustomOrgDataMapper(params);
    }

    if(orgSid) {
      const orgHrn = await this.lookupOrganizationHrn(config, orgSid);
      params.organization = { hrn: orgHrn };
      if(!empSid) {
        params.employer = { hrn: orgHrn };
      }
    }

    if(empSid) {
      const empHrn = await this.lookupOrganizationHrn(config, empSid);
      params.employer = { hrn: empHrn };
      if(!orgSid) {
        params.organization = { hrn: empHrn };
      }
    }

    return new CustomOrgDataMapper(params);
  }

  private static lookupOrganizationHrn = async (config: Config, sourceIdentifier: string): Promise<string | undefined> => {
    const reader = new ReadOrganization(config);
    const organizationData = await reader.readOrganizationBySourceIdentifier(sourceIdentifier);
    return organizationData?.[0]?.hrn;
  }

  private constructor(params: CustomOrgDataMapperParams) {
    super(params.params);
    this.org = params.organization;
    this.emp = params.employer;

    if(!this.org?.hrn) {
      throw new Error('Organization HRN must be provided in CustomOrgDataMapperParams');
    }
    if(!this.emp?.hrn) {
      throw new Error('Employer HRN must be provided in CustomOrgDataMapperParams');
    }
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  };

  /**
   * Override the standard getMappedData to inject custom organization and employer HRNs into 
   * the mapped data.
   * @param params 
   * @returns 
   */
  public getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    const standardMappedData = super.getMappedData(params);

    // Mutate the standard mapping to add or override the organization and employer fields.
    const modifiedFieldSets = standardMappedData.fieldSets.map(fieldSet => {
      const { emp: { hrn: empHrn } = {}, org: { hrn: orgHrn } = {} } = this;
      
      // Track which fields exist across all Field objects
      const fieldNames = new Set(
        fieldSet.fieldValues.flatMap(field => Object.keys(field))
      );
      
      // Map existing fields, overriding employer/organization if present
      const modifiedFields = fieldSet.fieldValues.map(field => {
        if ('employer' in field) {
          return { employer: { hrn: empHrn } };
        }
        if ('organization' in field) {
          return { organization: { hrn: orgHrn } };
        }
        return field;
      });

      // Add employer and organization fields if they don't exist
      if (!fieldNames.has('employer')) {
        modifiedFields.push({ employer: { hrn: empHrn } });
      }
      if (!fieldNames.has('organization')) {
        modifiedFields.push({ organization: { hrn: orgHrn } });
      }

      return { ...fieldSet, fieldValues: modifiedFields };
    });

    return { ...standardMappedData, fieldSets: modifiedFieldSets };
  }

  /**
   * Override critical validation error message to ignore missing organization/employer errors 
   * since we are forcing HRNs in the mapper regardless of source data quality. This allows us 
   * to test the sync process without worrying about source data issues related to these fields.
   */
  public get criticalValidationErrorMessage(): string | undefined {
    const msg = super.criticalValidationErrorMessage;
    if(`${msg}`.startsWith('Organization HRN could not be determined')) {
      return undefined;
    }
    if(`${msg}`.startsWith('Person record is missing required organization field')) {
      return undefined;
    }
    return msg;
  }
}

async function _main() {
  // Load configuration
  const { HURON_PERSON_CONFIG_PATH } = process.env;
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = configManager.reset()
    .fromEnvironment()
    .fromFileSystem(localConfigPath)
    .getConfig('person');

  // Get a standard DataMapper instance to extract params and mappings for the CustomOrgDataMapper
  const standardMapper: DataMapper = await getDataMapper(config, { 
    orgMap: true, stateMap: true, countryMap: true 
  });

  // Create an instance of the CustomOrgDataMapper with the same params as the standard mapper.
  const customMapper = await CustomOrgDataMapper.getInstance(config, {
    params: standardMapper.params,
    organization: { 
      hrn: process.env.ORGANIZATION_HRN,
      sourceIdentifier: process.env.ORGANIZATION_SID 
    },
    employer: { 
      hrn: process.env.EMPLOYER_HRN,
      sourceIdentifier: process.env.EMPLOYER_SID
    }
  });

  if (!customMapper) {
    throw new Error('Failed to create CustomOrgDataMapper instance');
  }

  // Pass the custom DataMapper to the main sync function in SyncPersonBatch, which will use it for 
  // all data mapping during the standard sync process
  await main(customMapper);
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('SYNC_PERSON_BATCH_CUSTOM_ORG');

  [
    'SYNC_PREVIEW', 
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'EMPLOYER_HRN',
    'EMPLOYER_SID',
    'ORGANIZATION_HRN',
    'ORGANIZATION_SID',
    'OUTPUT_FILE_PATH'
  ].forEach(testEnvironment.getVar);

  [
    'SYNC_BUIDS_FILE_PATH', 
    'SYNC_BUIDS',
  ].forEach(testEnvironment.getVarOrEmptyString);

  const logFilePath = process.env.OUTPUT_FILE_PATH || 'data/sync_person_batch_custom_org_output.json';
  setFileLogging(logFilePath);

  _main();
}
