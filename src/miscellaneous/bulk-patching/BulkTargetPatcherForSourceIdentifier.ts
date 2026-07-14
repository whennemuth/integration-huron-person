import { FieldSet, TestEnvironment } from 'integration-core';
import { HuronPerson } from "../../data-target/crud/Person";
import { AbstractBulkTargetPatcher } from "./BulkTargetPatcher";
import { Config } from "../../config/Config";
import { ConfigManager } from "../../config/ConfigManager";
import { getLocalConfig } from '../../Utils';

/**
 * Implementation that retrieves all people who have an id or employeeId that matches the 
 * pattern for a buid, i.e. id starts with "U" followed by 8 digits, and patches those 
 * people so that the sourceIdentifier is set to this value. This is useful for 
 * backfilling sourceIdentifier for people who were created before we implemented 
 * sourceIdentifier population at creation time, but who have a buid in their id or 
 * employeeId that we can use as a sourceIdentifier.
 */
export class SourceIdentifierBulkPatcher extends AbstractBulkTargetPatcher {

  public isPatchable = async (person: HuronPerson): Promise<boolean> => {
    const { id, employeeId, sourceIdentifier } = person;
    const buidPattern = /^U\d{8}$/;
    const idMatches = id ? buidPattern.test(id) : false;
    const employeeIdMatches = employeeId ? buidPattern.test(employeeId) : false;
    const hasSourceIdentifier = !!sourceIdentifier;
    const hasValidSourceIdentifier = hasSourceIdentifier ? buidPattern.test(sourceIdentifier) : false;
    return (idMatches || employeeIdMatches) && !hasValidSourceIdentifier;
  }

  public getPatchFieldset = async (person: HuronPerson): Promise<FieldSet> => {
    const { id, employeeId } = person;
    const buid = id && /^U\d{8}$/.test(id) ? id : employeeId!;
    return { fieldValues: [
      { 'sourceIdentifier': buid }
    ]} as FieldSet;
  }

  public static runPatcher = async (config: Config, dryRun: boolean): Promise<void> => {
    const patcher = new SourceIdentifierBulkPatcher(config, { includeFields: [
      'hrn', 'id', 'employeeId', 'sourceIdentifier'
    ]}, dryRun);
    await patcher.patchPeople();
  }
}

async function main(): Promise<void> {
  const { DRY_RUN, HURON_PERSON_CONFIG_PATH, SECRET_ARN, CACHE_ENABLED, CACHE_PATH } = process.env;
  const dryRun = DRY_RUN === 'true';

  if(CACHE_ENABLED !== 'true') {
    console.log('CACHE_ENABLED environment variable is not set to "true". You need to cache the access token for bulk operations.');
    return;
  }

  if( ! CACHE_PATH) {
    console.log('CACHE_PATH environment variable is not set. You need to set this to a writable path for caching the access token for bulk operations.');
    return;
  }

  // Load configuration.
  const configManager = ConfigManager.getInstance();
  const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
  const config = await configManager
    .reset()
    .fromJsonString('HURON_PERSON_CONFIG_JSON')   // ← TaskDef secret injection
    .fromSecretManager(SECRET_ARN)                // ← Fallback to Secrets Manager
    .fromEnvironment()                            // ← Fallback to individual env var overrides
    .fromFileSystem(localConfigPath)              // ← Local dev only
    .getConfigAsync('person');

  await SourceIdentifierBulkPatcher.runPatcher(config, dryRun);
}


if(require.main === module) {
  const testEnvironment = TestEnvironment('BULK_TARGET_PATCHER_SOURCE_IDENTIFIER');

  [
    'CACHE_ENABLED',
    'CACHE_PATH',
    'HURON_PERSON_CONFIG_PATH',
    'SECRET_ARN'
  ].forEach(testEnvironment.getVarOrEmptyString);

  main();
}