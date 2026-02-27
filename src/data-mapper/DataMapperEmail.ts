import { nullsToUndefined } from "../Utils";
import { DataMapperHeuristics, EMAIL_TYPE, SOURCE } from "./DataMapperHeuristics";

export type EmailType = { priority: number; type: string; source?: string; }

const EmailTypes = [
  { priority: 1, source: SOURCE.SAP, type: EMAIL_TYPE.UNIVERSITY },
  { priority: 2, source: SOURCE.SAP, type: EMAIL_TYPE.BUEMAIL },
  { priority: 3, source: SOURCE.CS, type: EMAIL_TYPE.UNIVERSITY },
  { priority: 4, source: SOURCE.CS, type: EMAIL_TYPE.BUEMAIL },
  { priority: 5, source: SOURCE.VDS, type: EMAIL_TYPE.UNIVERSITY },
  { priority: 6, source: SOURCE.VDS, type: EMAIL_TYPE.BUEMAIL },
  { priority: 7, type: EMAIL_TYPE.UNIVERSITY },
  { priority: 8, type: EMAIL_TYPE.BUEMAIL },
  { priority: 9, type: EMAIL_TYPE.PERSONAL }
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

  const { email:basicEmails = [] } = person;

  const heuristicEmails = basicEmails.map((e: any) => ({
    ...e,
    getSource: () => new DataMapperHeuristics(e?.source).getSource(),
    getEmailType: () => new DataMapperHeuristics(e?.type).getEmailType()
  }));

  let emailAddr;

  return {
    getEmail: () => {
      if(heuristicEmails.length === 0) {
        return emailAddr;      
      } else {
        // Sort emails based on defined priorities
        const sortedEmails = heuristicEmails.slice().sort((a: any, b: any) => {
          const aType = EmailTypes.find(et => et.type === a.getEmailType() && (et.source ? et.source === a.getSource() : true));
          const bType = EmailTypes.find(et => et.type === b.getEmailType() && (et.source ? et.source === b.getSource() : true));
          const aPriority = aType ? aType.priority : Number.MAX_VALUE;
          const bPriority = bType ? bType.priority : Number.MAX_VALUE;
          return aPriority - bPriority;
        });
        return sortedEmails[0].address;
      }
    }
  }
}