import { isEmpty } from "../Utils";

/**
 * Validate if a date string is in valid YYYYMMDD format
 * @param dateStr 
 * @returns 
 */
export const isValidDateFormat = (dateStr: any): boolean => {
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
export const compareMMDDYYYYDates = (a:any, b: any): number => {
  
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


if (require.main === module) {
  // Example usage:
  const dates = ['20240101', '20231231', '20231130', 'invalid', '', null, '20240201'];
  const sortedDates = dates.sort(compareMMDDYYYYDates);
  console.log(sortedDates);
}