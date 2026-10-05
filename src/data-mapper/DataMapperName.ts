import { removeNullValues as removeNulls } from "../Utils";
import { compareMMDDYYYYDates } from "./DataMapperDateSorter";

export type NameType = { priority: number; type: string; source?: string; }

const NameTypes = [
  { priority: 1, type: 'PRF', source: 'SAP' },
  { priority: 2, type: 'PRF', source: 'Campus Solutions' },
  { priority: 3, type: 'PRI', source: 'SAP' },
  { priority: 4, type: 'PRI', source: 'Campus Solutions' },
] as NameType[];

/**
 * This mapper selects from the available names the one that has the highest priority.
 * The priority is determined by the NameTypes array defined above.
 * If no names are available that match the defined types, the first name in the list selected.
 * 
 * @param person 
 * @returns The selected name object mapped over to the target Huron structure.
 */
export const NameMapper = (params: { person: any, removeNullValues:boolean, preferredOnly?: boolean }): { getName: () => any } => {
  let { person, removeNullValues = true, preferredOnly = false } = params;

  if(removeNullValues) {
    person = removeNulls(person);
  }

  const compareEffectiveDates = (a:any, b: any): number => {
    return compareMMDDYYYYDates(a.effectiveDate, b.effectiveDate);
  }
  
  /**
   * Helper function to check if a name entry has both firstName and lastName.
   * middleName is optional.
   */
  const hasRequiredNameFields = (nameEntry: any): boolean => {
    return !!(nameEntry?.firstName && nameEntry?.lastName);
  }

  const { personBasic: { names = [] } = {}} = person;

  let name = {}

  return {
    getName: () => {
      if(names.length === 0) {
        return name;      
      }
      if(preferredOnly) {
        // For now we are not using names that do not have a "PRF" type.
        let filteredNames = names.filter((n: any) => {
          const nt = `${n.nameType}`.trim().toUpperCase();
          const ed = `${n.effectiveDate}`.trim();
          return nt === 'PRF' && /^\d{8}$/.test(ed); // Ensure effectiveDate is in YYYYMMDD format
        });

        if(filteredNames.length === 0) {
          filteredNames = names.filter((n: any) => {
            const nt = `${n.nameType}`.trim().toUpperCase();
            return nt === 'PRF' && n.effectiveDate; // effectiveDate exists but may not be in expected format
          });
          if(filteredNames.length === 0) {
            console.warn(`No preferred names found with valid effectiveDate format for person ${person.personid}. This may lead to non-deterministic name selection. Please check the source data for these names: ${JSON.stringify(names)}`);
            // No preferred names with effective dates at all, so fall back to any preferred name regardless of effective date.
            return name;
          } 
          else if(filteredNames.length === 1) {
            // There is only one preferred name with an effective date (albeit unrecognizable), so use it.
            const { firstName, middleName, lastName } = filteredNames[0] as any;
            return { firstName, middleName, lastName };
          }
          else {
            // There are multiple preferred names with effective dates that are unrecognizable. Log a warning and continue with the filtering logic which will select the first name in this case.
            console.warn(`Multiple preferred names found with unrecognizable effectiveDate format for person ${person.personid}. This may lead to non-deterministic name selection. Please check the source data for these names: ${JSON.stringify(filteredNames)}`);
            return name;
          }
        }
        else {
          // Return the "PRF" name with the most recent effective date (largest YYYYMMDD value). 
          // This handles the case where there are multiple "PRF" names by selecting the one that is currently 
          // in effect based on the effectiveDate.
          const sortedNames = filteredNames.slice().sort(compareEffectiveDates);
          // Find the first name entry that has both firstName and lastName
          name = sortedNames.find(hasRequiredNameFields) || {};
          if (Object.keys(name).length === 0) {
            console.warn(`No preferred names with required fields (firstName, lastName) found for person ${person.personid}`);
            return name;
          }
          const { firstName, middleName, lastName } = name as any;
          return { firstName, middleName, lastName };
        }
      }
      else {

        // Sort names based on defined priorities
        const sortedNames = names.slice().sort((a: any, b: any) => {
          const aType = NameTypes.find(nt => nt.type === a.nameType && (nt.source ? nt.source === a.source : true));
          const bType = NameTypes.find(nt => nt.type === b.nameType && (nt.source ? nt.source === b.source : true));
          const aPriority = aType ? aType.priority : Number.MAX_VALUE;
          const bPriority = bType ? bType.priority : Number.MAX_VALUE;
          return aPriority - bPriority;
        });
        
        // Return empty object if no names remain after filtering
        if(sortedNames.length === 0) {
          return name;
        }
        
        // Find the first name entry that has both firstName and lastName
        name = sortedNames.find(hasRequiredNameFields) || {};
        if (Object.keys(name).length === 0) {
          console.warn(`No names with required fields (firstName, lastName) found for person ${person.personid}`);
          return name;
        }
        const { firstName, middleName, lastName } = name as any;
        return { firstName, middleName, lastName };
      }
    }
  }
}
