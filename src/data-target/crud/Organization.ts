/**
 * TypeScript type definitions for Organization entities as defined in huron-profile-api-2.0.0.json
 */

/**
 * Huron Resource Name (HRN) - a system generated unique value with the following structure: `hrn:hrs:resource_type:resource_id`
 */
export type HRN = string;

/**
 * HRN Reference - contains an HRN and optionally a name
 */
export interface HRNREF {
  /** Huron Resource Name */
  hrn: HRN;
  /** The name associated to the record (read-only) */
  name?: string;
}

/**
 * Contact information for an organization
 */
export interface ContactInformation {
  /** Street number and name */
  addressLine1?: string;
  /** Address line 2 (e.g., Apartment, Building, or Unit number) */
  addressLine2?: string;
  /** The name of the city */
  city?: string;
  /** State/Province reference */
  stateProvince?: HRNREF;
  /** The ZIP or the postal code of the address */
  postalCode?: string;
  /** Country reference */
  country?: HRNREF;
  /** The preferred phone number for contacting the organization */
  phone?: string;
  /** The email address associated with the organization */
  email?: string;
  /** The URL of the official website associated with the organization */
  website?: string;
}

/**
 * Array field operations for handling array fields in PUT/PATCH requests
 */
export interface ArrayFieldOperations {
  /** Values for following fields will be appended instead of replacing existing collection */
  append?: Array<'functions' | 'tags'>;
}

/**
 * Complete Organization entity as defined in the Huron Profile API
 */
export interface HuronOrganization {
  /** System generated unique value, which is unique within tenant */
  hrn?: HRN;
  /** Name of the Organization */
  name: string;
  /** A unique ID for the Organization */
  id: string;
  /** Unique Identifier of the organization in the source system */
  sourceIdentifier?: string;
  /** Controls the visibility to users. Set to FALSE for Organization records that need to be referenced, but which are no longer active */
  active?: boolean;
  /** Indicates whether the Organization is system internal */
  isInternal?: boolean;
  /** Indicates whether the Organization is Foreign. If TRUE, the Organization is legally based outside the United States */
  isForeign?: boolean;
  /** Indicates whether the Organization is publicly traded. If TRUE, the Organization is a publicly-traded entity */
  isPubliclyTraded?: boolean;
  /** The date and time the Organization record was created */
  dateCreated?: string;
  /** The date and time the Organization record was modified */
  dateModified?: string;
  /** The parent organization (if any) */
  parent?: HRNREF;
  /** The category of this organization */
  category?: HRNREF;
  /** Alternate names, acronyms, or abbreviations that users might enter in searching for the organization */
  alias?: string[];
  /** Reserved for future use */
  links?: string[];
  /** Organization functions */
  functions?: HRNREF[];
  /** Notes about organization */
  notes?: string;
  /** Contact information for the organization */
  contactInformation?: ContactInformation;
  /** An object of customized properties for the organization */
  customProperties?: Record<string, any>;
  /** Collection of tags used to group and filter organizations */
  tags?: HRNREF[];
  /** Intended operation for handling array fields when PUT/PATCH request is made to API */
  __arrayFieldOperations?: ArrayFieldOperations;
}

/**
 * Filter fields available for organization queries
 */
export const FilterFields = new Set([
  'name',
  'id',
  'sourceIdentifier',
  'active',
  'isInternal',
  'isForeign',
  'isPubliclyTraded',
  'parent.hrn',
  'category.hrn',
  'alias',
  'functions.hrn',
  'notes',
  'contactInformation.addressLine1',
  'contactInformation.addressLine2',
  'contactInformation.city',
  'contactInformation.stateProvince.hrn',
  'contactInformation.postalCode',
  'contactInformation.country.hrn',
  'contactInformation.phone',
  'contactInformation.email',
  'contactInformation.website',
  'customProperties',
  'tags.hrn'
]);

/**
 * Sort fields available for organization queries
 */
export const SortFields = new Set([
  'name',
  'id',
  'sourceIdentifier',
  'active',
  'isInternal',
  'isForeign',
  'isPubliclyTraded',
  'dateCreated',
  'dateModified',
  'parent.name',
  'category.name',
  'contactInformation.city',
  'contactInformation.stateProvince.name',
  'contactInformation.country.name'
]);