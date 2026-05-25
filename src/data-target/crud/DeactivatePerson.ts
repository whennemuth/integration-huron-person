import { CrudOperation, FieldSet, SinglePushResult } from "integration-core";
import { BasicCache } from "../../Cache";
import { Config } from "../../config/Config";
import { ConfigManager } from "../../config/ConfigManager";
import { getLocalConfig } from "../../Utils";
import { HuronPersonDataTarget } from "../PersonDataTarget";
import { HuronPerson } from "./Person";
import { getPersonData, HuronPersonIdType, ReadPerson } from "./ReadPerson";
import { ReverseDataMapper } from "../../data-mapper/DataMapper";

type PersonToDeactivateParams = {
  config: Config;
  hrn?: string;
  huronPersonIdType?: HuronPersonIdType, 
  id?: string
}

class PersonToDeactivate {
  private cache: BasicCache | undefined;
  private person: HuronPerson | undefined;

  constructor(private params: PersonToDeactivateParams) {
    this.cache = BasicCache.getInstance(params.config);
  }

  private getPerson = async (): Promise<HuronPerson | undefined> => {
    if(this.person) {
      return this.person;
    }
    const { config, huronPersonIdType, id } = this.params;
    const person: HuronPerson | HuronPerson[] = await getPersonData({
      reader: new ReadPerson(config),
      huronPersonIdType,
      id
    });
    const data = Array.isArray(person) ? person.length > 0 : !!person;
    this.person = data ? (Array.isArray(person) ? person[0] : person) : undefined;
    return this.person;
  }

  private getHrn = async (): Promise<string | undefined> => {
    const person = await this.getPerson();
    return person?.hrn;
  }

  public deactivatePerson = async (): Promise<SinglePushResult | undefined> => {
    let { config, huronPersonIdType, id, hrn } = this.params;

    if(!hrn) {
      hrn = await this.getHrn();
      if(!hrn) {
         console.log(`Person with ${huronPersonIdType} ${id} does not exist. No action taken.`);
         return;
      }
    }

    const mapper = new ReverseDataMapper().addFieldDefinition({ 
      name: 'userId', type: 'string' as const, required: false 
    });
    const input = mapper.map([this.person], CrudOperation.DELETE);
    
    const dataTarget = new HuronPersonDataTarget({ config, cache: this.cache, hrn });

    const result: SinglePushResult = await dataTarget.pushOne({
      crud: CrudOperation.DELETE,
      data: input.fieldSets[0]
    });

    return result;
  }
}


const main = async (): Promise<void> => {
  /** Read additional configuration from environment */
  const {
    HURON_PERSON_CONFIG_PATH, 
    SECRET_ARN,
    HURON_PERSON_ID_TYPE,
    CACHE_ENABLED, 
    CACHE_PATH
  } = process.env;

  if(CACHE_ENABLED !== 'true') {
    console.log('CACHE_ENABLED environment variable is not set to "true". You need to cache the access token for bulk operations.');
    return;
  }

  if( ! CACHE_PATH) {
    console.log('CACHE_PATH environment variable is not set. You need to set this to a writable path for caching the access token for bulk operations.');
    return;
  }

  /** Load configuration. */
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = await configManager
    .reset()
    .fromFileSystem(localConfigPath)              // ← Local dev only
    .fromJsonString('HURON_PERSON_CONFIG_JSON')   // ← TaskDef secret injection
    .fromEnvironment()                            // ← Fallback to individual env var overrides
    .fromSecretManager(SECRET_ARN)                // ← Fallback to Secrets Manager
    .getConfigAsync('person');

  const params = { config } as PersonToDeactivateParams;
  if(HURON_PERSON_ID_TYPE) {
    params.huronPersonIdType = HURON_PERSON_ID_TYPE as HuronPersonIdType;
  }

  const personToDeactivate = new PersonToDeactivate(params);
  const result = await personToDeactivate.deactivatePerson();
  if(result) {
    console.log(`Successfully deactivated person. Result: ${JSON.stringify(result, null, 2)}`);
  } else {
    console.log('No result returned from deactivatePerson operation.');
  }
}

if(require.main === module) {
  main();
}

export { PersonToDeactivate };