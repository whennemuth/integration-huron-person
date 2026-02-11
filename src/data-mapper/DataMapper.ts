import { Input, DataMapper as CoreDataMapper, Field } from 'integration-core';
import { NameMapper } from './DataMapperName';
import { EmailMapper } from './DataMapperEmail';
import { AddressMapper } from './DataMapperAddress';
import { OrgMapper } from './DataMapperOrg';
import { anyEmpty, isEmpty, nullsToUndefined } from '../Utils';
import { TitleMapper } from './DataMapperTitle';

/**
 * DataMapper class for:
 *   1) Sending raw person data fetched from the Boston University CDM api 
 *      through a mapping process that converts field names and formats into a form compatible 
 *      with the Huron target api endpoint, and structured integration-core Input format.
 *   2) Cherry-picking out only "fields of interest" that the target endpoint is interested in.
 */
export class DataMapper implements CoreDataMapper {
  private _criticalValidationFailureMessage:string;
  private _infoValidationFailureMessage:string;
  private _orgHrn: (sourceOrgId: string) => string | undefined;

  constructor(private orgHrn?: (sourceOrgId: string) => string | undefined) { 
    if(orgHrn) {
      this._orgHrn = orgHrn;
    } else {
      // Default organization HRN expression to a lookup function if not provided
      this._orgHrn = (sourceOrgId: string) => `lookup:sourceIdentifier:${sourceOrgId}`;
    }
  }

  public get criticalValidationErrorMessage(): string {
    return this._criticalValidationFailureMessage;
  }

  public get infoValidationErrorMessage(): string {
    return this._infoValidationFailureMessage;
  }

  /**
   * Convert raw person data to Input format (implementing core interface)
   * @param rawData Array of person data objects from Boston University CDM API
   */
  map(rawData: any[]): Input {
    return this.getMappedData(rawData);
  }

  /**
   * Convert raw person data to Input format
   * @param rawData Array of person data objects from Boston University CDM API
   */
  getMappedData(rawData: any[]): Input {

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
      { name: 'contactInformation', type: 'object' as const, required: true },
      { name: '__arrayFieldOperations', type: 'object' as const, required: true } // Special field for conveying array operation instructions (e.g. for roles)
    ];

    const fieldSets = rawData.map(person => {

      person = nullsToUndefined(person);

      const { personid } = person;
      const { firstName, middleName, lastName } = NameMapper(person, false).getName() ?? {};
      const title = TitleMapper(person, false).getTitle();
      const email = EmailMapper(person, false).getEmail();
      const addressLine1 = AddressMapper(person, false).getAddressLine1();
      const orgIds: Set<string> = OrgMapper(person, false).getOrgs();

      // Basic data check
      if(isEmpty(personid)) {
        this._criticalValidationFailureMessage = `Person record is missing required personId field: ${JSON.stringify(person)}`;
      }
      if(anyEmpty(firstName, lastName) && !this._criticalValidationFailureMessage) {
        this._criticalValidationFailureMessage = `Person record is missing required name fields: ${JSON.stringify(person)}`;
      }
      if(orgIds.size === 0 && !this._criticalValidationFailureMessage) {
        this._criticalValidationFailureMessage = `Person record is missing required organization field: ${JSON.stringify(person)}`;
      }
      
      const orgHrn = this._orgHrn(Array.from(orgIds)[0]);
      if(isEmpty(orgHrn) && !this._criticalValidationFailureMessage) {
        this._criticalValidationFailureMessage = `Organization HRN could not be determined for person record with source org id ${Array.from(orgIds)[0]}: ${JSON.stringify(person)}`;
      }
      
      const fieldValues = [
        { id: personid },
        { employeeId: personid },
        { userId: personid },
        { sourceIdentifier: personid },
        { firstName },
        { middleName },
        { lastName },
        { contactInformation: { email, addressLine1 } },
        { roles: [ { hrn: 'hrn:hrs:lists:roles/irb-general-user' } ] },
        { employer: { hrn: orgHrn } },
        { organization: { hrn: orgHrn } },
        // Can be included for create, but only impacts put/patch operations to indicate that roles should be appended rather than replaced
        { __arrayFieldOperations: { append: [ 'roles' ] } }
      ] as Field[];

      if(title) {
        fieldValues.push({ title });
      }

      if( orgIds.size > 1 ) {
        // Must be a dual-appointee employee, or student with multiple colleges
        const secondOrgId = Array.from(orgIds)[1];
        const secondaryHrn = this._orgHrn(secondOrgId);
        if(isEmpty(secondaryHrn) && !this._infoValidationFailureMessage) {
          this._infoValidationFailureMessage = `SecondaryUnit HRN could not be determined for person record with source org id ${secondOrgId}: ${JSON.stringify(person)}`;
        }
        fieldValues.push({ secondaryUnit: { hrn: secondaryHrn } });
      }

      return { fieldValues };
    });

    return {
      fieldDefinitions,
      fieldSets
    };
  }

}