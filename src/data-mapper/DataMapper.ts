import { DataMapper as CoreDataMapper, CrudOperation, Field, Input } from 'integration-core';
import { BuCdmCurrentTermsDataSource, Term } from '../data-source/CurrentTermsDataSource';
import { anyEmpty, isEmpty, nullsToUndefined } from '../Utils';
import { AddressMapper, AddressType } from './DataMapperAddress';
import { EmailMapper } from './DataMapperEmail';
import { NameMapper } from './DataMapperName';
import { loadOrgMap, OrgAssignments, OrgMapper } from './DataMapperOrg';
import { TitleMapper } from './DataMapperTitle';
import { UserIdMapper } from './DataMapperUserId';
import { StateLookup, StateRow } from './DataMapperState';
import { CountryLookup, CountryRow } from './DataMapperCountry';
import { Config } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';

/**
 * Parameters for DataMapper constructor
 */
export interface DataMapperParams {
  currentTerms: Term[];
  stateMap: Map<string, StateRow>;
  countryMap: Map<string, CountryRow>;
  orgHrn?: (sourceOrgId: string) => string | undefined;
  orgMap?: Map<string, string>;
  addressTypes?: Set<AddressType>;
}

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

  public get stateMap(): Map<string, StateRow> | undefined {
    return this._params.stateMap;
  }

  public get countryMap(): Map<string, CountryRow> | undefined {
    return this._params.countryMap;
  }

  public get orgHrn(): (sourceOrgId: string) => string | undefined {
    return this._orgHrn;
  }

  public get orgMap(): Map<string, string> | undefined {
    return this._params.orgMap;
  }

  /**
   * Convert raw person data to Input format (implementing core interface)
   * @param rawData Array of person data objects from Boston University CDM API
   */
  map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  }

  /**
   * Convert raw person data to Input format
   * @param rawData Array of person data objects from Boston University CDM API
   * @param hrn Optional person HRN to use applying to the returned data to indicate a put/patch operation
   */
  getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    const { rawData, personHrn, crudOperation } = params;

    this.clearMessages();

    const fieldDefinitions = [
      { name: 'id', type: 'string' as const, required: true, isPrimaryKey: true },
      { name: 'sourceIdentifier', type: 'string' as const, required: false },
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

    if(personHrn) {
      fieldDefinitions.push({ name: 'hrn', type: 'string' as const, required: true });
    }

    const fieldSets = rawData.map(person => {

      person = nullsToUndefined(person);

      const { personid } = person;
      const { firstName, middleName, lastName } = NameMapper({ person, convertNullstoUndefined: false }).getName() ?? {};
      const userId = UserIdMapper(person, false).getUserId(crudOperation);
      const title = TitleMapper(person, false).getTitle();
      const email = EmailMapper(person, false).getEmail();
      const addressMapper = AddressMapper({
        person,
        stateMap: this.stateMap ?? new Map<string, StateRow>(), 
        countryMap: this.countryMap ?? new Map<string, CountryRow>(),
        addressTypes: this._params.addressTypes
      });
      const addressLine1 = addressMapper.getAddressLine1();
      const city = addressMapper.getCity();
      const stateProvince = addressMapper.getStateProvince();
      const postalCode = addressMapper.getPostalCode();
      const country = addressMapper.getCountry();
      const orgAssignments: OrgAssignments = OrgMapper({ 
        person, 
        currentTerms: this._params.currentTerms, 
        convertNullstoUndefined: false 
      }).getOrgs();

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
        { userId },
        { sourceIdentifier: personid },
        { firstName },
        { middleName },
        { lastName },
        { contactInformation: { email, addressLine1, city, stateProvince, postalCode, country } },
        { roles: [ { hrn: 'hrn:hrs:lists:roles/irb-general-user' } ] },
        { employer: { hrn: employerHrn } },
        // Can be included for create, but only impacts put/patch operations to indicate that roles should be appended rather than replaced
        { __arrayFieldOperations: { append: [ 'roles' ] } }
      ] as Field[];
      
      // Add organization field only if it exists (not for affiliates where it's EXEMPTED)
      if(orgAssignments.organization) {
        const orgHrn = this._orgHrn(orgAssignments.organization);
        if(isEmpty(orgHrn) && !this._criticalValidationFailureMessage) {
          this._criticalValidationFailureMessage = `Organization HRN could not be determined for person record with source org id ${orgAssignments.organization}: ${JSON.stringify(person)}`;
        }
        fieldValues.push({ organization: { hrn: orgHrn } });
      }

      if(personHrn) {
        fieldValues.push({ hrn: personHrn });
      }

      if(title) {
        fieldValues.push({ title });
      }

      // Add secondaryUnit if present
      if(orgAssignments.secondaryUnit) {
        const secondaryHrn = this._orgHrn(orgAssignments.secondaryUnit);
        if(isEmpty(secondaryHrn) && !this._infoValidationFailureMessage) {
          this._infoValidationFailureMessage = `SecondaryUnit HRN could not be determined for person record with source org id ${orgAssignments.secondaryUnit}: ${JSON.stringify(person)}`;
        }
        fieldValues.push({ secondaryUnit: { hrn: secondaryHrn } });
      }
      
      // Add additionalUnit if present
      if(orgAssignments.additionalUnit) {
        const additionalHrn = this._orgHrn(orgAssignments.additionalUnit);
        if(isEmpty(additionalHrn) && !this._infoValidationFailureMessage) {
          this._infoValidationFailureMessage = `AdditionalUnit HRN could not be determined for person record with source org id ${orgAssignments.additionalUnit}: ${JSON.stringify(person)}`;
        }
        fieldValues.push({ additionalUnit: { hrn: additionalHrn } });
      }

      return { fieldValues };
    });

    return {
      fieldDefinitions,
      fieldSets
    };
  }
}


/**
 * Fetch all static mapping needed for the DataMapper, including current terms, state 
 * and country lookups, and org HRN mapping, and return a DataMapper instance with this 
 * data to be shared across syncs.
 * @param config 
 * @returns 
 */
export const getDataMapper = async (config: Config): Promise<DataMapper> => {
  const orgMap: Map<string, string> = await loadOrgMap(config);
  const orgHrn = (sourceOrgId: string) => orgMap.get(sourceOrgId);
  const termsDataSource = new BuCdmCurrentTermsDataSource({ config });
  const currentTerms = await termsDataSource.fetchRaw();
  const stateMap = await StateLookup.loadStates(config);
  const countryMap = await CountryLookup.loadCountries(config);
  console.log(`Fetched ${currentTerms.length} current term(s)`);
  return new DataMapper({ currentTerms, stateMap, countryMap, orgHrn, orgMap });
}



if(require.main === module) {
  (async () => {
    const config: Config = ConfigManager.getInstance().reset().fromEnvironment().fromFileSystem().getConfig('person');
    const dataMapper = await getDataMapper(config);
    const { currentTerms=[], stateMap, countryMap, orgMap=(new Map<string, string>()) } = dataMapper;
    console.log(`DataMapper: ${JSON.stringify({
      stateMapSize: stateMap?.size,
      countryMapSize: countryMap?.size,
      orgMapSize: orgMap.size,
      currentTerms
    }, null, 2)}`);
  })()
};