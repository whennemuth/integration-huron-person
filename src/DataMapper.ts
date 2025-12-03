import { Input } from 'integration-core';

/**
 * DataMapper class for:
 *   1) Sending raw person data fetched from the Boston University CDM api 
 *      through a mapping process that converts field names and formats into a form compatible 
 *      with the Huron target api endpoint, and structured integration-core Input format.
 *   2) Cherry-picking out only "fields of interest" that the target endpoint is interested in.
 */
export class DataMapper {
  /**
   * Convert raw person data to Input format
   * @param rawData Array of person data objects from Boston University CDM API
   */
  getMappedData(rawData: any[]): Input {
    const fieldDefinitions = [
      { name: 'id', type: 'string' as const, required: true, isPrimaryKey: true },
      { name: 'firstName', type: 'string' as const, required: true },
      { name: 'lastName', type: 'string' as const, required: true },
      { name: 'email', type: 'email' as const, required: true },
      { name: 'department', type: 'string' as const, required: true },
      { name: 'employeeId', type: 'string' as const, required: true },
      { name: 'status', type: 'select' as const, required: true },
      { name: 'hireDate', type: 'date' as const, required: true },
      { name: 'lastModified', type: 'date' as const, required: true }
    ];

    const fieldSets = rawData.map(person => {
      // Extract primary name (first PRI type name or fallback to first name)
      const primaryName = person.personBasic?.names?.find((name: any) => name.nameType === 'PRI') || 
                         person.personBasic?.names?.[0];
      
      // Extract primary email (university type preferred, or first available)
      const primaryEmail = person.email?.find((email: any) => email.type === 'university') ||
                          person.email?.find((email: any) => email.isPreferred === 'Y') ||
                          person.email?.[0];
      
      // Extract employment information from first position
      const firstPosition = person.employeeInfo?.positions?.[0]?.positionInfo;
      const basicData = firstPosition?.BasicData;
      
      // Extract department information
      const department = firstPosition?.Department;
      
      return {
        fieldValues: [
          { id: person.personid || undefined },
          { firstName: primaryName?.firstName || undefined },
          { lastName: primaryName?.lastName || undefined },
          { email: primaryEmail?.address || undefined },
          { department: department?.departmentName || department?.organizationalUnitDepartment || undefined },
          { employeeId: basicData?.personnelNumber || undefined },
          { status: this.mapEmploymentStatus(basicData?.sapEmpStatus?.description) || undefined },
          { hireDate: basicData?.hireDate || basicData?.employmentDate || undefined },
          { lastModified: undefined } // No equivalent field found in CDM data
        ]
      };
    });

    return {
      fieldDefinitions,
      fieldSets
    };
  }

  /**
   * Map CDM employment status to our expected status values
   * @param sapStatus SAP employment status description
   */
  private mapEmploymentStatus(sapStatus?: string): 'active' | 'inactive' | 'terminated' | undefined {
    if (!sapStatus) return undefined;
    
    const status = sapStatus.toLowerCase();
    if (status.includes('active')) return 'active';
    if (status.includes('terminated') || status.includes('term')) return 'terminated';
    if (status.includes('inactive')) return 'inactive';
    
    // Default to active for unknown statuses that seem positive
    return 'active';
  }
}