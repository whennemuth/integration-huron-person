import { DataMapper as CoreDataMapper, CrudOperation, Field, FieldDefinition, Input, TestEnvironment } from 'integration-core';
import { isEmpty, removeEmptyValues } from '../Utils';
import { _fieldDefinitions } from './DataMapper';
import { ConfigManager } from '../config/ConfigManager';
import { getPersonData, ReadPerson } from '../data-target/crud/ReadPerson';
import { HuronPerson } from '../data-target/crud/Person';


/**
 * Convert raw person data from target system to Input format (implementing core interface)
 * This does not reverse-map back to source format, but rather converts Huron API response
 * data into the Input/FieldSet structure so it can be hashed and compared with forward-mapped
 * source data.
 * @param rawData Array of person data objects from Huron API endpoint.
 */
export class ReverseDataMapper implements CoreDataMapper {
  private fieldDefinitions: FieldDefinition[] = [..._fieldDefinitions];

  constructor() {}

  public addFieldDefinition(fieldDef: FieldDefinition): ReverseDataMapper {
    const found: FieldDefinition | undefined = this.fieldDefinitions.find(fd => fd.name === fieldDef.name);
    if (!found) {
      this.fieldDefinitions.push(fieldDef);
    }
    return this;
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    
    const fieldSets = rawData.map(person => {
      // Convert Huron person object to FieldSet format, omitting null/undefined values
      const fieldValues: Field[] = [];
      
      if (person && typeof person === 'object') {
        Object.keys(person).forEach(key => {
          if ( ! isEmpty(person[key]) ) {
            if (this.fieldDefinitions.some(fd => fd.name === key) ) {
              fieldValues.push({ [key]: removeEmptyValues(person[key]) });           
            }            
          }
        });
      }
      
      return { fieldValues };
    });

    return {
      fieldDefinitions: this.fieldDefinitions,
      fieldSets
    };
  }
}


async function main() {
  const config = ConfigManager
    .getInstance(true)
    .fromEnvironment()
    .fromFileSystem()
    .getConfig('person');

  const reader = new ReadPerson({ config });

  try {
    const personData: HuronPerson | HuronPerson[] = await getPersonData({ reader });
    console.log('Retrieved Person Data:', JSON.stringify(personData, null, 2));
    const reverseMapper = new ReverseDataMapper();
    const mappedData = reverseMapper.map(Array.isArray(personData) ? personData : [personData]);
    console.log('Mapped Data:', JSON.stringify(mappedData, null, 2));
  } catch (error) {
    console.error('Error retrieving person data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('REVERSE_DATA_MAPPER');

  [
    'HURON_PERSON_HRN',
    'HURON_PERSON_SOURCE_ID'
  ].forEach(testEnvironment.getVarOrEmptyString);

  main();
}