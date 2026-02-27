import { isEmpty } from "../Utils";

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

/**
 * Validate if a date string is in valid YYYYMMDD format
 * @param dateStr 
 * @returns 
 */
const isValidDateFormat = (dateStr: any): boolean => {
  if (isEmpty(dateStr)) {
    return false;
  }
  
  // Check if it matches YYYYMMDD pattern (8 digits)
  const dateString = String(dateStr);
  if (!/^\d{8}$/.test(dateString)) {
    return false;
  }
  
  // Try to parse and validate it's a real date
  try {
    const year = parseInt(dateString.substring(0, 4), 10);
    const month = parseInt(dateString.substring(4, 6), 10);
    const day = parseInt(dateString.substring(6, 8), 10);
    
    // Basic validation
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return false;
    }
    
    // Create date and verify it's valid
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && 
           date.getMonth() === month - 1 && 
           date.getDate() === day;
  } catch (error) {
    return false;
  }
};

/**
 * Comparator function for sorting effective dates. These dates are expected to be string values for
 * a "YYYYMMDD" formatted date. We favor addresses with effective dates furthest into the future the 
 * least, so that if there are multiple addresses of the same type, the one with the smallest 
 * effectiveDate gets sorted to the top. If effectiveDate is missing, favor it over any effectiveDate
 * that is in the future, else favor the effectiveDate if it is in the past.
 * @param a 
 * @param b 
 * @returns 
 */
const compareEffectiveDates = (a:any, b: any): number => {
  
  // Validate date formats - treat invalid dates as empty
  const aValid = isValidDateFormat(a);
  const bValid = isValidDateFormat(b);
  
  // Get today's date in YYYYMMDD format
  const today = new Date();
  const todayStr = today.getFullYear().toString() +
                  (today.getMonth() + 1).toString().padStart(2, '0') +
                   today.getDate().toString().padStart(2, '0');
  
  // Both missing or invalid - equal
  if (!aValid && !bValid) {
    return 0;
  }
  
  // Handle missing or invalid dates
  if (!aValid) {
    // a is missing/invalid, b has valid date
    // Missing date beats future dates, loses to past dates
    return b > todayStr ? -1 : 1;
  }
  
  if (!bValid) {
    // b is missing/invalid, a has valid date
    // Missing date beats future dates, loses to past dates
    return a > todayStr ? 1 : -1;
  }
  
  // Both have dates - determine if they're past or future
  const aIsFuture = a > todayStr;
  const bIsFuture = b > todayStr;
  
  // If one is future and one is past, past date comes first
  if (aIsFuture && !bIsFuture) {
    return 1; // b (past) comes first
  }
  if (!aIsFuture && bIsFuture) {
    return -1; // a (past) comes first
  }
  
  // Both are past or both are future
  if (!aIsFuture && !bIsFuture) {
    // Both past - more recent (larger date) comes first
    return b.localeCompare(a);
  } else {
    // Both future - closer to today (smaller date) comes first
    return a.localeCompare(b);
  }
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