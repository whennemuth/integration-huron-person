import { AddressSorter } from '../../src/data-mapper/DataMapperAddressSorter';

describe('AddressSorter', () => {
  
  // Helper to get date strings in YYYYMMDD format
  const getTodayStr = () => {
    const today = new Date();
    return today.getFullYear().toString() +
           (today.getMonth() + 1).toString().padStart(2, '0') +
           today.getDate().toString().padStart(2, '0');
  };

  const getPastDate = (daysAgo: number = 10) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.getFullYear().toString() +
           (date.getMonth() + 1).toString().padStart(2, '0') +
           date.getDate().toString().padStart(2, '0');
  };

  const getFutureDate = (daysFromNow: number = 10) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.getFullYear().toString() +
           (date.getMonth() + 1).toString().padStart(2, '0') +
           date.getDate().toString().padStart(2, '0');
  };

  describe('Empty and Invalid Addresses', () => {
    it('should return empty array when no addresses provided', () => {
      const result = AddressSorter([]);
      expect(result.sortedAddresses).toEqual([]);
      expect(result.highestPriorityAddress).toBeUndefined();
    });

    it('should filter out invalid addresses (no street or line1)', () => {
      const addresses = [
        { source: 'employeeInfo', address: { city: 'Boston', state: 'MA' } },
        { source: 'studentInfo', address: { postalCode: '02115' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.sortedAddresses).toEqual([]);
      expect(result.highestPriorityAddress).toBeUndefined();
    });

    it('should keep valid addresses and filter invalid ones', () => {
      const addresses = [
        { source: 'employeeInfo', address: { city: 'Boston' } }, // invalid
        { source: 'studentInfo', address: { street: '123 Main St' } }, // valid
        { source: 'affiliateInfo', address: { state: 'MA' } } // invalid
      ];
      const result = AddressSorter(addresses);
      expect(result.sortedAddresses).toHaveLength(1);
      expect(result.sortedAddresses[0].street).toBe('123 Main St');
    });

    it('should return single address when only one valid address exists', () => {
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 Main St' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.sortedAddresses).toEqual([{ street: '123 Main St' }]);
      expect(result.highestPriorityAddress).toEqual({ street: '123 Main St' });
    });
  });

  describe('Address Type Priority', () => {
    it('should prioritize employeeInfo (priority 1) over studentInfo (priority 2)', () => {
      const addresses = [
        { source: 'studentInfo', address: { street: '456 College Ave' } },
        { source: 'employeeInfo', address: { street: '123 Work St' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('123 Work St');
    });

    it('should prioritize studentInfo (priority 2) over affiliateInfo (priority 3)', () => {
      const addresses = [
        { source: 'affiliateInfo', address: { street: '789 Affiliate Rd' } },
        { source: 'studentInfo', address: { street: '456 College Ave' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 College Ave');
    });

    it('should prioritize employeeInfo over all other types', () => {
      const addresses = [
        { source: 'affiliateInfo', address: { street: '789 Affiliate Rd' } },
        { source: 'studentInfo', address: { street: '456 College Ave' } },
        { source: 'employeeInfo', address: { street: '123 Work St' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('123 Work St');
      expect(result.sortedAddresses[0].street).toBe('123 Work St');
      expect(result.sortedAddresses[1].street).toBe('456 College Ave');
      expect(result.sortedAddresses[2].street).toBe('789 Affiliate Rd');
    });

    it('should handle unknown source types with lowest priority', () => {
      const addresses = [
        { source: 'unknownSource', address: { street: '999 Unknown St' } },
        { source: 'affiliateInfo', address: { street: '789 Affiliate Rd' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('789 Affiliate Rd');
    });
  });

  describe('isPrimary Flag Sorting', () => {
    it('should prioritize primary address over non-primary of same type', () => {
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 Work St', isPrimary: false } },
        { source: 'employeeInfo', address: { street: '456 Primary Work St', isPrimary: true } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Primary Work St');
    });

    it('should prioritize primary over undefined isPrimary', () => {
      const addresses = [
        { source: 'studentInfo', address: { street: '123 College Ave' } },
        { source: 'studentInfo', address: { street: '456 Primary College Ave', isPrimary: true } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Primary College Ave');
    });

    it('should treat false and undefined isPrimary equally', () => {
      const addresses = [
        { source: 'affiliateInfo', address: { street: '123 Affiliate Rd', isPrimary: false } },
        { source: 'affiliateInfo', address: { street: '456 Affiliate Rd' } }
      ];
      const result = AddressSorter(addresses);
      // Both should be treated equally, first one wins (stable sort)
      expect(result.highestPriorityAddress.street).toBe('123 Affiliate Rd');
    });

    it('should not override type priority with isPrimary', () => {
      const addresses = [
        { source: 'studentInfo', address: { street: '456 Primary Student St', isPrimary: true } },
        { source: 'employeeInfo', address: { street: '123 Work St', isPrimary: false } }
      ];
      const result = AddressSorter(addresses);
      // employeeInfo type priority wins over isPrimary
      expect(result.highestPriorityAddress.street).toBe('123 Work St');
    });
  });

  describe('effectiveDate Sorting', () => {
    it('should prioritize past date over missing effectiveDate', () => {
      const pastDate = getPastDate(10);
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 No Date St' } },
        { source: 'employeeInfo', address: { street: '456 Past Date St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Past Date St');
    });

    it('should prioritize missing effectiveDate over future date', () => {
      const futureDate = getFutureDate(10);
      const addresses = [
        { source: 'studentInfo', address: { street: '123 Future Date St', effectiveDate: futureDate } },
        { source: 'studentInfo', address: { street: '456 No Date St' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 No Date St');
    });

    it('should prioritize past date over future date', () => {
      const pastDate = getPastDate(10);
      const futureDate = getFutureDate(10);
      const addresses = [
        { source: 'affiliateInfo', address: { street: '123 Future St', effectiveDate: futureDate } },
        { source: 'affiliateInfo', address: { street: '456 Past St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Past St');
    });

    it('should prioritize more recent past date over older past date', () => {
      const recentPast = getPastDate(5);
      const olderPast = getPastDate(20);
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 Older St', effectiveDate: olderPast } },
        { source: 'employeeInfo', address: { street: '456 Recent St', effectiveDate: recentPast } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Recent St');
    });

    it('should prioritize closer future date over farther future date', () => {
      const nearFuture = getFutureDate(5);
      const farFuture = getFutureDate(20);
      const addresses = [
        { source: 'studentInfo', address: { street: '123 Far Future St', effectiveDate: farFuture } },
        { source: 'studentInfo', address: { street: '456 Near Future St', effectiveDate: nearFuture } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Near Future St');
    });

    it('should treat two missing effectiveDates as equal', () => {
      const addresses = [
        { source: 'affiliateInfo', address: { street: '123 No Date St' } },
        { source: 'affiliateInfo', address: { street: '456 Also No Date St' } }
      ];
      const result = AddressSorter(addresses);
      // Should maintain original order (stable sort)
      expect(result.highestPriorityAddress.street).toBe('123 No Date St');
    });
  });

  describe('inactiveDate Sorting', () => {
    it('should use inactiveDate as tiebreaker when effectiveDates are equal', () => {
      const effectiveDate = getPastDate(30);
      const recentInactive = getPastDate(5);
      const olderInactive = getPastDate(20);
      const addresses = [
        { 
          source: 'employeeInfo', 
          address: { 
            street: '123 Older Inactive St', 
            effectiveDate,
            inactiveDate: olderInactive 
          } 
        },
        { 
          source: 'employeeInfo', 
          address: { 
            street: '456 Recent Inactive St', 
            effectiveDate,
            inactiveDate: recentInactive 
          } 
        }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Recent Inactive St');
    });

    it('should prioritize missing inactiveDate over past inactiveDate', () => {
      const effectiveDate = getPastDate(30);
      const inactiveDate = getPastDate(10);
      const addresses = [
        { source: 'studentInfo', address: { street: '123 No Inactive St', effectiveDate } },
        { source: 'studentInfo', address: { street: '456 Has Inactive St', effectiveDate, inactiveDate } }
      ];
      const result = AddressSorter(addresses);
      // Missing inactiveDate means address never becomes inactive - should win
      expect(result.highestPriorityAddress.street).toBe('123 No Inactive St');
    });

    it('should prioritize missing inactiveDate over future inactiveDate', () => {
      const effectiveDate = getPastDate(30);
      const futureInactive = getFutureDate(10);
      const addresses = [
        { source: 'affiliateInfo', address: { street: '123 Future Inactive St', effectiveDate, inactiveDate: futureInactive } },
        { source: 'affiliateInfo', address: { street: '456 No Inactive St', effectiveDate } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 No Inactive St');
    });

    it('should prioritize larger (later) inactiveDate over smaller (earlier) inactiveDate', () => {
      const effectiveDate = getPastDate(30);
      const earlierInactive = getFutureDate(10);
      const laterInactive = getFutureDate(30);
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 Earlier Inactive St', effectiveDate, inactiveDate: earlierInactive } },
        { source: 'employeeInfo', address: { street: '456 Later Inactive St', effectiveDate, inactiveDate: laterInactive } }
      ];
      const result = AddressSorter(addresses);
      // Larger date (stays active longer) should win
      expect(result.highestPriorityAddress.street).toBe('456 Later Inactive St');
    });
  });

  describe('Complex Sorting Scenarios', () => {
    it('should sort by type first, then isPrimary, then effectiveDate', () => {
      const recentPast = getPastDate(5);
      const olderPast = getPastDate(20);
      const addresses = [
        { 
          source: 'studentInfo', 
          address: { street: '111 Student Primary Recent', isPrimary: true, effectiveDate: recentPast } 
        },
        { 
          source: 'employeeInfo', 
          address: { street: '222 Employee Non-Primary Old', isPrimary: false, effectiveDate: olderPast } 
        },
        { 
          source: 'employeeInfo', 
          address: { street: '333 Employee Primary Recent', isPrimary: true, effectiveDate: recentPast } 
        },
        { 
          source: 'studentInfo', 
          address: { street: '444 Student Non-Primary Recent', isPrimary: false, effectiveDate: recentPast } 
        }
      ];
      const result = AddressSorter(addresses);
      expect(result.sortedAddresses[0].street).toBe('333 Employee Primary Recent');
      expect(result.sortedAddresses[1].street).toBe('222 Employee Non-Primary Old');
      expect(result.sortedAddresses[2].street).toBe('111 Student Primary Recent');
      expect(result.sortedAddresses[3].street).toBe('444 Student Non-Primary Recent');
    });

    it('should handle all sorting criteria together with inactiveDate', () => {
      const effectiveDate = getPastDate(30);
      const recentInactive = getPastDate(5);
      const olderInactive = getPastDate(20);
      const addresses = [
        { 
          source: 'employeeInfo', 
          address: { 
            street: '111 Employee Primary Recent Inactive', 
            isPrimary: true, 
            effectiveDate,
            inactiveDate: recentInactive 
          } 
        },
        { 
          source: 'employeeInfo', 
          address: { 
            street: '222 Employee Primary Older Inactive', 
            isPrimary: true, 
            effectiveDate,
            inactiveDate: olderInactive 
          } 
        },
        { 
          source: 'employeeInfo', 
          address: { 
            street: '333 Employee Non-Primary Recent Inactive', 
            isPrimary: false, 
            effectiveDate,
            inactiveDate: recentInactive 
          } 
        }
      ];
      const result = AddressSorter(addresses);
      expect(result.sortedAddresses[0].street).toBe('111 Employee Primary Recent Inactive');
      expect(result.sortedAddresses[1].street).toBe('222 Employee Primary Older Inactive');
      expect(result.sortedAddresses[2].street).toBe('333 Employee Non-Primary Recent Inactive');
    });

    it('should handle mix of all date scenarios', () => {
      const pastDate = getPastDate(10);
      const futureDate = getFutureDate(10);
      const addresses = [
        { source: 'employeeInfo', address: { street: '111 Future', effectiveDate: futureDate } },
        { source: 'employeeInfo', address: { street: '222 No Date' } },
        { source: 'employeeInfo', address: { street: '333 Past', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      // Past should be first, missing second, future last
      expect(result.sortedAddresses[0].street).toBe('333 Past');
      expect(result.sortedAddresses[1].street).toBe('222 No Date');
      expect(result.sortedAddresses[2].street).toBe('111 Future');
    });

    it('should maintain stable sort when all criteria are equal', () => {
      const addresses = [
        { source: 'studentInfo', address: { street: '111 First' } },
        { source: 'studentInfo', address: { street: '222 Second' } },
        { source: 'studentInfo', address: { street: '333 Third' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.sortedAddresses[0].street).toBe('111 First');
      expect(result.sortedAddresses[1].street).toBe('222 Second');
      expect(result.sortedAddresses[2].street).toBe('333 Third');
    });
  });

  describe('Edge Cases', () => {
    it('should handle addresses with only line1 (no street)', () => {
      const addresses = [
        { source: 'employeeInfo', address: { line1: '123 Main St' } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.line1).toBe('123 Main St');
    });

    it('should handle empty string effectiveDate', () => {
      const pastDate = getPastDate(10);
      const addresses = [
        { source: 'studentInfo', address: { street: '123 Empty Date St', effectiveDate: '' } },
        { source: 'studentInfo', address: { street: '456 Past Date St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      // Empty string should be treated as missing
      expect(result.highestPriorityAddress.street).toBe('456 Past Date St');
    });

    it('should handle whitespace-only street fields', () => {
      const addresses = [
        { source: 'employeeInfo', address: { street: '   ', line1: '123 Main St' } }
      ];
      const result = AddressSorter(addresses);
      // Should still be valid because line1 exists
      expect(result.highestPriorityAddress.line1).toBe('123 Main St');
    });

    it('should handle addresses with both street and line1', () => {
      const addresses = [
        { source: 'affiliateInfo', address: { street: '123 Street Value', line1: '456 Line1 Value' } }
      ];
      const result = AddressSorter(addresses);
      // Should include the address with both fields
      expect(result.highestPriorityAddress.street).toBe('123 Street Value');
      expect(result.highestPriorityAddress.line1).toBe('456 Line1 Value');
    });

    it('should handle today as effectiveDate', () => {
      const today = getTodayStr();
      const pastDate = getPastDate(10);
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 Today St', effectiveDate: today } },
        { source: 'employeeInfo', address: { street: '456 Past St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      // Today should be treated as past (≤ today), and being more recent, should win
      expect(result.highestPriorityAddress.street).toBe('123 Today St');
    });

    it('should handle large list of addresses efficiently', () => {
      const addresses = [];
      for (let i = 0; i < 100; i++) {
        addresses.push({
          source: i % 3 === 0 ? 'employeeInfo' : i % 3 === 1 ? 'studentInfo' : 'affiliateInfo',
          address: { 
            street: `${i} Street`,
            isPrimary: i % 5 === 0,
            effectiveDate: i % 2 === 0 ? getPastDate(i) : getFutureDate(i)
          }
        });
      }
      const result = AddressSorter(addresses);
      expect(result.sortedAddresses).toHaveLength(100);
      expect(result.highestPriorityAddress).toBeDefined();
      // First should be employeeInfo type
      expect(result.sortedAddresses[0].street).toMatch(/^(0|3|6|9|12|15|18|21|24|27|30|33|36|39|42|45|48|51|54|57|60|63|66|69|72|75|78|81|84|87|90|93|96|99) Street$/);
    });
  });

  describe('Date Format Validation', () => {
    it('should treat invalid date format (not 8 digits) as missing', () => {
      const pastDate = getPastDate(10);
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 Invalid Date St', effectiveDate: '2024-01-15' } }, // ISO format
        { source: 'employeeInfo', address: { street: '456 Valid Date St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      // Invalid format should be treated as missing, valid past date should win
      expect(result.highestPriorityAddress.street).toBe('456 Valid Date St');
    });

    it('should treat date with non-numeric characters as missing', () => {
      const futureDate = getFutureDate(10);
      const addresses = [
        { source: 'studentInfo', address: { street: '123 Bad Date St', effectiveDate: '202402XX' } },
        { source: 'studentInfo', address: { street: '456 Future Date St', effectiveDate: futureDate } }
      ];
      const result = AddressSorter(addresses);
      // Bad format treated as missing, missing beats future, so bad format should win
      expect(result.highestPriorityAddress.street).toBe('123 Bad Date St');
    });

    it('should treat invalid date value (13th month) as missing', () => {
      const pastDate = getPastDate(10);
      const addresses = [
        { source: 'affiliateInfo', address: { street: '123 Invalid Month St', effectiveDate: '20241301' } }, // Month 13
        { source: 'affiliateInfo', address: { street: '456 Valid Date St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      // Invalid month treated as missing, valid past date should win
      expect(result.highestPriorityAddress.street).toBe('456 Valid Date St');
    });

    it('should treat invalid date value (32nd day) as missing', () => {
      const futureDate = getFutureDate(10);
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 Invalid Day St', effectiveDate: '20240132' } }, // Day 32
        { source: 'employeeInfo', address: { street: '456 Future Date St', effectiveDate: futureDate } }
      ];
      const result = AddressSorter(addresses);
      // Invalid day treated as missing, missing beats future
      expect(result.highestPriorityAddress.street).toBe('123 Invalid Day St');
    });

    it('should treat date with wrong length (too short) as missing', () => {
      const pastDate = getPastDate(10);
      const addresses = [
        { source: 'studentInfo', address: { street: '123 Short Date St', effectiveDate: '2024' } }, // Only 4 digits
        { source: 'studentInfo', address: { street: '456 Valid Date St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Valid Date St');
    });

    it('should treat date with wrong length (too long) as missing', () => {
      const pastDate = getPastDate(10);
      const addresses = [
        { source: 'affiliateInfo', address: { street: '123 Long Date St', effectiveDate: '202402151234' } }, // Too many digits
        { source: 'affiliateInfo', address: { street: '456 Valid Date St', effectiveDate: pastDate } }
      ];
      const result = AddressSorter(addresses);
      expect(result.highestPriorityAddress.street).toBe('456 Valid Date St');
    });

    it('should handle both dates being invalid format', () => {
      const addresses = [
        { source: 'employeeInfo', address: { street: '123 First Invalid St', effectiveDate: 'INVALID1' } },
        { source: 'employeeInfo', address: { street: '456 Second Invalid St', effectiveDate: '99999999' } } // Invalid date
      ];
      const result = AddressSorter(addresses);
      // Both invalid, should maintain stable sort (first comes first)
      expect(result.highestPriorityAddress.street).toBe('123 First Invalid St');
    });

    it('should handle null or undefined dates alongside invalid format dates', () => {
      const addresses = [
        { source: 'studentInfo', address: { street: '123 Null Date St', effectiveDate: null } },
        { source: 'studentInfo', address: { street: '456 Invalid Format St', effectiveDate: 'NOT-A-DATE' } },
        { source: 'studentInfo', address: { street: '789 Undefined Date St', effectiveDate: undefined } }
      ];
      const result = AddressSorter(addresses);
      // All treated as missing, stable sort should keep first
      expect(result.highestPriorityAddress.street).toBe('123 Null Date St');
    });
  });
});
