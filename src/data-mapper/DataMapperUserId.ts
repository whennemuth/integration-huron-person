import { CrudOperation } from 'integration-core';
import { removeNullValues as removeNulls } from "../Utils";

export type UserIdType = { priority: number; source?: string; }

const UserIdTypes = [
  { priority: 1, source: 'SAP' },
  { priority: 2, source: 'Campus Solutions' }
] as UserIdType[];

export const UserIdMapper = (params: { 
  person: any, idpName: string, idpDomain?: string, removeNullValues?: boolean 
}): { getUserId: (crud?: CrudOperation) => any } => {
  let { person, idpName, idpDomain="bu.edu", removeNullValues = true } = params;

  if(removeNullValues) {
    person = removeNulls(person);
  }

  const { personid, personDetails: { account = [] } = {} } = person;

  // Default to personid as a last resort  (should never happen that account is an empty array).
  let userId = personid;

  return {
    getUserId: (crud?: CrudOperation) => {
      const crudOperation = crud || CrudOperation.CREATE;
      if(crudOperation === CrudOperation.UPDATE) {
        // For put/patch operations, we don't want to include the UserID as this value should never be changed.
        return undefined;
      }
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
        // Construct composite UserID: {idpName}_{account}@{idpDomain}
        // Example: bu-sso_wrh@bu.edu or bu-sso_TEST_wrh@bu.edu
        const accountName = sortedAccounts[0]?.name;
        if(!accountName) {
          return undefined;
        }
        return `${idpName}_${accountName.toLowerCase()}@${idpDomain}`;
      }
    }
  }
}