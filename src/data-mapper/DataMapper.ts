import { DataMapper as CoreDataMapper, CrudOperation, Field, FieldSet, Input, InputParser } from 'integration-core';
import { BuCdmCurrentTermsDataSource, Term } from '../data-source/CurrentTermsDataSource';
import { anyEmpty, getLocalConfig, isEmpty, removeEmptyValues } from '../Utils';
import { AddressMapper, AddressType } from './DataMapperAddress';
import { EmailMapper } from './DataMapperEmail';
import { NameMapper } from './DataMapperName';
import { loadOrgMap, OrgAssignments, OrgMapper, OrgMappings } from './DataMapperOrg';
import { TitleMapper } from './DataMapperTitle';
import { UserIdMapper } from './DataMapperUserId';
import { StateLookup, StateMappings, StateRow } from './DataMapperState';
import { CountryLookup, CountryMappings, CountryRow } from './DataMapperCountry';
import { Config } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';
import { BuCdmPersonDataSource } from '../data-source/PersonDataSource';
import { TargetApiErrorEventProcessor } from '../data-target/ApiClientForJWT';

/**
 * Parameters for DataMapper constructor
 */
export interface DataMapperParams {
  currentTerms: Term[];
  orgMappings?: OrgMappings;
  stateMappings?: StateMappings;
  countryMappings?: CountryMappings;
  orgHrn?: (sourceOrgId: string) => string | undefined;
  errorEventProcessor?: TargetApiErrorEventProcessor
  addressTypes?: Set<AddressType>;
  idpName: string;
  idpDomain?: string;
}

export const _fieldDefinitions = [
  { name: 'id', type: 'string' as const, required: true },
  { name: 'userId', type: 'string' as const, required: false },
  { name: 'sourceIdentifier', type: 'string' as const, required: true, isPrimaryKey: true },
  { name: 'employeeId', type: 'string' as const, required: false },
  { name: 'firstName', type: 'string' as const, required: true },
  { name: 'middleName', type: 'string' as const, required: false },
  { name: 'lastName', type: 'string' as const, required: true },
  { name: 'title', type: 'string' as const, required: false },
  { name: 'employer', type: 'object' as const, required: true },
  { name: 'organization', type: 'object' as const, required: true },
  { name: 'secondaryUnit', type: 'object' as const, required: false },
  { name: 'additionalUnit', type: 'object' as const, required: false },
  { name: 'contactInformation', type: 'object' as const, required: true },
  { name: 'roles', type: 'array' as const, required: false },
  { name: '__arrayFieldOperations', type: 'object' as const, required: true } // Special field for conveying array operation instructions (e.g. for roles)
];

/**
 * DataMapper class for:
 *   1) Sending raw person data fetched from the Boston University CDM api 
 *      through a mapping process that converts field names and formats into a form compatible 
 *      with the Huron target api endpoint, and structured integration-core Input format.
 *   2) Cherry-picking out only "fields of interest" that the target endpoint is interested in.
 */
export class DataMapper implements CoreDataMapper {
  private _criticalValidationFailureMessage:string | undefined;
  private _infoValidationFailureMessage:string | undefined;
  private _params: DataMapperParams;
  private _orgHrn: (sourceOrgId: string) => string | undefined
  private _mappingErrorCount: number = 0;

  constructor(params: DataMapperParams) { 
    this._params = params;
    
    if(params.orgHrn) {
      this._orgHrn = params.orgHrn;
    } else {
      // Default organization HRN expression to a lookup function if not provided
      this._orgHrn = (sourceOrgId: string) => `lookup:sourceIdentifier:${sourceOrgId}`;
    }
  }

  public clearMessages = () => {
    this._criticalValidationFailureMessage = undefined;
    this._infoValidationFailureMessage = undefined;
  }

  public get criticalValidationErrorMessage(): string | undefined {
    return this._criticalValidationFailureMessage;
  }

  public get infoValidationErrorMessage(): string | undefined {
    return this._infoValidationFailureMessage;
  }

  public get currentTerms(): Term[] {
    return this._params.currentTerms;
  }

  public get stateMappings(): StateMappings | undefined {
    return this._params.stateMappings;
  }

  public get countryMappings(): CountryMappings | undefined {
    return this._params.countryMappings;
  }

  public get orgHrn(): (sourceOrgId: string) => string | undefined {
    return this._orgHrn;
  }

  public get orgMappings(): OrgMappings | undefined {
    return this._params.orgMappings;
  }

  /**
   * Get the count of records that failed during the mapping phase.
   * These are filtered out of the returned Input and should be counted as failures.
   */
  public getMappingErrorCount(): number {
    return this._mappingErrorCount;
  }

  /**
   * Reset mapping error count (useful between multiple map() calls)
   */
  public clearMappingErrorCount(): void {
    this._mappingErrorCount = 0;
  }

  /**
   * Convert raw person data from source system to Input format (implementing core interface)
   * @param rawData Array of person data objects from Boston University CDM API
   */
  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  }


  /**
   * Convert raw person data from source system to Input format
   * @param rawData Array of person data objects from Boston University CDM API
   * @param hrn Optional person HRN to use applying to the returned data to indicate a put/patch operation
   */
  public getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    const { rawData, personHrn, crudOperation } = params;

    this.clearMessages();
    this._mappingErrorCount = 0; // Reset error count for this mapping operation

    const fieldDefinitions = [..._fieldDefinitions];

    if(personHrn) {
      fieldDefinitions.push({ name: 'hrn', type: 'string' as const, required: true });
    }

    const fieldSets = rawData.map(person => {
      try {

        person = removeEmptyValues(person);

        const { personid } = person;
        const { idpName, idpDomain, addressTypes, currentTerms } = this._params;
        
        const { firstName, middleName, lastName } = NameMapper({ person, removeNullValues: false }).getName() ?? {};
        const userId = UserIdMapper({ 
          person, idpName, idpDomain, removeNullValues: false 
        }).getUserId(crudOperation);
        const title = TitleMapper(person, false).getTitle();
        const email = EmailMapper(person, false).getEmail();
        const addressMapper = AddressMapper({
          person,
          stateMappings: this.stateMappings ?? { forwardMap: new Map<string, StateRow>(), reverseMap: new Map<string, string>() },
          countryMappings: this.countryMappings ?? { forwardMap: new Map<string, CountryRow>(), reverseMap: new Map<string, string>() },
          addressTypes
        });
        const addressLine1 = addressMapper.getAddressLine1();
        const city = addressMapper.getCity();
        const stateProvince = addressMapper.getStateProvince();
        const postalCode = addressMapper.getPostalCode();
        const country = addressMapper.getCountry();

        // OrgMapper determines organization assignments AND skip reason
        const orgAssignments: OrgAssignments = OrgMapper({ 
          person, 
          currentTerms, 
          removeNullValues: false,
          orgHrn: this._orgHrn
        }).getOrgs();

        // Extract skipReason from orgAssignments (set by OrgMapper if applicable)
        const skipReason = orgAssignments.skipReason;

        // Basic data check
        if(isEmpty(personid)) {
          this._criticalValidationFailureMessage = `Person record is missing required personid field: ${JSON.stringify(person)}`;
        }
        if(anyEmpty(firstName, lastName) && !this._criticalValidationFailureMessage) {
          this._criticalValidationFailureMessage = `Person record is missing required name fields: ${JSON.stringify(person)}`;
        }
        // For affiliates, organization is EXEMPTED per CSV spec (employer="AFFILIATE", organization=undefined)
        // For employees and students, organization is required
        if(!orgAssignments.organization && orgAssignments.employer !== 'AFFILIATE' && !this._criticalValidationFailureMessage) {
          this._criticalValidationFailureMessage = `Person record is missing required organization field: ${JSON.stringify(person)}`;
        }
        const employerHrn = this._orgHrn(orgAssignments.employer ?? '');
        const fieldValues = [
          { id: personid },
          { employeeId: personid },
          { sourceIdentifier: personid },
          { firstName },
          { middleName },
          { lastName },
          { roles: [ { hrn: 'hrn:hrs:lists:roles/irb-general-user' } ] },
          // Can be included for create, but only impacts put/patch operations to indicate that roles should be appended rather than replaced
          { __arrayFieldOperations: { append: [ 'roles' ] } },
          // Special field to carry skip reason through the pipeline (not sent to API - will be "skipped")
          ...(skipReason ? [{ __skipReason: skipReason }] : [])
        ] as Field[];

        // Add userId only if it has a value (undefined for UPDATE operations)
        if (userId !== undefined) {
          fieldValues.push({ userId });
        }

        // Add employer only if it is not an empty object.
        if(!isEmpty(employerHrn)) {
          fieldValues.push({ employer: { hrn: employerHrn } });
        }

        // Add contactInformation only if at least one sub-field has a value (otherwise the mapper will return an empty object which we want to avoid)
        if (email || addressLine1 || city || stateProvince || postalCode || country) {
          fieldValues.push({ contactInformation: { 
            email, addressLine1, city, stateProvince, postalCode, country 
          }});
        }

        if(personHrn) {
          fieldValues.push({ hrn: personHrn });
        }

        if(title) {
          fieldValues.push({ title });
        }

        // Add organization field only if it exists (not for affiliates where it's EXEMPTED)
        if(orgAssignments.organization) {
          const orgHrn = this._orgHrn(orgAssignments.organization);
          if(isEmpty(orgHrn)) {
            if(!this._criticalValidationFailureMessage) {
              this._criticalValidationFailureMessage = `Organization HRN could not be determined for person record with source org id ${orgAssignments.organization}: ${JSON.stringify(person)}`;
            }
          }
          else {
            fieldValues.push({ organization: { hrn: orgHrn } });
          }
        }

        // Add secondaryUnit if present
        if(orgAssignments.secondaryUnit) {
          const secondaryHrn = this._orgHrn(orgAssignments.secondaryUnit);
          if(isEmpty(secondaryHrn) && !this._infoValidationFailureMessage) {
            if(!this._infoValidationFailureMessage) {
              this._infoValidationFailureMessage = `SecondaryUnit HRN could not be determined for person record with source org id ${orgAssignments.secondaryUnit}: ${JSON.stringify(person)}`;
            }
          }
          else {
            fieldValues.push({ secondaryUnit: { hrn: secondaryHrn } });
          }
        }

        // Add additionalUnit if present
        if(orgAssignments.additionalUnit) {
          const additionalHrn = this._orgHrn(orgAssignments.additionalUnit);
          if(isEmpty(additionalHrn) && !this._infoValidationFailureMessage) {
            if(!this._infoValidationFailureMessage) {
              this._infoValidationFailureMessage = `AdditionalUnit HRN could not be determined for person record with source org id ${orgAssignments.additionalUnit}: ${JSON.stringify(person)}`;
            }
          }
          else {
            fieldValues.push({ additionalUnit: { hrn: additionalHrn } });
          }
        }
        return { fieldValues };
      } catch (error) {
        // Handle mapping error: log to errorEventProcessor and mark for filtering
        const { errorEventProcessor } = this._params;
        let personid = person && person.personid ? person.personid : undefined;
        let sourceIdentifier = person && person.sourceIdentifier ? person.sourceIdentifier : undefined;
        let errorDetails = {
          message: `Data mapping error: ${error instanceof Error ? error.message : String(error)}`,
          object: {
            personid,
            sourceIdentifier,
            raw: person
          }
        };
        if (errorEventProcessor && typeof errorEventProcessor.process === 'function') {
          errorEventProcessor.process(error, errorDetails);
        }
        // Increment error count for this filtered-out record
        this._mappingErrorCount++;
        // Return a marker FieldSet that will be filtered out before returning
        return {
          fieldValues: [
            { __mappingError: true },
            { errorMessage: error instanceof Error ? error.message : String(error) },
            ...(personid ? [{ personid }] : []),
            ...(sourceIdentifier ? [{ sourceIdentifier }] : [])
          ]
        } as FieldSet;
      }
    });

    // Filter out any FieldSets marked with __mappingError before returning
    // These are not sent to target, not included in delta computation
    const cleanedFieldSets = fieldSets.filter(fs => 
      !fs.fieldValues.some(fv => '__mappingError' in fv)
    );

    return {
      fieldDefinitions,
      fieldSets: cleanedFieldSets
    };
  }
}


/**
 * Convert raw person data from target system to Input format (implementing core interface)
 * This does not reverse-map back to source format, but rather converts Huron API response
 * data into the Input/FieldSet structure so it can be hashed and compared with forward-mapped
 * source data.
 * @param rawData Array of person data objects from Huron API endpoint.
 */
export class ReverseDataMapper implements CoreDataMapper {
  public map(rawData: any[], crudOperation?: CrudOperation): Input {

    const fieldDefinitions = [..._fieldDefinitions];
    
    const fieldSets = rawData.map(person => {
      // Convert Huron person object to FieldSet format, omitting null/undefined values
      const fieldValues: Field[] = [];
      
      if (person && typeof person === 'object') {
        Object.keys(person).forEach(key => {
          if ( ! isEmpty(person[key]) ) {
            if (fieldDefinitions.some(fd => fd.name === key) ) {
              fieldValues.push({ [key]: removeEmptyValues(person[key]) });           
            }            
          }
        });
      }
      
      return { fieldValues };
    });

    return {
      fieldDefinitions,
      fieldSets
    };
  }
}

export type StaticMapUsage = { orgMap?: boolean, stateMap?: boolean, countryMap?: boolean };

/**
 * Fetch all static mapping needed for the DataMapper, including current terms, state 
 * and country lookups, and org HRN mapping, and return a DataMapper instance with this 
 * data to be shared across syncs.
 * @param config 
 * @returns 
 */
export const getDataMapper = async (config: Config, staticMapUsage?: StaticMapUsage): Promise<DataMapper> => {
  const maps = await getDataMapperMaps(config, staticMapUsage);
  const { stateMappings, countryMappings, orgMappings } = maps;
  const { orgMap=false } = staticMapUsage ?? {}
  let orgHrn = undefined;
  if(orgMap) {
    orgHrn = (sourceOrgId: string) => orgMappings?.forwardMap.get(sourceOrgId);
  }
  const termsDataSource = new BuCdmCurrentTermsDataSource({ config });
  const currentTerms = await termsDataSource.fetchRaw();
  console.log(`Fetched ${currentTerms.length} current term(s)`);
  return new DataMapper({ 
    currentTerms, 
    stateMappings, 
    countryMappings, 
    orgHrn, 
    orgMappings, 
    idpName: config.dataSource.idpName,
    idpDomain: config.dataSource.idpDomain
  });
}

/**
 * Fetch all static mapping needed for the DataMapper as indicated by staticMapUsage.
 * If staticMapUsage is not provided, or one of its properties is false, or missing,
 * the Huron API dynamic lookup syntax is assumed for the corresponding mappable field 
 * (e.g. organization HRN will be "lookup:sourceIdentifier:{sourceOrgId}"), and the mapping 
 * data will not be fetched.
 * @param config 
 * @param staticMapUsage 
 * @returns 
 */
export const getDataMapperMaps = async (config: Config, staticMapUsage?: StaticMapUsage): Promise<{ 
  stateMappings?: StateMappings, 
  countryMappings?: CountryMappings, 
  orgMappings?: OrgMappings
}> => {
  const { orgMap=false, stateMap=false, countryMap=false } = staticMapUsage ?? {};
  return {
    stateMappings: stateMap ? await StateLookup.loadStates(config) : undefined,
    countryMappings: countryMap ? await CountryLookup.loadCountries(config) : undefined,
    orgMappings: orgMap ? await loadOrgMap(config) : undefined
  }
} 


export const getPersonFieldSet = async (): Promise<FieldSet> => {
    const { HURON_PERSON_CONFIG_PATH, SYNC_BUID:buid, PRINT_MAPPINGS='false' } = process.env;
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config: Config = ConfigManager.getInstance().reset().fromEnvironment().fromFileSystem(localConfigPath).getConfig('person');
    const dataMapper = await getDataMapper(config, { orgMap: true, stateMap: true, countryMap: true });

    // Optionally print the mappings
    const printMappings = PRINT_MAPPINGS.toLowerCase() === 'true';
    if(printMappings) {
      const { currentTerms=[], stateMappings, countryMappings, orgMappings } = dataMapper;
      console.log(`DataMapper: ${JSON.stringify({
        stateMapSize: stateMappings?.forwardMap?.size,
        countryMapSize: countryMappings?.forwardMap?.size,
        orgMapSize: orgMappings?.forwardMap?.size,
        currentTerms
      }, null, 2)}`);      
    }

    // Fetch raw person data for the specified BUID
    const dataSource = new BuCdmPersonDataSource({ config, buid });
    const rawData = await dataSource.fetchRaw();

    // Map raw data to Input format using the DataMapper
    const unparsedInput:Input = dataMapper.map(rawData);
    const parsedInput = new InputParser({ _input: unparsedInput }).parse();

    // Return the first FieldSet (there should only be one since we're fetching by BUID), or an empty FieldSet if none exist
    return parsedInput.fieldSets?.[0] as FieldSet;
}

if(require.main === module) {
  (async () => {
    const fieldSet = await getPersonFieldSet();
    const fldValues = fieldSet?.fieldValues;
    console.log(`Mapped Input: ${JSON.stringify(fldValues, null, 2)}`);
  })()
};