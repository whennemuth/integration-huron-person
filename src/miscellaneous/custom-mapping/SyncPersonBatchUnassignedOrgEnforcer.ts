import * as fs from 'fs';
import { CrudOperation, Input, TestEnvironment } from "integration-core";
import { main } from "../../SyncPersonBatch";
import { getLocalConfig, setFileLogging } from "../../Utils";
import { Config } from '../../config/Config';
import { ConfigManager } from "../../config/ConfigManager";
import { DataMapper, getDataMapper } from "../../data-mapper/DataMapper";

type UnassignedOrgEnforcerParams = {
  params: ConstructorParameters<typeof DataMapper>[0];
  authorizedBuids: Set<string>;
  innerMapper?: DataMapper; // Optional inner mapper for decorator chaining
};

/**
 * Custom DataMapper implementation that enforces UNASSIGNED organization assignment for people
 * not present in the authorized population list. This addresses the issue where the single-person
 * API endpoint may return data for individuals not included in the full-population endpoint
 * (PersonFull), leading to incorrect organization/employer assignments.
 * 
 * Problem Context:
 * The PersonFull population (bulk endpoint) may not contain all individuals that can be looked up
 * via the single-person endpoint. When syncing individuals not in PersonFull, the single-person
 * endpoint returns their actual organization/employer data without knowing they should be excluded
 * from the active population, resulting in incorrect assignments.
 * 
 * Solution:
 * This mapper checks if each person's BUID exists in the authorized population set (loaded from file).
 * For people NOT in the authorized set:
 * - Sets organization to UNASSIGNED (via lookup syntax)
 * - Sets employer to UNASSIGNED (via lookup syntax)
 * - Sets active to false
 * 
 * This ensures that people outside the authorized population are properly marked as unassigned
 * and inactive in the target system.
 */
class UnassignedOrgEnforcer extends DataMapper {
  private authorizedBuids: Set<string>;
  private innerMapper?: DataMapper;

  constructor(params: UnassignedOrgEnforcerParams) {
    super(params.params);
    this.authorizedBuids = params.authorizedBuids;
    this.innerMapper = params.innerMapper;
    
    if (!this.authorizedBuids || this.authorizedBuids.size === 0) {
      throw new Error('Authorized BUIDs set must be provided and non-empty');
    }
    
    console.log(`UnassignedOrgEnforcer initialized with ${this.authorizedBuids.size} authorized BUIDs`);
  }

  private logIfPreview = (mappedData: Input): void => {
    const preview = `${process.env.SYNC_PREVIEW}`.trim().toLowerCase() === 'true';
    if (preview) {
      console.log(JSON.stringify(mappedData));
    }
  }

  public map(rawData: any[], crudOperation?: CrudOperation): Input {
    return this.getMappedData({ rawData, crudOperation: crudOperation });
  };

  /**
   * Override the standard getMappedData to enforce UNASSIGNED organization assignment
   * for people not in the authorized population.
   * 
   * @param params 
   * @returns 
   */
  public getMappedData(params: { rawData: any[], personHrn?: string, crudOperation?: CrudOperation }): Input {
    const { rawData } = params;
    // Use innerMapper if provided, else fall back to super (standard DataMapper)
    const standardMappedData = this.innerMapper 
      ? this.innerMapper.getMappedData(params)
      : super.getMappedData(params);

    // Extract the BUID (personid/sourceIdentifier) from the raw data
    // Try multiple possible field names
    const buid = rawData[0]?.personid || rawData[0]?.sourceIdentifier || rawData[0]?.id;
    
    if (!buid) {
      console.warn('Could not extract BUID from raw data, applying standard mapping');
      return standardMappedData;
    }

    // Check if this BUID is in the authorized population
    const isAuthorized = this.authorizedBuids.has(buid);

    if (isAuthorized) {
      // Person is in authorized population - use standard mapping
      console.log(`BUID ${buid} is authorized - using standard mapping`);
      this.logIfPreview(standardMappedData);
      return standardMappedData;
    }

    // Person is NOT in authorized population - enforce UNASSIGNED organization
    console.log(`BUID ${buid} is NOT authorized - enforcing UNASSIGNED organization and inactive status`);

    // Mutate the standard mapping to enforce UNASSIGNED organization and inactive status
    const modifiedFieldSets = standardMappedData.fieldSets.map(fieldSet => {
      // Track which fields exist across all Field objects
      const fieldNames = new Set(
        fieldSet.fieldValues.flatMap(field => Object.keys(field))
      );
      
      // Map existing fields, overriding employer/organization/active if present
      const modifiedFields = fieldSet.fieldValues.map(field => {
        if ('employer' in field) {
          return { employer: { hrn: 'lookup:sourceIdentifier:UNASSIGNED' } };
        }
        if ('organization' in field) {
          return { organization: { hrn: 'lookup:sourceIdentifier:UNASSIGNED' } };
        }
        if ('active' in field) {
          return { active: false };
        }
        if ('__active' in field) {
          return { __active: false };
        }
        return field;
      });

      // Add fields if they don't exist
      if (!fieldNames.has('employer')) {
        modifiedFields.push({ employer: { hrn: 'lookup:sourceIdentifier:UNASSIGNED' } });
      }
      if (!fieldNames.has('organization')) {
        modifiedFields.push({ organization: { hrn: 'lookup:sourceIdentifier:UNASSIGNED' } });
      }
      if (!fieldNames.has('active')) {
        modifiedFields.push({ active: false });
      }
      if (!fieldNames.has('__active')) {
        modifiedFields.push({ __active: false });
      }

      return { ...fieldSet, fieldValues: modifiedFields };
    });

    const mappedData = { ...standardMappedData, fieldSets: modifiedFieldSets };

    this.logIfPreview(mappedData);
    return mappedData;
  }
}

/**
 * Load BUIDs from a text file (one BUID per line).
 * Lines starting with # are treated as comments and ignored.
 * Empty lines are also ignored.
 * 
 * @param filePath - Path to the file containing BUIDs
 * @returns Set of BUIDs
 */
function loadAuthorizedBuids(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Authorized BUIDs file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const buids = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (trimmed && !trimmed.startsWith('#')) {
      buids.add(trimmed);
    }
  }

  console.log(`Loaded ${buids.size} authorized BUIDs from ${filePath}`);
  return buids;
}

/**
 * Load sync BUIDs from a file or string.
 * Lines starting with # are treated as comments and ignored.
 * Empty lines are also ignored.
 * 
 * @param source - File path or string content with BUIDs (comma-separated or one per line)
 * @param isFilePath - True if source is a file path, false if it's content
 * @returns Comma-separated string of BUIDs
 */
function loadSyncBuids(source: string, isFilePath: boolean): string {
  let content: string;

  if (isFilePath) {
    if (!fs.existsSync(source)) {
      throw new Error(`Sync BUIDs file not found: ${source}`);
    }
    content = fs.readFileSync(source, 'utf-8');
  } else {
    content = source;
  }

  const buids: string[] = [];

  // Support both line-separated and comma-separated formats
  const lines = content.includes('\n') ? content.split('\n') : [content];
  
  for (const line of lines) {
    // If line contains commas, split by comma (for comma-delimited format)
    const entries = line.includes(',') ? line.split(',') : [line];
    
    for (const entry of entries) {
      const trimmed = entry.trim();
      // Skip empty entries and comments
      if (trimmed && !trimmed.startsWith('#')) {
        buids.push(trimmed);
      }
    }
  }

  const result = buids.join(',');
  console.log(`Loaded ${buids.length} sync BUIDs from ${isFilePath ? 'file' : 'string'}`);
  return result;
}

async function _main({ config, innerMapper }: { config?: Config; innerMapper?: DataMapper }) {
  // Parse SYNC_BUIDS source (string takes precedence over file)
  const { SYNC_BUIDS, SYNC_BUIDS_FILE_PATH } = process.env;

  if (SYNC_BUIDS) {
    // SYNC_BUIDS already set as string
    console.log(`Using SYNC_BUIDS from environment: ${SYNC_BUIDS}`);
    process.env.SYNC_BUIDS_FILE_PATH = ''; // Clear file path if string is provided
  } else if (SYNC_BUIDS_FILE_PATH) {
    // Load from file and set SYNC_BUIDS
    const syncBuids = loadSyncBuids(SYNC_BUIDS_FILE_PATH, true);
    process.env.SYNC_BUIDS = syncBuids;
    console.log(`Set SYNC_BUIDS from file: ${syncBuids}`);
  } else {
    throw new Error('Either SYNC_BUIDS or SYNC_BUIDS_FILE_PATH is required');
  }

  // Load the authorized BUIDs from file
  const { AUTHORIZED_BUIDS_FILE_PATH } = process.env;
  
  if (!AUTHORIZED_BUIDS_FILE_PATH) {
    throw new Error('AUTHORIZED_BUIDS_FILE_PATH environment variable is required');
  }
  
  const authorizedBuids = loadAuthorizedBuids(AUTHORIZED_BUIDS_FILE_PATH);

  if (!config) {
    // Load configuration
    const { HURON_PERSON_CONFIG_PATH } = process.env;
    const configManager = ConfigManager.getInstance();
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    config = configManager.reset()
      .fromEnvironment()
      .fromFileSystem(localConfigPath)
      .getConfig('person');
  }

  // Get mapper to decorate (either provided innerMapper or create standard mapper)
  let mapperToDecorate: DataMapper;
  if (innerMapper) {
    mapperToDecorate = innerMapper;
  } else {
    mapperToDecorate = await getDataMapper(config, { 
      orgMap: true, stateMap: true, countryMap: true 
    });
  }

  // Create an instance of the UnassignedOrgEnforcer wrapping the mapper
  const enforcerMapper = new UnassignedOrgEnforcer({
    params: mapperToDecorate.params,
    authorizedBuids,
    innerMapper: mapperToDecorate
  });

  // Pass the enforcer DataMapper to the main sync function in SyncPersonBatch
  await main({ dataMapper: enforcerMapper, config });
}

// Run if this file is executed directly
if (require.main === module) {
  // Gather environment variables
  const testEnvironment = TestEnvironment('SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER');

  [
    'SYNC_PREVIEW', 
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'AUTHORIZED_BUIDS_FILE_PATH',
    'OUTPUT_FILE_PATH'
  ].forEach(testEnvironment.getVar);

  [
    'SYNC_BUIDS',
    'SYNC_BUIDS_FILE_PATH'
  ].forEach(testEnvironment.getVarOrEmptyString);

  const logFilePath = process.env.OUTPUT_FILE_PATH || 'data/sync_person_batch_unassigned_org_enforcer_output.json';
  setFileLogging(logFilePath);

  _main({});
}

export { loadAuthorizedBuids, UnassignedOrgEnforcer };

