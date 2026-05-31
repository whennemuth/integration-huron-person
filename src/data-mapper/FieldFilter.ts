import { Field, FieldSet, Input, TestEnvironment } from 'integration-core';
import { ConfigManager } from "../config/ConfigManager";
import { _fieldDefinitions, getDataMapperMaps, ReverseDataMapper } from "./DataMapper";
import { CountryMappings } from "./DataMapperCountry";
import { StateMappings } from "./DataMapperState";
import { ReadPerson } from "../data-target/crud/ReadPerson";
import { deepClone, getLocalConfig, removeEmptyValues } from '../Utils';
import { OrgMappings } from "./DataMapperOrg";


const excludeFields = [ 'userId', 'roles', '__arrayFieldOperations' ];

/**
 * Get the list of fields to keep (not exclude) from _fieldDefinitions.
 * This is a function to avoid module initialization order issues.
 */
const getFieldsToKeep = (): string[] => {
  return (_fieldDefinitions ?? []).flatMap(fd => {
    if(excludeFields.includes(fd.name)) {
      return [];
    }
    return fd.name;
  });
};


export interface FieldFilterParams {
  fieldSet: FieldSet
  stateMappings: StateMappings;
  countryMappings: CountryMappings;
  orgMappings?: OrgMappings;
}

/**
 * A Mapped FieldSet may contain complex objects for fields like employer, stateProvince, 
 * and country, which can be reduced down to the related BU unique identifier so as to have 
 * consistency with hashing results. Any set of person data, whether it comes from the 
 * source system or the target system is treated by this FieldFilter so that any formatting or
 * descriptive language differences between can be removed from causing hashed result
 * variation between two sets of data that are essentially the same and have had no updates
 * applied that should set them apart with disparate hashing results. For example, a set 
 * of person data returned from a target system lookup will have an hrn, while the
 * corresponding lookup against the source system will have a personid (buid) these two
 * types of identifiers refer to the same person, but would lead to two different hashing
 * results. This class corrects for that situation.
 */
export class FieldFilter {
  private filteredFieldValues: Field[];
  
  constructor(private params: FieldFilterParams) {}

  public filter = (): FieldSet => {
    const { 
      params: { fieldSet, fieldSet: { fieldValues = [] } = {} }, 
      normalizeOrg, normalizeState, normalizeCountry
    } = this;

    const fieldsToKeep = getFieldsToKeep();

    /** First filter off fields that are not in the fieldsToKeep list, which should remove non-hashable fields like userId and roles */
    /** Deep clone to avoid mutating the original fieldValues array and its objects */
    this.filteredFieldValues = deepClone(fieldValues).filter(fv => {
      const fieldName = Object.keys(fv)[0];
      return fieldsToKeep.includes(fieldName);
    });

    normalizeOrg('employer');

    normalizeOrg('organization');

    normalizeOrg('secondaryUnit');

    normalizeOrg('additionalUnit');

    normalizeState();

    normalizeCountry();

    this.filteredFieldValues = (removeEmptyValues(this.filteredFieldValues) as Field[]) || [];

    // Ensure fieldValues is always an array (even if empty) for hash function compatibility
    // removeEmptyValues returns undefined for empty arrays, but hash needs an array
    const retval = { ...fieldSet, fieldValues: this.filteredFieldValues || [] };

    return retval;
  }

  /**
   * Checks if a string is a lookup expression (e.g., "lookup:sourceIdentifier:12345" or "lookup:name:MA")
   */
  private isLookupExpression = (value: string): boolean => {
    return typeof value === 'string' && value.startsWith('lookup:');
  }

  /**
   * Extracts the value from a lookup expression.
   * For "lookup:sourceIdentifier:12345" returns "12345"
   * For "lookup:name:MA" returns "MA"
   * For "lookup:sourceIdentifier:org:with:colons" returns "org:with:colons"
   */
  private extractFromLookupExpression = (lookupExpr: string): string | undefined => {
    if (!this.isLookupExpression(lookupExpr)) {
      return undefined;
    }
    const parts = lookupExpr.split(':');
    if (parts.length >= 3) {
      // Return everything after the second colon (parts[2] onwards, joined by colons)
      return parts.slice(2).join(':');
    }
    return undefined;
  }

  /** 
   * Reduce and "normalize" an organization field to just the BUID. The BUID will correspond 
   * to the id field, but if this is not present, attempt a lookup via the org mapping if 
   * supplied. If the HRN is a lookup expression (e.g., "lookup:sourceIdentifier:12345"),
   * extract the ID directly from the expression.
   */
  private normalizeOrg = (orgType: string): void => {
    const { params: { orgMappings: { reverseMap } = {} }, filteredFieldValues } = this;

    for(const fv of filteredFieldValues) {
      if(orgType in fv) {
        const orgValue = (fv as any)[orgType];
        if(orgValue && typeof orgValue === 'object') {
          let buid = orgValue.id;
          const hrn = orgValue.hrn;
          if( ! buid && hrn) {
            // Check if HRN is a lookup expression first
            if (this.isLookupExpression(hrn)) {
              buid = this.extractFromLookupExpression(hrn);
            } else if (reverseMap) {
              // Try to resolve via org mapping
              buid = reverseMap.get(hrn);
            }
          }
          (fv as any)[orgType] = buid || undefined;
        }
      }
    }
  }

  private normalizeState = (): void => this.normalizeAddressField('stateProvince', this.params.stateMappings);

  private normalizeCountry = (): void => this.normalizeAddressField('country', this.params.countryMappings);

  private normalizeAddressField = (fldname: string, mappings: StateMappings | CountryMappings | undefined): void => {
    const { filteredFieldValues } = this;
    let ciFld: Field | undefined = filteredFieldValues.find(fv => 'contactInformation' in fv);

    let contactInfo = ciFld?.contactInformation;
    if( ! contactInfo) {
      console.error('No contactInformation field found in field values, cannot normalize state/country fields');
      return;
    }

    for(const entry of Object.entries(contactInfo)) {
      const fn = entry[0];
      const fv = entry[1];
      if(fldname === fn) {
        if(fv && typeof fv === 'object') {
          const hrn = fv.hrn;
          let buid: string | undefined = undefined;
          
          // Check if HRN is a lookup expression first
          if (this.isLookupExpression(hrn)) {
            buid = this.extractFromLookupExpression(hrn);
          } else {
            // Try to resolve via state/country mapping
            const hrnCode = hrn.split('/').pop();
            buid = mappings?.reverseMap?.get(hrnCode);
          }
          
          (contactInfo as any)[fn] = buid ? buid : undefined;
        }
      }
    }
  }
}


/**
 * Cheap test: Query for a person from the Huron Person API and run the data through the ReverseDataMapper
 */
if(require.main === module) {
  const testEnvironment = TestEnvironment('FIELD_FILTER');
  const { HURON_PERSON_HRN:hrn } = process.env;

  if( !hrn) {
    console.error('Please provide HURON_PERSON_HRN environment variable to run the reverse hash comparison');
    process.exit(1);
  }
  (async () => {
    const { HURON_PERSON_CONFIG_PATH } = process.env;
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config = ConfigManager.getInstance().fromEnvironment().fromFileSystem(localConfigPath).getConfig('none');

    const huronPerson = await new ReadPerson(config).readPersonByHRN(hrn!);

    const targetDataMapper = new ReverseDataMapper();

    const unparsedInput:Input = targetDataMapper.map([huronPerson]);

    const filterParms = await getDataMapperMaps(config, { orgMap: false, stateMap: true, countryMap: true });

    const fieldFilterParms = {
      ...filterParms,
      fieldSet: unparsedInput.fieldSets[0]
    } as FieldFilterParams;

    const filteredInput = {
      fieldDefinitions: unparsedInput.fieldDefinitions,
      fieldSets: [ new FieldFilter(fieldFilterParms).filter() ]
    };

    console.log(`Target data to be hashed: ${JSON.stringify(filteredInput.fieldSets[0], null, 2)}`);
  })();
}