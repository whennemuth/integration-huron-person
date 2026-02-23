import { nullsToUndefined } from "../Utils";

export type EmailType = { priority: number; type: string; source?: string; }

const EmailTypes = [
  { priority: 1, type: 'university', source: 'SAP' },
  { priority: 2, type: 'personal', source: 'SAP' },
  { priority: 3, type: 'BUEM', source: 'Campus Solutions' },
  { priority: 4, type: 'PERS', source: 'Campus Solutions' },
] as EmailType[];


/**
 * This mapper selects from the available emails the one that has the highest priority.
 * The priority is determined by the EmailTypes array defined above.
 * If no emails are available that match the defined types, the first email in the list selected.
 * 
 * @param person 
 * @returns 
 */
export const EmailMapper = (person: any, convertNullstoUndefined:boolean = true): { getEmail: () => any } => {

  if(convertNullstoUndefined) {
    person = nullsToUndefined(person);
  }

  const { email = [] } = person;

  let emailAddr;

  return {
    getEmail: () => {
      if(email.length === 0) {
        return emailAddr;      
      } else {
        // Sort emails based on defined priorities
        const sortedEmails = email.slice().sort((a: any, b: any) => {
          const aType = EmailTypes.find(et => et.type === a.type && (et.source ? et.source === a.source : true));
          const bType = EmailTypes.find(et => et.type === b.type && (et.source ? et.source === b.source : true));
          const aPriority = aType ? aType.priority : Number.MAX_VALUE;
          const bPriority = bType ? bType.priority : Number.MAX_VALUE;
          return aPriority - bPriority;
        });
        return sortedEmails[0].address;
      }
    }
  }
}