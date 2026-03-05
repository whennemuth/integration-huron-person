import { isEmpty } from "../Utils";
import { compareMMDDYYYYDates, isValidDateFormat } from "./DataMapperDateSorter";

export enum AddressType {
  EMPLOYEE = 'employeeInfo',
  STUDENT = 'studentInfo',
  AFFILIATE = 'affiliateInfo',
  FACULTY = 'facultyInfo',
  CONSTITUENT = 'constituentInfo'
}

export type AddressTypePriority = { priority: number; type: string; source?: string; }

export const AddressTypePriorities = [
  { priority: 1, source: AddressType.EMPLOYEE },
  { priority: 2, source: AddressType.STUDENT },
  { priority: 3, source: AddressType.AFFILIATE },
  { priority: 4, source: AddressType.FACULTY },
  { priority: 5, source: AddressType.CONSTITUENT }
] as AddressTypePriority[];

const isValidAddress = (addr: any): boolean => {
  return addr && (isEmpty(addr.line1) === false || isEmpty(addr.street) === false);
}

const compareEffectiveDates = (a:any, b: any): number => {
  return compareMMDDYYYYDates(a, b);
}

/**
 * Comparator function for sorting inactive dates. An address with no inactiveDate is always
 * preferred (it never becomes inactive). When both have inactiveDates, the larger date
 * (further in the future) is preferred as the address stays active longer.
 * @param a 
 * @param b 
 * @returns 
 */
const compareInactiveDates = (a: any, b: any): number => {
  // Validate date formats - treat invalid dates as empty
  const aValid = isValidDateFormat(a);
  const bValid = isValidDateFormat(b);
  
  // Both missing or invalid - equal
  if (!aValid && !bValid) {
    return 0;
  }
  
  // Missing/invalid always wins (no inactive date = stays active forever)
  if (!aValid) {
    return -1; // a (missing) comes first
  }
  
  if (!bValid) {
    return 1; // b (missing) comes first
  }
  
  // Both have valid dates - larger date (further in future) comes first
  // Reverse comparison so larger dates sort first
  return b.localeCompare(a);
};

/**
 * This mapper selects from the available addresses the one that has the highest priority.
 * Priority is determined by multiple factors: 
 *    type (employee, student, affiliate), priority, primary status, effective date, inactive date.
 * @param addresses 
 * @returns 
 */
export const AddressSorter = (addresses: { source: string; address: any }[]): { sortedAddresses: any[]; highestPriorityAddress: any } => {

  // Prune off any invalid addresses.
  addresses = addresses.filter(addr => isValidAddress(addr.address));

  if( addresses.length === 0) {
    return { sortedAddresses: [], highestPriorityAddress: undefined };
  }

  if( addresses.length === 1) {
    return { sortedAddresses: [addresses[0].address], highestPriorityAddress: addresses[0].address };
  }

  const sortedAddresses = addresses.sort((a, b) => {

    // Sort by address type priority
    const aType = AddressTypePriorities.find(at => at.source === a.source);
    const bType = AddressTypePriorities.find(at => at.source === b.source);
    const aPriority = aType ? aType.priority : Number.MAX_VALUE;
    const bPriority = bType ? bType.priority : Number.MAX_VALUE;
    const priorityComparison = aPriority - bPriority;
    if(priorityComparison !== 0) {
      return priorityComparison;
    }

    const { address: { isPrimary: primaryA, effectiveDate: effectiveDateA, inactiveDate: inactiveDateA } = {} } = a
    const { address: { isPrimary: primaryB, effectiveDate: effectiveDateB, inactiveDate: inactiveDateB } = {} } = b

    // What remains are addresses of the same type, so sort by isPrimary flag if present.
    const aPrimary = primaryA ? 1 : 0;
    const bPrimary = primaryB ? 1 : 0;
    const primaryComparison = bPrimary - aPrimary;
    if(primaryComparison !== 0) {
      return primaryComparison;
    }

    // What remains are addresses of the same type and same primary status, so sort by effective date.
    const effectiveDateComparison = compareEffectiveDates(effectiveDateA, effectiveDateB);
    if(effectiveDateComparison !== 0) {
      return effectiveDateComparison;
    }

    // What remains are addresses of the same type, same primary status, and same/similarly missing effective date, so sort by inactive date.
    const inactiveDateComparison = compareInactiveDates(inactiveDateA, inactiveDateB);
    if(inactiveDateComparison !== 0) {
      return inactiveDateComparison;
    }

    // If we get here, the addresses are essentially tied in priority, so maintain original order.
    return 0;
  });

  const mappedAddresses = sortedAddresses.map(addr => addr.address);

  return {
    sortedAddresses: mappedAddresses,
    highestPriorityAddress: mappedAddresses[0]
  }
}