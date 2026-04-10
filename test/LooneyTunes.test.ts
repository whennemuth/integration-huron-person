import { LooneyTunes, Character } from '../src/miscellaneous/LooneyTunes';

describe('LooneyTunes', () => {
  let looneyTunes: LooneyTunes;

  beforeEach(() => {
    looneyTunes = new LooneyTunes(Character.BugsBunny);
  });

  describe('getRandomCdmPersonData', () => {
    it('should return an array with one person data object', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
    });

    it('should have a randomized personid starting with U and 9 characters total', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      expect(personData.personid).toMatch(/^U\d{8}$/);
    });

    it('should have randomized email addresses using character-specific base', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      if (personData.email && personData.email.length > 0) {
        personData.email.forEach((emailObj: any) => {
          expect(emailObj.address).toMatch(/^bugs\d+@looneytunes\.org$/);
        });
      }
    });

    it('should use character-specific names', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      if (personData.personBasic?.names) {
        const primaryName = personData.personBasic.names.find((n: any) => n.nameType === 'PRI');
        expect(primaryName.firstName).toBe('Bugs');
        expect(primaryName.lastName).toBe('Bunny');
        expect(primaryName.fullName).toBe('Bugs Bunny');
      }
    });

    it('should use character-specific street names and cities', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      if (personData.employeeInfo?.address?.length > 0) {
        personData.employeeInfo.address.forEach((addr: any) => {
          expect(addr.street).toMatch(/^\d+ Rabbit Lane$/);
          expect(addr.city).toBe('Carrotville');
        });
      }
    });

    it('should use character-specific supervisor and department', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      if (personData.employeeInfo?.positions?.length > 0) {
        const position = personData.employeeInfo.positions[0];
        if (position.positionInfo?.Supervisor) {
          expect(position.positionInfo.Supervisor.managerFullName).toBe('Daffy Duck');
        }
        if (position.positionInfo?.Department) {
          expect(position.positionInfo.Department.departmentName).toBe('Animation');
        }
      }
    });

    it('should use character-specific area codes for phones', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      if (personData.phone && personData.phone.length > 0) {
        personData.phone.forEach((phoneObj: any) => {
          expect(phoneObj.number).toMatch(/^212\d{7}$/);
        });
      }
    });

    it('should generate different data for different characters', () => {
      const daffyTunes = new LooneyTunes(Character.DaffyDuck);
      const result = daffyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      if (personData.personBasic?.names) {
        const primaryName = personData.personBasic.names.find((n: any) => n.nameType === 'PRI');
        expect(primaryName.firstName).toBe('Daffy');
        expect(primaryName.lastName).toBe('Duck');
      }
      
      if (personData.email && personData.email.length > 0) {
        personData.email.forEach((emailObj: any) => {
          expect(emailObj.address).toMatch(/^daffy\d+@looneytunes\.org$/);
        });
      }
      
      if (personData.employeeInfo?.address?.length > 0) {
        personData.employeeInfo.address.forEach((addr: any) => {
          expect(addr.street).toMatch(/^\d+ Pond Street$/);
          expect(addr.city).toBe('Duckburg');
        });
      }
    });

    it('should generate Foghorn Leghorn character data', () => {
      const foghornTunes = new LooneyTunes(Character.FoghornLeghorn);
      const result = foghornTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      if (personData.personBasic?.names) {
        const primaryName = personData.personBasic.names.find((n: any) => n.nameType === 'PRI');
        expect(primaryName.firstName).toBe('Foghorn');
        expect(primaryName.lastName).toBe('Leghorn');
      }
      
      if (personData.email && personData.email.length > 0) {
        personData.email.forEach((emailObj: any) => {
          expect(emailObj.address).toMatch(/^foghorn\d+@looneytunes\.org$/);
        });
      }
      
      if (personData.employeeInfo?.address?.length > 0) {
        personData.employeeInfo.address.forEach((addr: any) => {
          expect(addr.street).toMatch(/^\d+ Farm Road$/);
          expect(addr.city).toBe('Roosterville');
        });
      }
    });

    it('should have the expected structure matching the base data', () => {
      const result = looneyTunes.getRandomCdmPersonData();
      const personData = result[0];
      
      // Check that main properties exist
      expect(personData).toHaveProperty('personid');
      expect(personData).toHaveProperty('personBasic');
      expect(personData).toHaveProperty('email');
      expect(personData).toHaveProperty('employeeInfo');
    });
  });
});