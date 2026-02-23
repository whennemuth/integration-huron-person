import { isEmpty, isNotEmpty, nullsToUndefined } from "../Utils";

export type OrgType = { priority: number; type: string; source?: string; }

const OrgTypes = [
  { priority: 1, source: 'employeeInfo' },
  { priority: 2, source: 'studentInfo' },
  { priority: 3, source: 'affiliateInfo' },
] as OrgType[];

/**
 * This mapper selects from the available organization IDs the one that has the highest priority.
 * The priority is determined by the OrgTypes array defined above.
 * If no organization IDs are available that match the defined types, an empty set is returned.
 * @param person 
 * @returns 
 */
export const OrgMapper = (person: any, convertNullstoUndefined:boolean = true): { getOrgs: () => Set<string> } => {

  if(convertNullstoUndefined) {
    person = nullsToUndefined(person);
  }

  const orgIdList: { source: string; orgId: string }[] = [];

  const { 
    employeeInfo: { positions: employeePositions = []} = { positions: [] }, 
    studentInfo: { studentSemester = [] } = {}, 
    affiliateInfo
  } = person;

  // Load organization from employee positions into org list for priority sorting.
  const positionOrgIds = new Set<string>();
  for (const pos of employeePositions) {
    const { positionInfo: { Department: { organizationalUnit } = {}} = {}} = pos;
    if (isNotEmpty(organizationalUnit)) {
      const trimmedOrgId = `${organizationalUnit}`.trim();
      positionOrgIds.add(trimmedOrgId); // Will be a no-op if already present
    }
  }
  if (positionOrgIds.size > 0) {
    orgIdList.push({ source: 'employeeInfo', orgId: `${[...positionOrgIds].join(',')}`.trim() });
  }

  // Load organization from student positions into org list for priority sorting.
  const collegeCodes = new Set<string>();
  for (const semester of studentSemester) {
    const { studentSemesterInfo: { degreeProgram = [] } = {}} = semester;
    for (const program of degreeProgram) {
      const { college: { code } = {}} = program;
      if (isNotEmpty(code)) {
        const trimmedCode = `${code}`.trim();
        collegeCodes.add(trimmedCode); // Will be a no-op if already present
      }
    }
  }
  if (collegeCodes.size > 0) {
    orgIdList.push({ source: 'studentInfo', orgId: `${[...collegeCodes].join(',')}`.trim() });
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
    getOrgs: (): Set<string> => {
      let orgIds = new Set<string>();
      const sortedOrgs = orgIdList.sort((a, b) => {
        const orgTypeA = OrgTypes.find(ot => ot.source === a.source);
        const orgTypeB = OrgTypes.find(ot => ot.source === b.source);
        return (orgTypeA?.priority || 99) - (orgTypeB?.priority || 99);
      });
      const { orgId } = sortedOrgs[0] || {};
      const trimmedOrgId = orgId ? orgId.trim() : '';
      if(trimmedOrgId.includes(',')) {
        const orgIdArray = trimmedOrgId.split(',').map(id => id.trim()).filter(id => id !== '');
        for (const id of orgIdArray) {
          if(isNotEmpty(id)) {
            orgIds.add(id); // Will be a no-op if already present
          }
        }
      }
      else if(isNotEmpty(trimmedOrgId)) {
        orgIds.add(trimmedOrgId);
      }
      return orgIds;
    }
  };
};