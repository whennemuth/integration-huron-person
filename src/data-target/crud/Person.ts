/**
 * TypeScript type definitions for Person entities as defined in huron-profile-api-2.0.0.json
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
 * Contact information for a person
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
  /** The preferred phone number for contacting the person */
  phone?: string;
  /** The email address associated with the person */
  email?: string;
  /** The URL of the official website associated with the person */
  website?: string;
}

/**
 * Welcome tip dismissal information
 */
export interface DismissedWelcomeTip {
  /** ID of the welcome tip message dismissed by the user */
  Id: string;
  /** The date and time at which the user dismissed this welcome tip message */
  dateDismissed: string;
}

/**
 * Array field operations for handling array fields in PUT/PATCH requests
 */
export interface ArrayFieldOperations {
  /** Values for following fields will be appended instead of replacing existing collection */
  append?: Array<'roles' | 'tags'>;
}

/**
 * Complete Person entity as defined in the Huron Profile API
 */
export interface HuronPerson {
  /** System generated unique value, which is unique within tenant */
  hrn?: HRN;
  /** The honorific prefix of the user (e.g., Dr., Hon.) */
  honorific?: string;
  /** A unique ID for the Person */
  id: string;
  /** Indicates whether the Person is active */
  active?: boolean | null;
  /** Indicates whether the Person is system internal */
  isInternal?: boolean;
  /** The first name of the Person */
  firstName: string;
  /** The last name of the Person */
  lastName: string;
  /** The middle name(s) of the Person */
  middleName?: string;
  /** The job title of the Person */
  title?: string;
  /** ID used to authenticate a Person as a user */
  userId?: string;
  /** The Open Researcher and Contributor ID (ORCID) for the contact */
  ORCID?: string;
  /** The unique ID assigned to the contact within external systems */
  sourceIdentifier?: string;
  /** Contact information for the person */
  contactInformation?: ContactInformation;
  /** Degrees earned by the contact */
  earnedDegrees?: string;
  /** The ID used by the institution to specify the individual */
  employeeId?: string;
  /** HRNREF that represents the specific employing organizational unit */
  employer: HRNREF;
  /** HRNREF that represents the primary organization that the contact is associated with */
  organization: HRNREF;
  /** HRNREF that represents an organization associated with the contact (secondary unit) */
  secondaryUnit?: HRNREF;
  /** HRNREF that represents an organization associated with the contact (additional unit) */
  additionalUnit?: HRNREF;
  /** An object of customized properties for the Person */
  customProperties?: Record<string, any>;
  /** Collection of tags used to group and filter Person records */
  tags?: HRNREF[];
  /** HRNREFs of the roles held by the Person as a user of the Huron Research Suite */
  roles?: HRNREF[];
  /** Indicates that the user has never logged in before */
  newUser?: boolean;
  /** Indicates whether the user is allowed to log in to the system */
  allowLogin?: boolean;
  /** Deprecated property. No longer in use. */
  showLoginTips?: boolean;
  /** The date and time the data was created */
  dateCreated?: string;
  /** The date and time the data was modified */
  dateModified?: string;
  /** The date and time when the external token was issued to the user */
  externalTokenIssueDate?: string;
  /** If the user has an external token defined, it can be stored in this attribute */
  externalToken?: string;
  /** If the user has an external token defined, its name can be stored in this attribute */
  externalTokenName?: string;
  /** If the user has an external token defined, its creator can be stored in this attribute */
  externalTokenCreatedBy?: string;
  /** If the user has an external token defined, its expiration can be stored in this attribute */
  externalTokenExpiresOn?: string;
  /** The rights assigned to this person (computed at run time, only returned from currentUser endpoint) */
  rights?: string[];
  /** The Cognito groups this person is part of (computed at run time, only returned from currentUser endpoint) */
  cognitoGroups?: string[];
  /** The list of welcome tip message IDs dismissed by the user */
  dismissedWelcomeTips?: DismissedWelcomeTip[];
  /** Intended operation for handling array fields when PUT/PATCH request is made to API */
  __arrayFieldOperations?: ArrayFieldOperations;
  /** The unique identifier assigned to each financial transaction record within the Open Payments system */
  openPaymentsId?: string;
}

/**
 * Filter field names supported by the API for persons
 */
export const FilterFields: Set<string> = new Set([
  'active',
  'includeInactive',
  'allowLogin',
  'contactInformation.phone',
  'contactInformation.email',
  'additionalUnit',
  'additionalUnit.hrn',
  'secondaryUnit',
  'secondaryUnit.hrn',
  'employer',
  'employer.hrn',
  'organization',
  'organization.hrn',
  'externalToken',
  'externalTokenExpiresOn',
  'firstName',
  'hrn',
  'isInternal',
  'id',
  'lastName',
  'newUser',
  'openPaymentId',
  'roles',
  'rights',
  'showLoginTips',
  'sourceIdentifier',
  'tags',
  'userId'
]);

/**
 * Sort field names supported by the API for persons
 */
export const SortFields: Set<string> = new Set([
  'firstName',
  'lastName',
  'userid',
  'dateModified',
  'dateCreated',
  'openPaymentsId',
  'contactInformation.email'
]);