import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { Term } from "../data-source/CurrentTermsDataSource";
import { HuronOrganization } from "../data-target/crud/Organization";
import { ReadOrganizations } from "../data-target/crud/ReadOrganizations";
import { isEmpty, isNotEmpty, removeNullValues as removeNulls } from "../Utils";

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

/**
 * Determines if a student semester is current based on the currentTerms data.
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
};

export type OrgMapperParams = {
  person: any,
  currentTerms: Term[];
  removeNullValues?: boolean
}

/**
 * This mapper selects from the available organization IDs and assigns them to specific fields
 * based on priority and alphabetical ordering.
 * 
 * Priority is determined by the OrgTypes array (employeeInfo > studentInfo > affiliateInfo).
 * For students, organizations are sorted alphabetically before assignment.
 * 
 * Assignment rules:
 * - 1st organization → employer AND organization (both get same value)
 * - 2nd organization → secondaryUnit
 * - 3rd organization → additionalUnit
 * - 4th+ organizations → discarded
 * 
 * @param person 
 * @returns Object with organization field assignments
 */
export const OrgMapper = (params: OrgMapperParams): { getOrgs: () => OrgAssignments } => {
  let { person, currentTerms, removeNullValues = true } = params;

  if(removeNullValues) {
    person = removeNulls(person);
  }

  const orgIdList: { source: string; orgId: string }[] = [];

  const { 
    employeeInfo: { positions: employeePositions = []} = { positions: [] }, 
    studentInfo: { studentSemester = [] } = {}, 
    affiliateInfo
  } = person;

  // Load organization from employee positions into org list for priority sorting.
  // First, filter to only include active positions (active or active+)
  const currentDate = new Date();
  const activePositions = employeePositions.filter((pos: any) => {
    const status = getPositionStatus(pos, currentDate);
    return status === 'active' || status === 'active+';
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
  
  // Collect all academic organization codes from current academic programs
  const studentOrgCodes: string[] = [];
  
  for (const semester of currentSemesters) {
    const { studentSemesterInfo: { degreeProgram = [] } = {}} = semester;
    
    // Filter to only current academic programs (isCurrentAcademicProgram === 'Y')
    const currentPrograms = degreeProgram.filter((program: any) => isCurrentAcademicProgram(program));
    
    for (const program of currentPrograms) {
      const { academicPlan = [] } = program;
      
      // Extract academicOrganization.code from each academic plan
      for (const plan of academicPlan) {
        const orgCode = plan?.academicOrganization?.code;
        if (isNotEmpty(orgCode)) {
          studentOrgCodes.push(`${orgCode}`.trim());
        }
      }
    }
  }
  
  // Deduplicate and sort alphabetically
  const uniqueSortedOrgCodes = Array.from(new Set(studentOrgCodes)).sort();
  
  // Add to orgIdList in alphabetical order
  for (const code of uniqueSortedOrgCodes) {
    orgIdList.push({ source: 'studentInfo', orgId: code });
  }

  // Load organization from affiliate positions into org list for priority sorting.
  if( isNotEmpty(affiliateInfo) ) {
    // If either organizationalUnit or department is present, we consider AFFILIATE as orgId.
    const { organizationalUnit, department } = affiliateInfo;
    if( ! isEmpty(organizationalUnit) || ! isEmpty(department) ) {
      orgIdList.push({ source: 'affiliateInfo', orgId: 'AFFILIATE' });
    }
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
        return {};
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
      // - Employees/Students: 1st → employer AND organization, 2nd → secondaryUnit, 3rd → additionalUnit
      // - Affiliates: Only set employer = "AFFILIATE" (organization, secondaryUnit, additionalUnit are EXEMPTED per CSV spec)
      const assignments: OrgAssignments = {};
      
      if (orgArray.length > 0) {
        assignments.employer = orgArray[0];
        
        // For affiliates, organization field is EXEMPTED (not set)
        if (highestPrioritySource !== 'affiliateInfo') {
          assignments.organization = orgArray[0];
        }
      }
      
      // secondaryUnit and additionalUnit only apply to employees and students, not affiliates
      if (highestPrioritySource !== 'affiliateInfo') {
        if (orgArray.length > 1) {
          assignments.secondaryUnit = orgArray[1];
        }
        
        if (orgArray.length > 2) {
          assignments.additionalUnit = orgArray[2];
        }
      }
      
      return assignments;
    }
  };
};

export type OrgMappings = { 
  forwardMap: Map<string, string>, 
  reverseMap: Map<string, string> 
};

export const loadOrgMap = async (config: Config): Promise<OrgMappings> => {
  const reader = new ReadOrganizations(config);
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
    } else {
      console.warn(`Organization missing HRN or sourceIdentifier: ${JSON.stringify(org)}`);
    }
  }
  console.log(`Found ${forwardMap.size} organizations`);
  return { forwardMap, reverseMap };
}



if(require.main === module) {
  (async () => {
    const config: Config = ConfigManager.getInstance().reset().fromEnvironment().fromFileSystem().getConfig('person');
    const orgMap = await loadOrgMap(config);
    console.log(`Organization Map: ${JSON.stringify(Array.from(orgMap.forwardMap.entries()).slice(0, 10), null, 2)}...`); // Log first 10 entries for brevity
  })()};