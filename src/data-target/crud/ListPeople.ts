import { Config } from "../../config/Config";
import { ConfigManager } from "../../config/ConfigManager";
import { HuronPerson } from "./Person";
import { ReadPeople, ReadPeopleOptions } from "./ReadPeople";
import { TestEnvironment } from 'integration-core';

/**
 * Class for listing multiple people from the Huron API. Intended for retrieval of large sets
 * of people, including their HRNS and other IDs from which further processing and lookups 
 * can be carried out.
 */
class ListPeople {
  private peopleReader: ReadPeople;

  constructor(private config: Config, private pageSize: number = 100) {
    this.peopleReader = new ReadPeople({ config });
  }

  private getActiveFilter = (active?: boolean) => {
    if (active === undefined) {
      return undefined;
    }
    return ReadPeople.createFilter({ 
      field: 'active', value: String(active), priority: 0, comparisonOperator: 'eq' 
    });
  }

  private listAll = async (fields: string[], active?: boolean): Promise<HuronPerson[]> => {
    const { getActiveFilter, peopleReader, pageSize } = this;
    const activeFilter = getActiveFilter(active);
    const options: ReadPeopleOptions = {
      filters: activeFilter ? [activeFilter] : undefined,
      includeFields: fields,
      pagination: { pageSize }
    };
    return peopleReader.readAllPeople(options);
  }

  public listPrimaryKeys = async (active?: boolean): Promise<HuronPerson[]> => {
    return this.listAll(['hrn'], active);
  }

  public listSourceIdentifiers = async (active?: boolean): Promise<HuronPerson[]> => {
    return this.listAll(['sourceIdentifier'], active);
  }

  public listAllKeys = async (active?: boolean): Promise<HuronPerson[]> => {
    return this.listAll(['hrn', 'id', 'sourceIdentifier'], active);
  }

  public listAllKeysAndNames = async (active?: boolean): Promise<HuronPerson[]> => {
    return this.listAll(['hrn', 'id', 'sourceIdentifier', 'firstName', 'middleName', 'lastName'], active);
  }
}

export { ListPeople };


if (require.main === module) {
  const testEnvironment = TestEnvironment('LIST_PEOPLE');

  [
    'HURON_PEOPLE_LIST_STATUS'
  ].forEach(testEnvironment.getVarOrEmptyString);
  (async () => {
    const { 
      HURON_PEOPLE_LIST_TASK: task, 
      HURON_PEOPLE_LIST_STATUS: status = 'all'
    } = process.env;

    const active = status === 'active' ? true : status === 'inactive' ? false : undefined;

    if(!task) {
      console.error('HURON_PEOPLE_LIST_TASK environment variable is not set. Please set it to one of: pk, keys, keys_and_names');
      process.exit(1);
    }
  
    try {
      const config = ConfigManager
        .getInstance()
        .fromEnvironment()
        .fromFileSystem()
        .getConfig('none');

      let listPeople: ListPeople;
      let people: HuronPerson[];

      switch(task) {
        case 'pk':
          console.log('Listing hrns only...');
          listPeople = new ListPeople(config, 500);
          people = await listPeople.listPrimaryKeys(active); // Example: list active people with primary keys only
          console.log(`Number of people, status = ${status}: ${people.length}`);
          break;
        case 'sid':
          console.log('Listing sourceIdentifiers only...');
          listPeople = new ListPeople(config, 500);
          people = await listPeople.listSourceIdentifiers(active);
          console.log(`Number of people, status = ${status}: ${people.length}`);
          break;
        case 'keys':
          console.log('Listing all keys (hrn, id, sourceIdentifier)...');
          listPeople = new ListPeople(config, 500);
          people = await listPeople.listAllKeys(active); // Example: list active people with all keys
          console.log(`Number of people, status = ${status}: ${people.length}`);
          break;
        case 'keys_and_names':
          console.log('Listing all keys and names (hrn, id, sourceIdentifier, firstName, middleName, lastName)...');
          listPeople = new ListPeople(config, 500);
          people = await listPeople.listAllKeysAndNames(active); // Example: list active people with all keys and names
          console.log(`Number of people, status = ${status}: ${people.length}`);
          break;
        default:
          console.error(`Invalid HURON_PEOPLE_LIST_TASK value: ${task}. Please set it to one of: pk, keys, keys_and_names`);
          process.exit(1);
      }
          
    } catch (error) {
      console.error('Error listing people:', error);
    }
  })();
}