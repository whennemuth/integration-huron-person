import { nullsToUndefined } from '../Utils';

export type AddressType = { priority: number; type: string; source?: string; }

const AddressTypes = [
  { priority: 1, source: 'employeeInfo' },
  { priority: 2, source: 'studentInfo' },
  { priority: 4, source: 'affiliateInfo' },
  { priority: 3, source: 'facultyInfo' },
  { priority: 5, source: 'constituentInfo' },
] as AddressType[];


/**
 * This mapper selects from the available addresses the one that has the highest priority.
 * The priority is determined by the AddressTypes array defined above.
 * If no addresses are available that match the defined types, the first address in the list selected.
 * 
 * @param person 
 * @returns 
 */
  if(convertNullstoUndefined) {
    person = nullsToUndefined(person);
  }

  const addressList: { source: string; address: string }[] = [];

  const { 
    employeeInfo: { address: employeeAddresses = []} = { address: [] }, 
    studentInfo: { address: studentAddresses = [] } = { address: [] }, 
    facultyInfo: { address: facultyAddresses = [] } = { address: [] }, 
    affiliateInfo: { address: affiliateAddresses = [] } = { address: [] }, 
    constituentInfo: { address: constituentAddresses = [] } = { address: [] } 
  } = person;

  /**
   * Favor the street field over line1 for address line 1.
   * @param addr 
   * @returns 
   */
  const getAddressLine = (addr: any): string | undefined => {
    const { line1, street } = addr;
    if (street && `${street}`.trim() !== '') {
      return `${street}`.trim();
    } else if (line1 && `${line1}`.trim() !== '') {
      return `${line1}`.trim();
    }
    return undefined;
  }

  /**
   * Load the first of a set of addresses into the address list for priority sorting.
   * @param addresses 
   * @param source 
   * @returns 
   */
  const loadAddress = (addresses: any[], source: string) => {
    for (const addr of addresses) {
      const addrLine = getAddressLine(addr);
      if(addrLine) {
        addressList.push({ source, address: addrLine });
      }
    }
  }

  // Load addresses from different sources
  loadAddress(employeeAddresses, 'employeeInfo');
  loadAddress(studentAddresses, 'studentInfo');
  loadAddress(facultyAddresses, 'facultyInfo');
  loadAddress(affiliateAddresses, 'affiliateInfo');
  loadAddress(constituentAddresses, 'constituentInfo');

  let addressLine1: string | undefined;

  return {
    getAddressLine1: () => {
      if(addressList.length === 0) {
        return addressLine1;      
      } else {
        // Sort addresses based on defined priorities
        const sortedAddresses = addressList.slice().sort((a: any, b: any) => {
          const aType = AddressTypes.find(at => at.source === a.source);
          const bType = AddressTypes.find(at => at.source === b.source);
          const aPriority = aType ? aType.priority : Number.MAX_VALUE;
          const bPriority = bType ? bType.priority : Number.MAX_VALUE;
          return aPriority - bPriority;
        });
        return sortedAddresses[0].address;
      }
    }
  }
}