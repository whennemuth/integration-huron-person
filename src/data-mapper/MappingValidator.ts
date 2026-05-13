import { FieldSet } from "integration-core";
import { getPersonFieldSet } from "./DataMapper";

/**
 * Based on the Huron Profile API specification (huron-profile-api-2.0.0.json), 
 * this class validates that a FieldSet meets all requirements for creating a new
 * person in the Huron system.
 * 
 * Required fields for CREATE operation per API spec:
 * - id: A unique ID (pattern: ^[a-zA-Z0-9_-]+$, maxLength: 75)
 * - firstName: The first name (maxLength: 255, minLength: 1)
 * - lastName: The last name (maxLength: 255, minLength: 1)
 * - employer: HRNREF to employing organizational unit
 * - organization: HRNREF to primary organization
 * 
 * Note: ContactInformation fields are all optional per the API spec.
 */
export class MappingValidator {
  private violations: string[] = [];
  private skipReason?: string;

  constructor(private fieldSet: FieldSet, skipReason?: string) {
    // Check for skip reason in the FieldSet first (passed via special field from DataMapper)
    const skipReasonField = this.getFieldValue('__skipReason');
    this.skipReason = skipReason || skipReasonField;
    this.lookForViolations();
  }

  /**
   * Extract the value of a field from the fieldSet by field name
   */
  private getFieldValue = (fieldName: string): any => {
    const field = this.fieldSet.fieldValues.find((fv: any) => fieldName in fv);
    return field ? field[fieldName] : undefined;
  }

  /**
   * Check if a value is effectively empty (null, undefined, empty string, or whitespace-only)
   */
  private isEmpty = (value: any): boolean => {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    if (typeof value === 'object' && Object.keys(value).length === 0) {
      return true;
    }
    return false;
  }

  /**
   * Check for mandatory fields and invalid field formats per Huron API spec
   */
  private lookForViolations = () => {
    // Required field: id
    const id = this.getFieldValue('id');
    if (this.isEmpty(id)) {
      this.violations.push('Missing required field: id');
    } else {
      // Validate id format: must match ^[a-zA-Z0-9_-]+$ and maxLength 75
      const idStr = String(id);
      if (idStr.length > 75) {
        this.violations.push(`Field 'id' exceeds maximum length of 75 characters (actual: ${idStr.length})`);
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(idStr)) {
        this.violations.push(`Field 'id' contains invalid characters (must be letters, numbers, hyphens, or underscores only)`);
      }
    }

    // Required field: firstName
    const firstName = this.getFieldValue('firstName');
    if (this.isEmpty(firstName)) {
      this.violations.push('Missing required field: firstName');
    } else {
      const firstNameStr = String(firstName);
      if (firstNameStr.length > 255) {
        this.violations.push(`Field 'firstName' exceeds maximum length of 255 characters (actual: ${firstNameStr.length})`);
      }
      if (firstNameStr.trim().length === 0) {
        this.violations.push(`Field 'firstName' cannot be empty or whitespace-only`);
      }
    }

    // Required field: lastName
    const lastName = this.getFieldValue('lastName');
    if (this.isEmpty(lastName)) {
      this.violations.push('Missing required field: lastName');
    } else {
      const lastNameStr = String(lastName);
      if (lastNameStr.length > 255) {
        this.violations.push(`Field 'lastName' exceeds maximum length of 255 characters (actual: ${lastNameStr.length})`);
      }
      if (lastNameStr.trim().length === 0) {
        this.violations.push(`Field 'lastName' cannot be empty or whitespace-only`);
      }
    }

    // Required field: employer (must have hrn property)
    const employer = this.getFieldValue('employer');
    if (this.isEmpty(employer)) {
      this.violations.push('Missing required field: employer');
    } else if (typeof employer === 'object') {
      const employerHrn = employer.hrn;
      if (this.isEmpty(employerHrn)) {
        this.violations.push('Field employer is missing required property: hrn');
      }
    } else {
      this.violations.push('Field employer must be an object with hrn property');
    }

    // Required field: organization (must have hrn property)
    const organization = this.getFieldValue('organization');
    if (this.isEmpty(organization)) {
      this.violations.push('Missing required field: organization');
    } else if (typeof organization === 'object') {
      const orgHrn = organization.hrn;
      if (this.isEmpty(orgHrn)) {
        this.violations.push('Field organization is missing required property: hrn');
      }
    } else {
      this.violations.push('Field organization must be an object with hrn property');
    }

    // Optional field validations (if present, must meet constraints)
    const middleName = this.getFieldValue('middleName');
    if (!this.isEmpty(middleName) && String(middleName).length > 255) {
      this.violations.push(`Field 'middleName' exceeds maximum length of 255 characters (actual: ${String(middleName).length})`);
    }

    const title = this.getFieldValue('title');
    if (!this.isEmpty(title) && String(title).length > 255) {
      this.violations.push(`Field 'title' exceeds maximum length of 255 characters (actual: ${String(title).length})`);
    }

    const userId = this.getFieldValue('userId');
    if (!this.isEmpty(userId) && String(userId).length > 75) {
      this.violations.push(`Field 'userId' exceeds maximum length of 75 characters (actual: ${String(userId).length})`);
    }

    const sourceIdentifier = this.getFieldValue('sourceIdentifier');
    if (!this.isEmpty(sourceIdentifier) && String(sourceIdentifier).length > 75) {
      this.violations.push(`Field 'sourceIdentifier' exceeds maximum length of 75 characters (actual: ${String(sourceIdentifier).length})`);
    }

    const employeeId = this.getFieldValue('employeeId');
    if (!this.isEmpty(employeeId) && String(employeeId).length > 255) {
      this.violations.push(`Field 'employeeId' exceeds maximum length of 255 characters (actual: ${String(employeeId).length})`);
    }

    // Validate ContactInformation fields if present (all optional, but must meet constraints if provided)
    const contactInfo = this.getFieldValue('contactInformation');
    if (!this.isEmpty(contactInfo) && typeof contactInfo === 'object') {
      const { addressLine1, addressLine2, city, postalCode, phone, email } = contactInfo;
      
      if (!this.isEmpty(addressLine1) && String(addressLine1).length > 255) {
        this.violations.push(`Field 'contactInformation.addressLine1' exceeds maximum length of 255 characters`);
      }
      if (!this.isEmpty(addressLine2) && String(addressLine2).length > 255) {
        this.violations.push(`Field 'contactInformation.addressLine2' exceeds maximum length of 255 characters`);
      }
      if (!this.isEmpty(city) && String(city).length > 255) {
        this.violations.push(`Field 'contactInformation.city' exceeds maximum length of 255 characters`);
      }
      if (!this.isEmpty(postalCode) && String(postalCode).length > 255) {
        this.violations.push(`Field 'contactInformation.postalCode' exceeds maximum length of 255 characters`);
      }
      if (!this.isEmpty(phone) && String(phone).length > 255) {
        this.violations.push(`Field 'contactInformation.phone' exceeds maximum length of 255 characters`);
      }
      if (!this.isEmpty(email) && String(email).length > 255) {
        this.violations.push(`Field 'contactInformation.email' exceeds maximum length of 255 characters`);
      }
    }
  }

  /**
   * Returns true if the fieldSet is valid for the Huron target API (CREATE operation)
   */
  public isValidForTarget = (): boolean => {
    return this.violations.length === 0;
  }

  /**
   * Returns array of validation violation messages (empty if valid)
   */
  public getViolations = (): string[] => {
    return this.violations;
  }

  /**
   * Returns the skip reason if this record should be skipped rather than failed
   */
  public getSkipReason = (): string | undefined => {
    return this.skipReason;
  }
}


if(require.main === module) {
  (async () => {
    const fieldSet = await getPersonFieldSet();
    const mappingValidator = new MappingValidator(fieldSet);
    const fldValues = fieldSet?.fieldValues;
    console.log(`Mapped Input: ${JSON.stringify(fldValues, null, 2)}`);

    if (mappingValidator.isValidForTarget()) {
      console.log('FieldSet is valid for Huron Person API');
    } else {
      console.log('FieldSet is NOT valid for Huron Person API. Violations:');
      mappingValidator.getViolations().forEach(v => console.log(`- ${v}`));
    }
  })();

}