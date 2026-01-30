
export interface CharacterDetails {
  name: string;
  firstName: string;
  lastName: string;
  species: string;
  emailBase: string;
  emailDomain: string;
  streetName: string;
  cityName: string;
  phoneAreaCode: string;
  supervisorName: string;
  departmentName: string;
}

export enum Character {
  /** Bugs Bunny - the wise-cracking rabbit */
  BugsBunny = 'BugsBunny',
  /** Daffy Duck - the temperamental duck */
  DaffyDuck = 'DaffyDuck',
  /** Porky Pig - the stuttering pig */
  PorkyPig = 'PorkyPig',
  /** Elmer Fudd - the hunting human */
  ElmerFudd = 'ElmerFudd',
  /** Tweety Bird - the cute yellow bird */
  TweetyBird = 'TweetyBird',
  /** Sylvester the Cat - the hungry cat */
  SylvesterTheCat = 'SylvesterTheCat',
  /** Yosemite Sam - the short-tempered cowboy */
  YosemiteSam = 'YosemiteSam',
  /** Marvin the Martian - the alien from Mars */
  MarvinTheMartian = 'MarvinTheMartian',
  /** Road Runner - the fast bird */
  RoadRunner = 'RoadRunner',
  /** Wile E. Coyote - the clever coyote */
  WileECoyote = 'WileECoyote',
  /** Foghorn Leghorn - the loud rooster */
  FoghornLeghorn = 'FoghornLeghorn'
}

export const CharacterData: Record<string, CharacterDetails> = {
  [Character.BugsBunny]: {
    name: 'Bugs Bunny',
    firstName: 'Bugs',
    lastName: 'Bunny',
    species: 'rabbit',
    emailBase: 'bugs',
    emailDomain: 'looneytunes.org',
    streetName: 'Rabbit Lane',
    cityName: 'Carrotville',
    phoneAreaCode: '212',
    supervisorName: 'Daffy Duck',
    departmentName: 'Animation'
  },
  [Character.DaffyDuck]: {
    name: 'Daffy Duck',
    firstName: 'Daffy',
    lastName: 'Duck',
    species: 'duck',
    emailBase: 'daffy',
    emailDomain: 'looneytunes.org',
    streetName: 'Pond Street',
    cityName: 'Duckburg',
    phoneAreaCode: '213',
    supervisorName: 'Bugs Bunny',
    departmentName: 'Voice Acting'
  },
  [Character.PorkyPig]: {
    name: 'Porky Pig',
    firstName: 'Porky',
    lastName: 'Pig',
    species: 'pig',
    emailBase: 'porky',
    emailDomain: 'looneytunes.org',
    streetName: 'Mud Road',
    cityName: 'Pigsville',
    phoneAreaCode: '214',
    supervisorName: 'Bugs Bunny',
    departmentName: 'Production'
  },
  [Character.ElmerFudd]: {
    name: 'Elmer Fudd',
    firstName: 'Elmer',
    lastName: 'Fudd',
    species: 'human',
    emailBase: 'elmer',
    emailDomain: 'looneytunes.org',
    streetName: 'Hunting Trail',
    cityName: 'Forestville',
    phoneAreaCode: '215',
    supervisorName: 'Yosemite Sam',
    departmentName: 'Quality Control'
  },
  [Character.TweetyBird]: {
    name: 'Tweety Bird',
    firstName: 'Tweety',
    lastName: 'Bird',
    species: 'bird',
    emailBase: 'tweety',
    emailDomain: 'looneytunes.org',
    streetName: 'Nest Avenue',
    cityName: 'Tweetville',
    phoneAreaCode: '216',
    supervisorName: 'Sylvester the Cat',
    departmentName: 'Special Effects'
  },
  [Character.SylvesterTheCat]: {
    name: 'Sylvester the Cat',
    firstName: 'Sylvester',
    lastName: 'Cat',
    species: 'cat',
    emailBase: 'sylvester',
    emailDomain: 'looneytunes.org',
    streetName: 'Alley Way',
    cityName: 'Catville',
    phoneAreaCode: '217',
    supervisorName: 'Tweety Bird',
    departmentName: 'Sound Design'
  },
  [Character.YosemiteSam]: {
    name: 'Yosemite Sam',
    firstName: 'Yosemite',
    lastName: 'Sam',
    species: 'human',
    emailBase: 'yosemite',
    emailDomain: 'looneytunes.org',
    streetName: 'Saloon Street',
    cityName: 'Tombstone',
    phoneAreaCode: '218',
    supervisorName: 'Bugs Bunny',
    departmentName: 'Management'
  },
  [Character.MarvinTheMartian]: {
    name: 'Marvin the Martian',
    firstName: 'Marvin',
    lastName: 'Martian',
    species: 'martian',
    emailBase: 'marvin',
    emailDomain: 'mars.org',
    streetName: 'Crater Road',
    cityName: 'Mars City',
    phoneAreaCode: '219',
    supervisorName: 'Daffy Duck',
    departmentName: 'Research'
  },
  [Character.RoadRunner]: {
    name: 'Road Runner',
    firstName: 'Road',
    lastName: 'Runner',
    species: 'bird',
    emailBase: 'roadrunner',
    emailDomain: 'looneytunes.org',
    streetName: 'Desert Highway',
    cityName: 'Desertville',
    phoneAreaCode: '220',
    supervisorName: 'Wile E. Coyote',
    departmentName: 'Stunts'
  },
  [Character.WileECoyote]: {
    name: 'Wile E. Coyote',
    firstName: 'Wile',
    lastName: 'Coyote',
    species: 'coyote',
    emailBase: 'wile',
    emailDomain: 'looneytunes.org',
    streetName: 'Canyon Trail',
    cityName: 'Coyoteville',
    phoneAreaCode: '221',
    supervisorName: 'Road Runner',
    departmentName: 'Engineering'
  },
  [Character.FoghornLeghorn]: {
    name: 'Foghorn Leghorn',
    firstName: 'Foghorn',
    lastName: 'Leghorn',
    species: 'rooster',
    emailBase: 'foghorn',
    emailDomain: 'looneytunes.org',
    streetName: 'Farm Road',
    cityName: 'Roosterville',
    phoneAreaCode: '222',
    supervisorName: 'Bugs Bunny',
    departmentName: 'Operations'
  }
};

/**
 * This is a test class representing Looney Tunes characters.
 * Use it to create Boston University CDM output for invented employees, students, affiliates, etc.
 * where the invented person is a Looney Tunes character. 
 */
export class LooneyTunes {
  /**
   * Creates a new LooneyTunes instance for generating character-specific test data
   * @param character The Looney Tunes character to generate data for
   */
  constructor(private character: Character) { }

  public getRandomCdmPersonData(): any[] {
    // Get character details
    const charDetails = CharacterData[this.character];
    if (!charDetails) {
      throw new Error(`Character ${this.character} not found in character data`);
    }

    // Load the base data from bugs.json
    const baseData = require('./data-mapper/source/bugs.json');

    // Create a deep copy to avoid modifying the original
    const randomData = JSON.parse(JSON.stringify(baseData));

    // Randomize personid: "U" + 8 random digits
    const randomId = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    randomData.personid = `U${randomId}`;

    // Update names based on character
    if (randomData.personBasic && randomData.personBasic.names && Array.isArray(randomData.personBasic.names)) {
      randomData.personBasic.names.forEach((nameObj: any) => {
        if (nameObj.nameType === 'PRI') {
          nameObj.firstName = charDetails.firstName;
          nameObj.lastName = charDetails.lastName;
          nameObj.fullName = `${charDetails.firstName} ${charDetails.lastName}`;
          nameObj.displayName = charDetails.name;
        }
      });
    }

    // Randomize email addresses using character-specific base
    if (randomData.email && Array.isArray(randomData.email)) {
      randomData.email.forEach((emailObj: any) => {
        if (emailObj.address) {
          const randomNum = Math.floor(Math.random() * 1000);
          // Use character-specific email base
          emailObj.address = `${charDetails.emailBase}${randomNum}@${charDetails.emailDomain}`;
        }
      });
    }

    // Update street address with character-specific street name
    if (randomData.employeeInfo && randomData.employeeInfo.address && Array.isArray(randomData.employeeInfo.address)) {
      randomData.employeeInfo.address.forEach((addr: any) => {
        if (addr.street) {
          // Replace the house number and street name
          const randomHouseNum = Math.floor(Math.random() * 9999) + 1;
          addr.street = `${randomHouseNum} ${charDetails.streetName}`;
          addr.city = charDetails.cityName;
        }
      });
    }

    // Update office address with character-specific details
    if (randomData.employeeInfo && randomData.employeeInfo.positions && Array.isArray(randomData.employeeInfo.positions)) {
      randomData.employeeInfo.positions.forEach((pos: any) => {
        if (pos.positionInfo && pos.positionInfo.Office && Array.isArray(pos.positionInfo.Office)) {
          pos.positionInfo.Office.forEach((office: any) => {
            if (office.workAddress && office.workAddress.street) {
              const randomHouseNum = Math.floor(Math.random() * 9999) + 1;
              office.workAddress.street = `${randomHouseNum} ${charDetails.streetName}`;
              office.workAddress.city = charDetails.cityName;
            }
          });
        }
        // Update supervisor name
        if (pos.positionInfo && pos.positionInfo.Supervisor) {
          pos.positionInfo.Supervisor.managerFullName = charDetails.supervisorName;
          // Split supervisor name for first/last
          const [first, ...lastParts] = charDetails.supervisorName.split(' ');
          pos.positionInfo.Supervisor.managerFirstName = first;
          pos.positionInfo.Supervisor.managerLastName = lastParts.join(' ');
        }
        // Update department name
        if (pos.positionInfo && pos.positionInfo.Department) {
          pos.positionInfo.Department.departmentName = charDetails.departmentName;
        }
      });
    }

    // Randomize personnel number
    if (randomData.employeeInfo && randomData.employeeInfo.positions && Array.isArray(randomData.employeeInfo.positions)) {
      randomData.employeeInfo.positions.forEach((pos: any) => {
        if (pos.positionInfo && pos.positionInfo.BasicData && pos.positionInfo.BasicData.personnelNumber) {
          const randomPersonnelNum = Math.floor(Math.random() * 10000000).toString().padStart(8, '0');
          pos.positionInfo.BasicData.personnelNumber = randomPersonnelNum;
        }
      });
    }

    // Randomize phone numbers using character-specific area code
    const randomizePhone = (phone: string) => {
      if (phone.length >= 10) {
        const randomNum = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
        return `${charDetails.phoneAreaCode}${randomNum}`;
      }
      return phone;
    };

    if (randomData.phone && Array.isArray(randomData.phone)) {
      randomData.phone.forEach((phoneObj: any) => {
        if (phoneObj.number) {
          phoneObj.number = randomizePhone(phoneObj.number);
        }
      });
    }

    // Randomize emergency contact phone
    if (randomData.personDetails && randomData.personDetails.emergencyContact && Array.isArray(randomData.personDetails.emergencyContact)) {
      randomData.personDetails.emergencyContact.forEach((contact: any) => {
        if (contact.phone && contact.phone.number) {
          contact.phone.number = randomizePhone(contact.phone.number);
        }
      });
    }

    // Randomize work phone
    if (randomData.employeeInfo && randomData.employeeInfo.positions && Array.isArray(randomData.employeeInfo.positions)) {
      randomData.employeeInfo.positions.forEach((pos: any) => {
        if (pos.positionInfo && pos.positionInfo.Office && Array.isArray(pos.positionInfo.Office)) {
          pos.positionInfo.Office.forEach((office: any) => {
            if (office.workPhone && office.workPhone.number) {
              office.workPhone.number = randomizePhone(office.workPhone.number);
            }
          });
        }
      });
    }

    return [randomData];
  }
}


if(require.main === module) {
  const character: Character = Character.FoghornLeghorn;
  const looney = new LooneyTunes(character);
  const personData = looney.getRandomCdmPersonData();
  console.log(JSON.stringify(personData, null, 2));
}
