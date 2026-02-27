import { nullsToUndefined } from "../Utils";

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
export const NameMapper = (person: any, convertNullstoUndefined:boolean = true): { getName: () => any } => {

  if(convertNullstoUndefined) {
    person = nullsToUndefined(person);
  }

  const { personBasic: { names = [] } = {}} = person;

  let name = {}

  return {
    getName: () => {
      if(names.length === 0) {
        return name;      
      } else {
        // Sort names based on defined priorities
        const sortedNames = names.slice().sort((a: any, b: any) => {
          const aType = NameTypes.find(nt => nt.type === a.nameType && (nt.source ? nt.source === a.source : true));
          const bType = NameTypes.find(nt => nt.type === b.nameType && (nt.source ? nt.source === b.source : true));
          const aPriority = aType ? aType.priority : Number.MAX_VALUE;
          const bPriority = bType ? bType.priority : Number.MAX_VALUE;
          return aPriority - bPriority;
        });
        name = sortedNames[0];
        const { firstName, middleName, lastName } = name as any;
        return { firstName, middleName, lastName };
      }
    }
  }
}
