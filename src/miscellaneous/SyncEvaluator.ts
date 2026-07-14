import { FieldSet, Input, InputParser, TestEnvironment } from 'integration-core';
import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { DataMapper, getDataMapper, ReverseDataMapper } from "../data-mapper/DataMapper";
import { CountryRow } from "../data-mapper/DataMapperCountry";
import { StateRow } from "../data-mapper/DataMapperState";
import { FieldFilter } from "../data-mapper/FieldFilter";
import { BuCdmPersonDataSource } from "../data-source/PersonDataSource";
import { HuronPerson } from "../data-target/crud/Person";
import { ReadPerson } from "../data-target/crud/ReadPerson";
import { getLocalConfig, isABuid } from '../Utils';

export type SourcePersonParms = {
  config: Config,
  buid?: string,
  cdmPerson?: any,
  sourceDataMapper: DataMapper
}

export type TargetPersonParms = {
  config: Config,
  buid?: string,
  hrn?: string,
  huronPerson?: HuronPerson,
  targetDataMapper: ReverseDataMapper
}

/**
 * Evaluates whether a source person and a target person are in sync based on their respective 
 * data inputs. The raw data for a single person is obtained from the source API, and the raw
 * data for that same person is obtained from the target API, and both are converted into the
 * hashable Input format, hashed, and if the hashes are equal, the source and target are 
 * considered in sync.
 */
export class SourcePerson {
  private sourceInput: Input | undefined;
  private targetInput: Input | undefined;

  constructor(private sourcePersonParms: SourcePersonParms) {}

  public isInSyncWith = async (targetPersonParms: TargetPersonParms): Promise<boolean> => {
    const { sourcePersonParms, getInputFromSource, getInputFromTarget } = this;
    const noResult = (input: Input | undefined) => !input || !input.fieldSets || input.fieldSets.length === 0;

    await getInputFromSource(sourcePersonParms);

    await getInputFromTarget(targetPersonParms);

    if (noResult(this.sourceInput) && noResult(this.targetInput)) {
      console.log('No data found in either source or target, considered in sync');
      return false;
    }

    if (noResult(this.sourceInput)) {
      console.log(`No data found in source, attempting to use target data for lookup`);
      const sid = this.targetInput?.fieldSets[0].fieldValues.find(fv => fv.name === 'sourceIdentifier')?.value
      const id = this.targetInput?.fieldSets[0].fieldValues.find(fv => fv.name === 'id')?.value
      const eid = this.targetInput?.fieldSets[0].fieldValues.find(fv => fv.name === 'employeeId')?.value
      let buid: string | undefined = undefined;
      for (const identifier of [sid, id, eid]) {
        if (identifier) {
          const candidate = identifier.toString();
          if (isABuid(candidate)) {
            buid = candidate;
            break;
          }
        }
      }
      if (!buid) {
        console.warn('No valid BUID identified in target person data, cannot perform source lookup');
        return false;
      }
      if ( sourcePersonParms.buid === buid) {
        console.warn(`BUID ${buid} extracted from target data matches BUID in source parameters, but no source data was found.`);
        return false;
      }
      console.log(`Extracted BUID ${buid} from target data, attempting to fetch source data using BUID`);
      this.sourceInput = await this.getInputFromSource({ ...sourcePersonParms, buid });
      if( noResult(this.sourceInput)) {
        console.warn(`No source data found for BUID ${buid} extracted from target data`);
        return false;
      }
    }
    else if (noResult(this.targetInput)) {
      console.log(`No data found in target, attempting to use source data for lookup`);
      let buid = sourcePersonParms.buid ?? sourcePersonParms?.cdmPerson?.buid;
      if (!buid) {
        buid = this.sourceInput?.fieldSets[0].fieldValues.find(fv => fv.name === 'personid')?.value;
      }
      if (!buid) {
        console.warn('No valid BUID identified in source data, cannot perform target lookup');
        return false;
      }
      if (targetPersonParms.buid === buid) {
        console.warn(`BUID ${buid} extracted from source data matches BUID in target parameters, but no target data was found.`);
        return false;
      }
      console.log(`Extracted BUID ${buid} from source data, attempting to fetch target data using BUID`);
      this.targetInput = await this.getInputFromTarget({ ...targetPersonParms, buid });
      if(noResult(this.targetInput)) {
        console.warn(`No target data found for BUID ${buid} extracted from source data`);
        return false;
      }
    }

    const sourceHash = this.sourceInput?.fieldSets[0].hash;
    const targetHash = this.targetInput?.fieldSets[0].hash;

    return sourceHash === targetHash;
  }

  
  private getFilteredFields = (fieldSet: FieldSet): FieldSet => {
    const { sourcePersonParms: { sourceDataMapper: { 
      stateMappings = { forwardMap: new Map<string, StateRow>(), reverseMap: new Map<string, string>() },
      countryMappings = { forwardMap: new Map<string, CountryRow>(), reverseMap: new Map<string, string>() },
      orgMappings = { forwardMap: new Map<string, string>(), reverseMap: new Map<string, string>() } 
    } = {} } } = this;    
    return new FieldFilter({ fieldSet, stateMappings, countryMappings, orgMappings }).filter();
  }

  public getInputFromSource = async (sourcePersonParms: SourcePersonParms): Promise<Input | undefined> => {
    if(this.sourceInput) {
      return this.sourceInput;
    }
    
    let { buid, cdmPerson, config, sourceDataMapper } = sourcePersonParms;

    if (!buid && !cdmPerson) {
      throw new Error('Either buid or cdmPerson must be provided to generate hash');
    }
    if(buid && !cdmPerson) {
      cdmPerson = await new BuCdmPersonDataSource({ config, buid }).fetchRaw();
    }
    if (!cdmPerson) {
      return undefined;
    }

    const unparsedInput = sourceDataMapper.map([cdmPerson[0]]);

    console.log('Hashing source data...');
    
    const input = new InputParser({ 
      _input: unparsedInput, 
      fieldFilter: fs => this.getFilteredFields(fs) // Apply field filtering to remove non-hashable fields before hashing
    }).parse();

    // console.log(`Source data that was hashed: ${JSON.stringify(input.fieldSets[0].hashable, null, 2)}`);

    this.sourceInput = input;
    return this.sourceInput;
  }

  public getInputFromTarget = async (targetPersonParms: TargetPersonParms): Promise<Input | undefined> => {
    if(this.targetInput) {
      return this.targetInput;
    }

    let { config, hrn, buid, huronPerson, targetDataMapper } = targetPersonParms;

    if (!hrn && !buid && !huronPerson) {
      throw new Error('Either hrn, buid, or huronPerson must be provided to generate hash');
    }
    if(hrn && !huronPerson) {
      huronPerson = await new ReadPerson({ config }).readPersonByHRN(hrn);
    }
    if (!huronPerson) {
      if(buid) {
        const results = await new ReadPerson({ config }).readPersonByHailMary(buid);
        if ( results && results.length > 0) {
          huronPerson = results[0];
        }
      }
    }
    if(!huronPerson) {
      return undefined;
    } 

    const unparsedInput= targetDataMapper.map([huronPerson]);
    const input = new InputParser({ 
      _input: unparsedInput, 
      fieldFilter: fs => this.getFilteredFields(fs) // Apply field filtering to remove non-hashable fields before hashing
    }).parse();

    console.log('Hashing target data...');
    // console.log(`Target data that was hashed: ${JSON.stringify(input.fieldSets[0].hashable, null, 2)}`);

    this.targetInput = input;
    return this.targetInput;
  }
}


if(require.main === module) {
  const testEnvironment = TestEnvironment('SYNC_EVALUATOR');

  [
    'HURON_PERSON_CONFIG_PATH',
    'HURON_PERSON_SOURCE_ID'
  ].forEach(testEnvironment.getVarOrEmptyString);

  const { HURON_PERSON_HRN:hrn, HURON_PERSON_SOURCE_ID:buid, HURON_PERSON_CONFIG_PATH } = process.env;
  if( !hrn && !buid) {
    console.error('Please provide either HURON_PERSON_HRN or HURON_PERSON_SOURCE_ID environment variable to run the reverse hash comparison');
    process.exit(1);
  }
  (async () => {
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config = ConfigManager.getInstance().fromEnvironment().fromFileSystem(localConfigPath).getConfig('none');

    const sourceDataMapper = await getDataMapper(config, { orgMap: false, stateMap: true, countryMap: true });

    const targetDataMapper = new ReverseDataMapper();

    const sourcePersonParms: SourcePersonParms = { config, buid, sourceDataMapper };
    const targetPersonParms: TargetPersonParms = { config, hrn, targetDataMapper };
    const sourcePerson = new SourcePerson(sourcePersonParms);
    
    const inSync = await sourcePerson.isInSyncWith(targetPersonParms);
    
    console.log(`Source and target are ${inSync ? '' : 'not '}in sync`);
  })();
}