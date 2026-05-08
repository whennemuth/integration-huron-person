import { FieldSet } from 'integration-core';
import { MappingValidator } from '../../src/data-mapper/MappingValidator';

describe('MappingValidator', () => {
  
  describe('Valid FieldSets', () => {
    it('should validate a complete valid FieldSet', () => {
      const validFieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST123' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:123' } },
          { organization: { hrn: 'hrn:hrs:orgs:456' } },
          { contactInformation: { email: 'john.doe@example.com' } }
        ]
      };

      const validator = new MappingValidator(validFieldSet);
      expect(validator.isValidForTarget()).toBe(true);
      expect(validator.getViolations()).toEqual([]);
    });

    it('should validate a minimal valid FieldSet (required fields only)', () => {
      const minimalFieldSet: FieldSet = {
        fieldValues: [
          { id: 'MIN-ID' },
          { firstName: 'Jane' },
          { lastName: 'Smith' },
          { employer: { hrn: 'hrn:hrs:orgs:999' } },
          { organization: { hrn: 'hrn:hrs:orgs:888' } }
        ]
      };

      const validator = new MappingValidator(minimalFieldSet);
      expect(validator.isValidForTarget()).toBe(true);
      expect(validator.getViolations()).toEqual([]);
    });

    it('should allow id with valid characters (letters, numbers, hyphens, underscores)', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'Valid_ID-123' },
          { firstName: 'Test' },
          { lastName: 'User' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(true);
    });

    it('should allow optional fields with valid lengths', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { middleName: 'Middle' },
          { title: 'Software Engineer' },
          { userId: 'user123' },
          { sourceIdentifier: 'SRC-123' },
          { employeeId: 'EMP-456' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } },
          { contactInformation: {
              addressLine1: '123 Main St',
              addressLine2: 'Apt 4',
              city: 'Boston',
              postalCode: '02101',
              phone: '555-1234',
              email: 'test@example.com'
            }
          }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(true);
    });
  });

  describe('Missing Required Fields', () => {
    it('should fail when id is missing', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: id');
    });

    it('should fail when firstName is missing', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: firstName');
    });

    it('should fail when lastName is missing', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: lastName');
    });

    it('should fail when employer is missing', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: employer');
    });

    it('should fail when organization is missing', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: organization');
    });

    it('should fail with multiple missing required fields', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { firstName: 'John' }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      const violations = validator.getViolations();
      expect(violations).toContain('Missing required field: id');
      expect(violations).toContain('Missing required field: lastName');
      expect(violations).toContain('Missing required field: employer');
      expect(violations).toContain('Missing required field: organization');
    });
  });

  describe('Empty/Whitespace Values', () => {
    it('should fail when id is empty string', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: '' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: id');
    });

    it('should fail when firstName is whitespace only', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: '   ' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: firstName');
    });

    it('should fail when lastName is undefined', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: undefined as any },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Missing required field: lastName');
    });
  });

  describe('Invalid id Format', () => {
    it('should fail when id exceeds 75 characters', () => {
      const longId = 'A'.repeat(76);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: longId },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContainEqual(expect.stringContaining(`Field 'id' exceeds maximum length of 75 characters`));
    });

    it('should fail when id contains invalid characters (spaces)', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'INVALID ID' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain(`Field 'id' contains invalid characters (must be letters, numbers, hyphens, or underscores only)`);
    });

    it('should fail when id contains invalid characters (special chars)', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST@123!' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain(`Field 'id' contains invalid characters (must be letters, numbers, hyphens, or underscores only)`);
    });
  });

  describe('Field Length Constraints', () => {
    it('should fail when firstName exceeds 255 characters', () => {
      const longName = 'A'.repeat(256);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: longName },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContainEqual(expect.stringContaining(`Field 'firstName' exceeds maximum length of 255 characters`));
    });

    it('should fail when lastName exceeds 255 characters', () => {
      const longName = 'B'.repeat(256);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: longName },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContainEqual(expect.stringContaining(`Field 'lastName' exceeds maximum length of 255 characters`));
    });

    it('should fail when middleName exceeds 255 characters', () => {
      const longName = 'C'.repeat(256);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { middleName: longName },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContainEqual(expect.stringContaining(`Field 'middleName' exceeds maximum length of 255 characters`));
    });

    it('should fail when userId exceeds 75 characters', () => {
      const longUserId = 'U'.repeat(76);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { userId: longUserId },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContainEqual(expect.stringContaining(`Field 'userId' exceeds maximum length of 75 characters`));
    });

    it('should fail when sourceIdentifier exceeds 75 characters', () => {
      const longSourceId = 'S'.repeat(76);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { sourceIdentifier: longSourceId },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContainEqual(expect.stringContaining(`Field 'sourceIdentifier' exceeds maximum length of 75 characters`));
    });
  });

  describe('Employer and Organization Validation', () => {
    it('should fail when employer is missing hrn property', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { name: 'Employer Name' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Field employer is missing required property: hrn');
    });

    it('should fail when organization is missing hrn property', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { name: 'Org Name' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Field organization is missing required property: hrn');
    });

    it('should fail when employer hrn is empty', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: '' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Field employer is missing required property: hrn');
    });

    it('should fail when employer is not an object', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: 'not-an-object' },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain('Field employer must be an object with hrn property');
    });
  });

  describe('ContactInformation Validation', () => {
    it('should fail when contactInformation.email exceeds 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } },
          { contactInformation: { email: longEmail } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain(`Field 'contactInformation.email' exceeds maximum length of 255 characters`);
    });

    it('should fail when contactInformation.addressLine1 exceeds 255 characters', () => {
      const longAddress = 'X'.repeat(256);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } },
          { contactInformation: { addressLine1: longAddress } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      expect(validator.getViolations()).toContain(`Field 'contactInformation.addressLine1' exceeds maximum length of 255 characters`);
    });

    it('should allow empty contactInformation (all fields optional)', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } },
          { contactInformation: {} }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(true);
    });

    it('should allow missing contactInformation entirely', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle FieldSet with empty fieldValues array', () => {
      const fieldSet: FieldSet = {
        fieldValues: []
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      const violations = validator.getViolations();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations).toContain('Missing required field: id');
    });

    it('should handle multiple violations in one FieldSet', () => {
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'INVALID ID WITH SPACES!' },
          { firstName: 'A'.repeat(256) },
          { lastName: '' },
          { employer: 'not-an-object' },
          { organization: { name: 'missing hrn' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(false);
      const violations = validator.getViolations();
      expect(violations.length).toBeGreaterThanOrEqual(5);
    });

    it('should allow id at exactly 75 characters (boundary)', () => {
      const id75 = 'A'.repeat(75);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: id75 },
          { firstName: 'John' },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(true);
    });

    it('should allow firstName at exactly 255 characters (boundary)', () => {
      const name255 = 'B'.repeat(255);
      const fieldSet: FieldSet = {
        fieldValues: [
          { id: 'TEST' },
          { firstName: name255 },
          { lastName: 'Doe' },
          { employer: { hrn: 'hrn:hrs:orgs:1' } },
          { organization: { hrn: 'hrn:hrs:orgs:2' } }
        ]
      };

      const validator = new MappingValidator(fieldSet);
      expect(validator.isValidForTarget()).toBe(true);
    });
  });
});
