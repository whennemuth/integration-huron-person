import { BuCdmPersonDataSource } from "../../bin";
import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { BuCdmCurrentTermsDataSource, Term } from "../data-source/CurrentTermsDataSource";
import { HuronOrganization } from "../data-target/crud/Organization";
import { ReadOrganizations } from "../data-target/crud/ReadOrganizations";
import { getLocalConfig, isEmpty, isNotEmpty, removeEmptyValues, removeNullValues as removeNulls } from '../Utils';
import { TestEnvironment } from 'integration-core';

export type OrgType = { priority: number; type: string; source?: string; }

const OrgTypes = [
  { priority: 1, source: 'employeeInfo' },
  { priority: 2, source: 'studentInfo' },
  { priority: 3, source: 'affiliateInfo' },
] as OrgType[];

type PositionStatus = 'active' | 'active+' | 'inactive';

/**
 * Validates if a date string is in YYYYMMDD format and represents a valid date.
 * @param dateStr - Date string to validate (e.g., "20240101")
 * @returns true if valid date, false otherwise
 */
const isValidDate = (dateStr: any): boolean => {
  if (!dateStr || typeof dateStr !== 'string') return false;
  
  // Check format: exactly 8 digits
  if (!/^\d{8}$/.test(dateStr)) return false;
  
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10);
  const day = parseInt(dateStr.substring(6, 8), 10);
  
  // Basic validation
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  // Check if date is valid using Date object
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

/**
 * Converts YYYYMMDD string to Date object.
 * @param dateStr - Date string in YYYYMMDD format
 * @returns Date object or null if invalid
 */
const parseDate = (dateStr: string): Date | null => {
  if (!isValidDate(dateStr)) return null;
  
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed
  const day = parseInt(dateStr.substring(6, 8), 10);
  
  return new Date(year, month, day);
};

/**
 * Determines the status of a position based on employmentDate and terminationDate.
 * 
 * Status definitions:
 * - "active": employmentDate <= currentDate < terminationDate
 * - "active+": employmentDate <= currentDate && (terminationDate is empty or not a valid date)
 * - "inactive": Any of the following:
 *   - currentDate >= terminationDate
 *   - Both dates are empty or invalid
 *   - employmentDate is empty or invalid
 * 
 * @param position - Position object containing BasicData with employmentDate and terminationDate
 * @param currentDate - Current date for comparison (defaults to today)
 * @returns 'active', 'active+', or 'inactive'
 */
const getPositionStatus = (position: any, currentDate: Date = new Date()): PositionStatus => {
  const basicData = position?.positionInfo?.BasicData || {};
  const employmentDateStr = basicData.employmentDate;
  const terminationDateStr = basicData.terminationDate;
  
  // Check if employmentDate is valid
  const hasValidEmploymentDate = isValidDate(employmentDateStr);
  const hasValidTerminationDate = isValidDate(terminationDateStr);
  
  // Inactive case 4 & 5: employmentDate is empty/invalid
  if (!hasValidEmploymentDate) {
    return 'inactive';
  }
  
  const employmentDate = parseDate(employmentDateStr)!;
  
  // Check if employment has started
  if (employmentDate > currentDate) {
    return 'inactive'; // Employment hasn't started yet
  }
  
  // Active+ case 2: employmentDate <= currentDate && terminationDate is empty/invalid
  if (!hasValidTerminationDate) {
    return 'active+';
  }
  
  const terminationDate = parseDate(terminationDateStr)!;
  
  // Inactive case 3: currentDate >= terminationDate
  if (currentDate >= terminationDate) {
    return 'inactive';
  }
  
  // Active case 1: employmentDate <= currentDate < terminationDate
  return 'active';
};

const logTerminated = (pos: any, personId: string) => {
  const { BasicData: { position } = {}, Department = {} } = pos?.positionInfo || {};
  const json = JSON.stringify({ position, Department });
  console.log(`⚠ Person ${personId}: Position is terminated: ${json}`);
}

/**
 * Determines if a degree program is current based on the isCurrentAcademicProgram field.
 * A degree program is considered current if isCurrentAcademicProgram === 'Y'.
 * 
 * @param degreeProgram - Degree program object
 * @returns true if the degree program is current, false otherwise
 */
const isCurrentAcademicProgram = (degreeProgram: any): boolean => {
  const currentIndicator = degreeProgram?.isCurrentAcademicProgram;
  return currentIndicator === 'Y';
};

export type OrgAssignments = {
  employer?: string;
  organization?: string;
  secondaryUnit?: string;
  additionalUnit?: string;
  skipReason?: string; // Set when person should be skipped (e.g., student-only with no current term)
};

export type OrgMapperParams = {
  person: any,
  currentTerms: Term[];
  removeNullValues?: boolean;
  orgHrn?: (sourceOrgId: string) => string | undefined;
}

/**
 * Determines if a semester is current based on the currentTerms data.
 * A semester is considered current if its term code and academic career code match
 * a term in currentTerms where currentInd === 'Y'.
 * 
 * @param semester - Student semester object
 * @param currentTerms - Array of current term data from the system
 * @returns true if the semester is current, false otherwise
 */
const isCurrentSemester = (semester: any, currentTerms: Term[]): boolean => {
  const semesterTermCode = semester?.studentSemesterInfo?.academicTerm?.term?.code;
  const semesterCareerCode = semester?.studentSemesterInfo?.academicCareer?.code;
  
  // If either field is missing, we cannot determine if it's current
  if (!semesterTermCode || !semesterCareerCode) {
    return false;
  }
  
  // Check if this semester matches any current term
  return currentTerms.some(term => 
    term.currentInd === 'Y' &&
    term.term === semesterTermCode &&
    term.academicCareer === semesterCareerCode
  );
};

/**
 * This mapper selects from the available organization IDs and assigns them to specific fields
 * based on priority and alphabetical ordering.
 * 
 * Priority is determined by the OrgTypes array (employeeInfo > studentInfo > affiliateInfo).
 * For students, organizations are derived from:
 * - Primary (employer/organization): /studentInfo/studentSemester[x]/studentSemesterInfo/degreeProgram[y]/academicOrganization/code
 * - Secondary (secondaryUnit/additionalUnit): /studentInfo/studentSemester[x]/studentSemesterInfo/degreeProgram[y]/academicGroup/code (only if mapped)
 * 
 * Assignment rules for students:
 * - employer: Use first mapped primary code (via orgHrn); fallback to first primary code
 * - organization: Always equals employer
 * - secondaryUnit: Use first mapped secondary code
 * - additionalUnit: Use second mapped secondary code
 * 
 * Assignment rules for employees/affiliates:
 * - employer: First org code
 * - organization: Always equals employer
 * - secondaryUnit: Second org code
 * - additionalUnit: Third org code
 * 
 * @param person 
 * @returns Object with organization field assignments
 */
export const OrgMapper = (params: OrgMapperParams): { getOrgs: () => OrgAssignments } => {
  let { person, currentTerms, removeNullValues = true, orgHrn } = params;

  if(removeNullValues) {
    person = removeNulls(person);
  }

  const orgIdList: { source: string; orgId: string }[] = [];

  const { 
    employeeInfo: { positions: employeePositions = []} = { positions: [] }, 
    studentInfo = {}, studentInfo: { studentSemester = [], admissionHistory = [] } = {}, 
    affiliateInfo
  } = person;

  const studentClue = Object.keys(studentInfo).length > 0;

  // Load organization from employee positions into org list for priority sorting.
  // First, filter to only include active positions (active or active+)
  const currentDate = new Date();
  const activePositions = employeePositions.filter((pos: any) => {
    const status = getPositionStatus(pos, currentDate);
    const active = status === 'active' || status === 'active+';
    if (!active) {
      logTerminated(pos, person?.personid || 'UNKNOWN');
    }
    return active;
  });

  // Sort active positions by:
  // 1. mainPernrIndicator (Y first = primary)
  // 2. status (active before active+)
  const sortedPositions = [...activePositions].sort((a: any, b: any) => {
    const mainPernrA = a?.positionInfo?.BasicData?.mainPernrIndicator || 'N';
    const mainPernrB = b?.positionInfo?.BasicData?.mainPernrIndicator || 'N';
    const statusA = getPositionStatus(a, currentDate);
    const statusB = getPositionStatus(b, currentDate);
    
    // First priority: mainPernrIndicator (Y before N)
    if (mainPernrA === 'Y' && mainPernrB !== 'Y') return -1;
    if (mainPernrA !== 'Y' && mainPernrB === 'Y') return 1;
    
    // Second priority: status (active before active+)
    if (mainPernrA === mainPernrB) {
      if (statusA === 'active' && statusB === 'active+') return -1;
      if (statusA === 'active+' && statusB === 'active') return 1;
    }
    
    return 0; // Maintain relative order
  });

  // Extract organizationalUnits in priority order (primary, secondary, tertiary)
  for (const pos of sortedPositions) {
    const { positionInfo: { Department: { organizationalUnit } = {}} = {}} = pos;
    if (isNotEmpty(organizationalUnit)) {
      const trimmedOrgId = `${organizationalUnit}`.trim();
      // Add each organizationalUnit as separate entry to preserve priority order
      orgIdList.push({ source: 'employeeInfo', orgId: trimmedOrgId });
    }
  }

  // Load organization from student positions into org list for priority sorting.
  // Filter to only include current semesters based on currentTerms data
  const currentSemesters = studentSemester.filter((semester: any) => isCurrentSemester(semester, currentTerms));
  
  // Check if student-only with no current term enrollment (for skip determination)
  let skipReason: string | undefined;
  const personId = person?.personid || 'UNKNOWN';
  const hasEmployee = employeePositions.length > 0;
  const hasAffiliate = affiliateInfo && (
    isNotEmpty(affiliateInfo.organizationalUnit?.code) || 
    isNotEmpty(affiliateInfo.department?.code)
  );

  if (studentSemester.length > 0 && currentSemesters.length === 0) {
    // Check if this is truly student-only (no employee or affiliate)    
    if (!hasEmployee && !hasAffiliate) {
      skipReason = `Student-only with no current term enrollment (personId: ${personId})`;
      console.warn(`⚠ Person ${personId}: ${skipReason} - will be skipped`);
    }
  }
  else if (!hasEmployee && !hasAffiliate && studentSemester.length === 0) {
    if(admissionHistory.length > 0) {
      skipReason = `Non-enrolled student with admission history (personId: ${personId})`;
      console.warn(`⚠ Person ${personId}: ${skipReason} - will be skipped`);
    }
    else {
      if(studentClue) {
        skipReason = `Student-only with no current term enrollment or admission history (personId: ${personId})`;
      }
      else {
        skipReason = `Non-student with no employee or affiliate info (personId: ${personId})`;
      }
      console.warn(`⚠ Person ${personId}: ${skipReason} - will be skipped`);
    }
  }

  // Collect organization codes from degree programs:
  // - primaryOrgCodes: from degreeProgram.academicOrganization.code (for employer/organization)
  // - secondaryOrgCodes: from degreeProgram.academicGroup.code (for secondaryUnit/additionalUnit, only if mapped)
  const primaryOrgCodes: string[] = [];
  const secondaryOrgCodes: string[] = [];
  
  for (const semester of currentSemesters) {
    const { studentSemesterInfo: { degreeProgram = [] } = {}} = semester;
    
    // Filter to only current academic programs (isCurrentAcademicProgram === 'Y')
    const currentPrograms = degreeProgram.filter((program: any) => isCurrentAcademicProgram(program));
    
    for (const program of currentPrograms) {
      // Extract academicOrganization.code from degree program (one level up from academicPlan)
      const { 
        academicOrganization, 
        academicOrganization: { code: primaryOrgCode } = {},
        academicGroup, college
      } = program || {};

      if (isNotEmpty(primaryOrgCode)) {
        primaryOrgCodes.push(`${primaryOrgCode}`.trim());
      }
      
      // Extract academicGroup.code from degree program for secondary/additional units
      const secondaryOrgCode = program?.academicGroup?.code;
      if (isNotEmpty(secondaryOrgCode)) {
        secondaryOrgCodes.push(`${secondaryOrgCode}`.trim());
      }

      // TEMPORARY: supplemental logging
      if(isEmpty(primaryOrgCode) || !orgHrn?.(primaryOrgCode)) {
        console.log(`Unmappable/missing academicOrganization: ${JSON.stringify({
          academicOrganization, academicGroup, college
        })}`);
      }
    }
  }
  
  // Deduplicate and sort both arrays alphabetically
  const uniqueSortedPrimaryOrgCodes = Array.from(new Set(primaryOrgCodes)).sort();
  const uniqueSortedSecondaryOrgCodes = Array.from(new Set(secondaryOrgCodes)).sort();
  
  // Store student org data for use in getOrgs()
  const studentOrgData = {
    primary: uniqueSortedPrimaryOrgCodes,
    secondary: uniqueSortedSecondaryOrgCodes
  };
  
  // Add primary codes to orgIdList (for priority sorting)
  for (const code of uniqueSortedPrimaryOrgCodes) {
    orgIdList.push({ source: 'studentInfo', orgId: code });
  }

  // Load organization from affiliate positions into org list for priority sorting.
  if( qualifiesAsAffiliate(affiliateInfo) ) {
    orgIdList.push({ source: 'affiliateInfo', orgId: 'AFFILIATE' });
  }

  return {
    getOrgs: (): OrgAssignments => {
      // Sort by source priority (employeeInfo > studentInfo > affiliateInfo)
      const sortedOrgs = orgIdList.sort((a, b) => {
        const orgTypeA = OrgTypes.find(ot => ot.source === a.source);
        const orgTypeB = OrgTypes.find(ot => ot.source === b.source);
        return (orgTypeA?.priority || 99) - (orgTypeB?.priority || 99);
      });
      
      if (sortedOrgs.length === 0) {
        // Even with no orgs, return skipReason if it was determined
        return skipReason ? { skipReason } : {};
      }
      
      // Get the highest priority source
      const highestPrioritySource = sortedOrgs[0].source;
      
      // Collect all orgIds from the highest priority source in order (preserves primary/secondary/tertiary)
      // Use a Set to deduplicate while preserving insertion order
      const orgSet = new Set<string>();
      for (const entry of sortedOrgs) {
        if (entry.source === highestPrioritySource && isNotEmpty(entry.orgId)) {
          orgSet.add(entry.orgId);
        }
      }
      
      // Convert to array for indexed access
      const orgArray = Array.from(orgSet);
      
      // Assign organizations according to CSV specification:
      // - employer: For students with orgHrn, use first mapped primary code; otherwise use first primary code
      // - organization: Always equals employer
      // - secondaryUnit/additionalUnit: Use mapped secondary codes
      const assignments: OrgAssignments = {};
      
      // Special handling for students: use primary codes for employer, secondary codes for units
      if (highestPrioritySource === 'studentInfo' && studentOrgData) {
        let employerCode: string | undefined;
        
        // Try to find a mapped primary code for employer (if orgHrn provided)
        if (orgHrn && studentOrgData.primary.length > 0) {
          for (const code of studentOrgData.primary) {
            const mapped = orgHrn(code);
            if (mapped) {
              employerCode = code;
              break; // Use first mapped code
            }
            else {
              console.warn(`No mapping found for org code: ${code}`);
            }
          }
        }
        
        // Fallback to first primary code if no mapping found or orgHrn not provided
        if (!employerCode && studentOrgData.primary.length > 0) {
          employerCode = studentOrgData.primary[0];
        }
        
        // Set employer and organization (organization = employer)
        if (employerCode) {
          assignments.employer = employerCode;
          assignments.organization = employerCode;
        }
        
        // For secondaryUnit and additionalUnit, use secondary codes that are mapped
        if (orgHrn && studentOrgData.secondary.length > 0) {
          const mappedSecondaryCodes: string[] = [];
          
          for (const code of studentOrgData.secondary) {
            const mapped = orgHrn(code);
            if (mapped) {
              mappedSecondaryCodes.push(code);
            }
            else {
              console.warn(`No mapping found for org code: ${code}`);
            }
          }
          
          // Filter out codes that duplicate employer/organization
          const uniqueSecondaryCodes = mappedSecondaryCodes.filter(code => code !== assignments.employer);
          
          if (uniqueSecondaryCodes.length > 0) {
            assignments.secondaryUnit = uniqueSecondaryCodes[0];
          }
          
          if (uniqueSecondaryCodes.length > 1) {
            assignments.additionalUnit = uniqueSecondaryCodes[1];
          }
        }
      } else if (highestPrioritySource === 'studentInfo' && orgArray.length > 0) {
        // Fallback if studentOrgData is not available (shouldn't happen in normal flow)
        let employerCode: string | undefined;
        
        // Try to find a mapped code for employer (if orgHrn provided)
        if (orgHrn) {
          for (const code of orgArray) {
            const mapped = orgHrn(code);
            if (mapped) {
              employerCode = code;
              break; // Use first mapped code
            }
            else {
              console.warn(`No mapping found for org code: ${code}`);
            }
          }
        }
        
        // Fallback to first code if no mapping found or orgHrn not provided
        if (!employerCode) {
          employerCode = orgArray[0];
        }
        
        // Set employer and organization (organization = employer)
        assignments.employer = employerCode;
        assignments.organization = employerCode;
        
        // For secondaryUnit and additionalUnit, use remaining codes (excluding employer)
        const remainingCodes = orgArray.filter(code => code !== employerCode);
        
        if (remainingCodes.length > 0) {
          assignments.secondaryUnit = remainingCodes[0];
        }
        
        if (remainingCodes.length > 1) {
          assignments.additionalUnit = remainingCodes[1];
        }
      } else {
        // For employees and affiliates: use positional assignment
        if (orgArray.length > 0) {
          assignments.employer = orgArray[0];
          assignments.organization = orgArray[0]; // organization = employer
        }
        
        if (orgArray.length > 1) {
          assignments.secondaryUnit = orgArray[1];
        }
        
        if (orgArray.length > 2) {
          assignments.additionalUnit = orgArray[2];
        }
      }
      
      // Add skipReason if determined earlier
      if (skipReason) {
        assignments.skipReason = skipReason;
      }
      
      return assignments;
    }
  };
};

/**
 * The a person is not an employee or a student, then they automatically quallify as an
 * affiliate, EVEN IF THEIR INFO IS EMPTY! This make affiliate the default "fallthrough" 
 * category for a person who is not an employee or a student.
 * The reason for this is that the we would NOT receive that persons record to be performing
 * this analysis on it if upstream logic (at the source system) had not determined that they
 * neither of the 3. Therefore, if they are not an employee or a student, they MUST be an
 * affiliate, regardless of whether their affiliateInfo is empty or not. This is a business 
 * rule that we must follow. 
 * @param affiliateInfo 
 * @returns 
 */
const qualifiesAsAffiliate = (affiliateInfo: any): boolean => {
  // Always a potential affiliate.
  return true;

  if( isNotEmpty(affiliateInfo) ) {
    // If either organizationalUnit or department is present, we consider AFFILIATE as orgId.
    const { organizationalUnit, department } = affiliateInfo;
    if( ! isEmpty(organizationalUnit) || ! isEmpty(department) ) {
      return true;
    }
  }
  return false;
}

export type OrgMappings = { 
  forwardMap: Map<string, string>, 
  reverseMap: Map<string, string> 
};

export const loadOrgMap = async (config: Config): Promise<OrgMappings> => {
  const reader = new ReadOrganizations({ config });
  console.log('Reading all organizations...');
  const allOrganizations: HuronOrganization[] = await reader.readAllOrganizationsNonTokenized({
    pagination: { pageSize: 500 },
    includeFields: [ 'hrn', 'id', 'sourceIdentifier' ]
  });
  // Turn the array into a map of sourceIdentifier to HRN for easy lookup, and log any records that are missing sourceIdentifier or HRN
  const forwardMap = new Map<string, string>();
  const reverseMap = new Map<string, string>();
  for (const org of allOrganizations) {
    const { hrn, id } = org;
    const { sourceIdentifier = id } = org;
    if( ! isEmpty(hrn) && ! isEmpty(sourceIdentifier)) {
      forwardMap.set(sourceIdentifier, hrn!);
      reverseMap.set(hrn!, sourceIdentifier);
    } else if (isEmpty(sourceIdentifier)) {
      console.warn(`Organization missing sourceIdentifier: ${JSON.stringify(org)}`);
    }
  }
  console.log(`Found ${forwardMap.size} organizations`);
  return { forwardMap, reverseMap };
}



if(require.main === module) {
  const testEnvironment = TestEnvironment('DATA_MAPPER_ORG');

  [
    'SYNC_BUID'
  ].forEach(testEnvironment.getVarOrEmptyString);

  (async () => {
    const { HURON_PERSON_CONFIG_PATH, SYNC_BUID:buid } = process.env;
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config: Config = ConfigManager.getInstance().reset().fromEnvironment().fromFileSystem(localConfigPath).getConfig('person');
    const orgMap = await loadOrgMap(config);
    console.log(`Organization Map: ${JSON.stringify(Array.from(orgMap.forwardMap.entries()).slice(0, 10), null, 2)}...`); // Log first 10 entries for brevity

    if(!buid) {
      console.error('Missing required SYNC_BUID environment variable!');
      process.exit(1);
    }
    const termsDataSource = new BuCdmCurrentTermsDataSource({ config });
    const currentTerms = await termsDataSource.fetchRaw();
    const dataSource = new BuCdmPersonDataSource({ config, buid });
    const rawData = await dataSource.fetchRaw();
    const person = removeEmptyValues(rawData[0]) || {};

    // Create orgHrn function from the loaded orgMap
    const orgHrn = (sourceOrgId: string) => orgMap.forwardMap.get(sourceOrgId);

    const orgAssignments: OrgAssignments = OrgMapper({ 
      person, 
      currentTerms, 
      removeNullValues: false,
      orgHrn
    }).getOrgs();

    console.log(`Organization Assignments: ${JSON.stringify(orgAssignments, null, 2)}`);
  })()};