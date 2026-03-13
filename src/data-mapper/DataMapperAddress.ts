import { isEmpty, removeNullValues as removeNulls } from '../Utils';
import { AddressSorter, AddressType } from './DataMapperAddressSorter';
import { CountryMappings } from './DataMapperCountry';
import { StateMappings } from './DataMapperState';

export { AddressType };

export type AddressMapperParms = {
  person: any;
  stateMappings: StateMappings;
  countryMappings: CountryMappings;
  removeNullValues?:boolean;
  addressTypes?: Set<AddressType>;
}

export type MappedAddress = {
  getAddressLine1: () => any;
  getCity: () => string | undefined;
  getStateProvince: () => { hrn: string, name: string } | undefined;
  getCounty: () => string | undefined;
  getCountry: () => { hrn: string, name: string } | undefined;
  getPostalCode: () => string | undefined;
}

/**
 * This mapper uses the provided sorter to obtain a single address from all addresses
 * available in the person object. From the address, fields are mapped to their
 * respective Huron target counterparts.
 * 
 * @param person 
 * @returns 
 */
export const AddressMapper = (params: AddressMapperParms): MappedAddress => {

  let { 
    person, stateMappings, countryMappings, removeNullValues = true, 
    addressTypes = new Set<AddressType>([ AddressType.EMPLOYEE ]) 
  } = params;

  if(removeNullValues) {
    person = removeNulls(person);
  }

  const addressList: { source: string; address: any }[] = [];

  const { 
    employeeInfo: { positions = [] } = { positions: [] }, 
    studentInfo: { address: studentAddresses = [] } = { address: [] }, 
    affiliateInfo: { address: affiliateAddresses = [] } = { address: [] }, 
    facultyInfo: { address: facultyAddresses = [] } = { address: [] },
    constituentInfo: { address: constituentAddresses = [] } = { address: [] }
  } = person;

  const employeeAddresses = positions.flatMap((pos: any) => {
    const { positionInfo: { Office = [] } = {} } = pos;
    return Office.flatMap((office: any) => {
      const { isPrimary = false, workAddress } = office;
      if (workAddress) {
        // Push the primary status down to the address level to aid upcoming sorting.
        return { ...workAddress, isPrimary };
      }
      return [];
    });
  });

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
   * Load addresses from a set of addresses into the address list for priority sorting.
   * Store the complete address object, not just the address line.
   * @param addresses 
   * @param source 
   * @returns 
   */
  const loadAddresses = (addresses: any[], source: string) => {
    for (const addr of addresses) {
      const addrLine = getAddressLine(addr);
      if(addrLine) {
        addressList.push({ source, address: addr });
      }
    }
  }

  // Load addresses from different sources
  if(addressTypes.has(AddressType.EMPLOYEE)) {
    loadAddresses(employeeAddresses, 'employeeInfo');
  }
  if(addressTypes.has(AddressType.STUDENT)) {
    loadAddresses(studentAddresses, 'studentInfo');
  }
  if(addressTypes.has(AddressType.AFFILIATE)) {
    loadAddresses(affiliateAddresses, 'affiliateInfo');
  }
  if(addressTypes.has(AddressType.FACULTY)) {
    loadAddresses(facultyAddresses, 'facultyInfo');
  }
  if(addressTypes.has(AddressType.CONSTITUENT)) {
    loadAddresses(constituentAddresses, 'constituentInfo');
  }

  // Get the highest priorit address.
  const priorityAddress = AddressSorter(addressList).highestPriorityAddress;

  return {
    getAddressLine1: () => {
      if (!priorityAddress) {
        return undefined;
      }
      return getAddressLine(priorityAddress);
    },
    
    getCity: () => {
      if (!priorityAddress || !priorityAddress.city) {
        return undefined;
      }
      const city = `${priorityAddress.city}`.trim();
      return city !== '' ? city : undefined;
    },
    
    getStateProvince: () => {
      if (!priorityAddress) {
        return undefined;
      }
      const stateValue = priorityAddress.state;
      if (isEmpty(stateValue)) {
        return undefined;
      }
      const stateKey = `${stateValue}`.trim();
      if(stateKey === '') {
        return undefined;
      }
      const stateObj = stateMappings.forwardMap.get(stateKey);
      if(!stateObj) {
        console.log(`State code ${stateKey} not found in state map`);
        return undefined;
      }
      return { 
        hrn: `hrn:hrs:lists:states/${stateObj.huronCode}`, 
        name: stateObj.huronName 
      };
    },
    
    getCounty: () => {
      if (!priorityAddress || !priorityAddress.county) {
        return undefined;
      }
      const county = `${priorityAddress.county}`.trim();
      return county !== '' ? county : undefined;
    },
    
    getCountry: () => {
      if (!priorityAddress) {
        return undefined;
      }
      if (!priorityAddress) {
        return undefined;
      }
      const countryValue = priorityAddress.country;
      if(isEmpty(countryValue)) {
        return undefined;
      }
      const countryKey = `${countryValue}`.trim();
      if(countryKey === '') {
        return undefined;
      }
      const countryObj = countryMappings.forwardMap.get(countryKey);
      if(!countryObj) {
        console.log(`Country code ${countryKey} not found in country map`);
        return undefined;
      }
      return { 
        hrn: `hrn:hrs:lists:countries/${countryObj.huronCode}`, 
        name: countryObj.huronName 
      };
    },
    
    getPostalCode: () => {
      if (!priorityAddress || !priorityAddress.postalCode) {
        return undefined;
      }
      const postalCode = `${priorityAddress.postalCode}`.trim();
      return postalCode !== '' ? postalCode : undefined;
    }
  }
}