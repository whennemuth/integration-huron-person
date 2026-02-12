import { nullsToUndefined } from "../Utils";

export type UserIdType = { priority: number; source?: string; }

const UserIdTypes = [
  { priority: 1, source: 'SAP' },
  { priority: 2, source: 'Campus Solutions' }
] as UserIdType[];

export const UserIdMapper = (person: any, convertNullstoIndefined:boolean = true): { getUserId: () => any } => {

  if(convertNullstoIndefined) {
    person = nullsToUndefined(person);
  }

  const { personid, personDetails: { account = [] } = {} } = person;

  // Default to personid as a last resort  (should never happen that account is an empty array).
  let userId = personid;

  return {
    getUserId: () => {
      if(account.length === 0) {
        return userId;      
      } else {
        // Sort accounts based on defined priorities
        const sortedAccounts = account.slice().sort((a: any, b: any) => {
          const aType = UserIdTypes.find(ut => (ut.source ? ut.source === a.source : true));
          const bType = UserIdTypes.find(ut => (ut.source ? ut.source === b.source : true));
          const aPriority = aType ? aType.priority : Number.MAX_VALUE;
          const bPriority = bType ? bType.priority : Number.MAX_VALUE;
          return aPriority - bPriority;
        });
        return `${sortedAccounts[0]?.name}`.toLowerCase();
      }
    }
  }
}