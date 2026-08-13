# Example Environment Variables

Reference configuration for test harnesses in `integration-huron-person`. Copy these values to your `.env` file and customize as needed for your environment.

**Note**: This file contains sanitized example values. Replace placeholder values (e.g., `your_target_password`, `<SECRET_ARN>`) with actual credentials appropriate for your environment.

```env
# Basic launch configuration settings for CDK and SDK operations.
AWS_PROFILE=infnprd
REGION=us-east-2
LANDSCAPE=dev
DEBUG=true

# Person DataSource Configuration (API Key Authentication)
DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL=https://prod-buprod-cloudultra-fm.snaplogic.io
DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY=<your-person-api-key>
DATASOURCE_ENDPOINTCONFIG_PERSON_PATH=/api/1/rest/feed-master/queue/BUProd/Admin-Integration-Services/CommonServiceWrappers/huronIRBPerson

# People DataSource Configuration (API Key Authentication)
DATASOURCE_ENDPOINTCONFIG_PEOPLE_BASE_URL=https://prod-buprod-fm.snaplogic.io
DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY=<your-people-api-key>
DATASOURCE_ENDPOINTCONFIG_PEOPLE_PATH=/api/1/rest/feed/run/task/BUProd/Admin-Integration-Services/GenericGets/huronIRBgetPersonByPopulation

# Current Terms DataSource Configuration (API Key Authentication)
DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_BASE_URL=https://prod-buprod-fm.snaplogic.io
DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_API_KEY=<your-current-terms-api-key>
DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_PATH=/api/1/rest/feed/run/task/BUProd/Admin-Integration-Services/GenericGets/getCurrentTermFromCS

# DataTarget Configuration (JWT Authentication)
DATATARGET_ENDPOINTCONFIG_BASE_URL=https://bu.hrs-staging.com
DATATARGET_ENDPOINTCONFIG_USERNAME=<target-system-username>
DATATARGET_ENDPOINTCONFIG_PASSWORD=<target-system-password>
DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH=/loginsvc/api/v1/token/
DATATARGET_ENDPOINTCONFIG_LOGIN_USERID=<your-email@bu.edu>
DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN=<external-jwt-token>
DATATARGET_ENDPOINTCONFIG_AUTH_METHOD=externalToken
DATATARGET_PERSONS_PATH=/api/v2/persons
DATATARGET_ORGANIZATIONS_PATH=/api/v2/organizations

# Integration Configuration
CLIENT_ID=huron-person-integration-dev
SYNC_BUID=U73645483
HURON_PEOPLE_FILTER=buid

# Huron Person Identifiers for testing
HURON_PERSON_ID=148
HURON_PERSON_HRN=hrn:hrs:persons:148
HURON_PERSON_SOURCE_ID=U01733060
HURON_PERSON_USER_ID=<user-email@bu.edu>
HURON_PERSON_EMAIL=<user-email@bu.edu>
HURON_PERSON_ID_TYPE=hrn
HURON_PERSON_FNAME=john
HURON_PERSON_LNAME=doe
HURON_PERSON_NAME_FILTER=last
HURON_PERSON_SOURCE_IDS=U13061973,U74538490,U27857128

# Huron People List Configuration
HURON_PEOPLE_LIST_TASK=keys_and_names
HURON_PEOPLE_LIST_STATUS=inactive

# Huron Organization Configuration
HURON_ORG_ID=10006707
HURON_ORG_HRN=hrn:hrs:orgs:1
HURON_ORG_SOURCE_ID=10000031
HURON_ORG_NAME=Sample Organization
HURON_ORG_ID_TYPE=id
HURON_ORGS_TASK=pages

# Huron Lists Configuration
HURON_LIST_TASK=all-list-items-abbrev
HURON_LIST_TYPE_NAME=Countries
HURON_LIST_TYPE_HRN=hrn:hrs:lists:countries
HURON_LIST_OUTPUT_FILE=./list_output.json

# Cache Configuration
CACHE_ENABLED=true
CACHE_PATH=.

# Sync Configuration
SYNC_TASK=one
SYNC_PREVIEW=false
SYNC_UPDATE_HASH=false
SYNC_CRUD=update
SYNC_BUIDS=U13061973,U74538490,U27857128

# S3 Configuration
CHUNKS_BUCKET=huron-person-chunks-dev
CHUNK_KEY=chunks/person-full/2026-04-09T15:28:18.703Z/chunk-0000.ndjson

# AWS Secrets Manager
SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>

# Chunking Configuration
CHUNK_SCANNER_TASK=save
CHUNK_SCANNER_BUCKET=huron-person-chunks-dev
CHUNK_SCANNER_KEY=chunks/person-full/2026-05-26T15:04:22.699Z/
CHUNK_SCANNER_BUID=U00826680
CHUNK_SCANNER_STOP_WHEN_FOUND=true
CHUNK_SCANNER_REGION=us-east-2

DRY_RUN=false

# -------------------------------------------------------------------
#   TestEnvironment Harness Groups (integration-huron-person)
# -------------------------------------------------------------------

# ---------- Use these for CONFIG_FROM_SECRETS_MANAGER ---------- #
CONFIG_FROM_SECRETS_MANAGER_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>
CONFIG_FROM_SECRETS_MANAGER_REGION=us-east-2

# ---------- Use these for CONFIG_MANAGER ---------- #
CONFIG_MANAGER_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>
CONFIG_MANAGER_HURON_PERSON_CONFIG_JSON=

# ---------- Use these for DATA_MAPPER ---------- #
DATA_MAPPER_HURON_PERSON_CONFIG_PATH=
DATA_MAPPER_SYNC_BUID=U73645483
DATA_MAPPER_PRINT_MAPPINGS=

# ---------- Use these for DATA_MAPPER_COUNTRY ---------- #
DATA_MAPPER_COUNTRY_HURON_PERSON_CONFIG_PATH=
DATA_MAPPER_COUNTRY_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>

# ---------- Use these for DATA_MAPPER_ORG ---------- #
DATA_MAPPER_ORG_HURON_PERSON_CONFIG_PATH=
DATA_MAPPER_ORG_SYNC_BUID=U73645483

# ---------- Use these for DATA_MAPPER_STATE ---------- #
DATA_MAPPER_STATE_HURON_PERSON_CONFIG_PATH=
DATA_MAPPER_STATE_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>

# ---------- Use these for FIELD_FILTER ---------- #
FIELD_FILTER_HURON_PERSON_HRN=hrn:hrs:persons:148
FIELD_FILTER_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for MAPPING_VALIDATOR ---------- #
MAPPING_VALIDATOR_HURON_PERSON_CONFIG_PATH=
MAPPING_VALIDATOR_SYNC_BUID=U73645483
MAPPING_VALIDATOR_PRINT_MAPPINGS=

# ---------- Use these for CURRENT_TERMS_DATASOURCE ---------- #
CURRENT_TERMS_DATASOURCE_HURON_PERSON_CONFIG_PATH=
CURRENT_TERMS_DATASOURCE_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>

# ---------- Use these for PEOPLE_CDM_DATASOURCE ---------- #
PEOPLE_CDM_DATASOURCE_HURON_PERSON_CONFIG_PATH=
PEOPLE_CDM_DATASOURCE_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>

# ---------- Use these for PEOPLE_DATASOURCE_BATCH ---------- #
PEOPLE_DATASOURCE_BATCH_HURON_PERSON_CONFIG_PATH=
PEOPLE_DATASOURCE_BATCH_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>

# ---------- Use these for PEOPLE_S3_DATASOURCE ---------- #
PEOPLE_S3_DATASOURCE_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for PERSON_DATASOURCE ---------- #
PERSON_DATASOURCE_HURON_PERSON_CONFIG_PATH=
PERSON_DATASOURCE_SYNC_BUID=U73645483

# ---------- Use these for AUTH_TOKEN ---------- #
AUTH_TOKEN_HURON_PERSON_CONFIG_PATH=
AUTH_TOKEN_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>

# ---------- Use these for DEACTIVATE_PERSON ---------- #
DEACTIVATE_PERSON_HURON_PERSON_CONFIG_PATH=
DEACTIVATE_PERSON_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>
DEACTIVATE_PERSON_CACHE_ENABLED=true
DEACTIVATE_PERSON_CACHE_PATH=.
DEACTIVATE_PERSON_HURON_PERSON_ID_TYPE=hrn

# ---------- Use these for LIST_PEOPLE ---------- #
LIST_PEOPLE_HURON_PEOPLE_LIST_TASK=keys_and_names
LIST_PEOPLE_HURON_PEOPLE_LIST_STATUS=inactive
LIST_PEOPLE_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for READ_LIST ---------- #
READ_LIST_HURON_LIST_TASK=all-list-items-abbrev
READ_LIST_HURON_LIST_TYPE_NAME=Countries
READ_LIST_HURON_LIST_TYPE_HRN=hrn:hrs:lists:countries
READ_LIST_HURON_LIST_OUTPUT_FILE=./list_output.json
READ_LIST_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for READ_ORGANIZATION ---------- #
READ_ORGANIZATION_HURON_ORG_ID_TYPE=id
READ_ORGANIZATION_HURON_ORG_ID=10006707
READ_ORGANIZATION_HURON_ORG_HRN=hrn:hrs:orgs:1
READ_ORGANIZATION_HURON_ORG_SOURCE_ID=10000031
READ_ORGANIZATION_HURON_ORG_NAME=Sample Organization
READ_ORGANIZATION_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for READ_ORGANIZATIONS ---------- #
READ_ORGANIZATIONS_HURON_ORGS_TASK=pages
READ_ORGANIZATIONS_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for READ_PEOPLE ---------- #
READ_PEOPLE_HURON_PEOPLE_FILTER=buid
READ_PEOPLE_HURON_PERSON_SOURCE_IDS=U13061973,U74538490,U27857128
READ_PEOPLE_HURON_PERSON_NAME_FILTER=last
READ_PEOPLE_HURON_PERSON_FNAME=john
READ_PEOPLE_HURON_PERSON_LNAME=doe
READ_PEOPLE_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for READ_PERSON ---------- #
READ_PERSON_HURON_PERSON_ID_TYPE=hrn
READ_PERSON_HURON_PERSON_ID=148
READ_PERSON_HURON_PERSON_HRN=hrn:hrs:persons:148
READ_PERSON_HURON_PERSON_SOURCE_ID=U01733060
READ_PERSON_HURON_PERSON_USER_ID=<user-email@bu.edu>
READ_PERSON_HURON_PERSON_EMAIL=<user-email@bu.edu>
READ_PERSON_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for UPSERT_DELTA_STRATEGY ---------- #
UPSERT_DELTA_STRATEGY_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>
UPSERT_DELTA_STRATEGY_HURON_PERSON_CONFIG_PATH=
UPSERT_DELTA_STRATEGY_SYNC_BUID=U73645483

# ---------- Use these for BULK_TARGET_PATCHER ---------- #
BULK_TARGET_PATCHER_DRY_RUN=false
BULK_TARGET_PATCHER_HURON_PERSON_CONFIG_PATH=
BULK_TARGET_PATCHER_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>
BULK_TARGET_PATCHER_CACHE_ENABLED=true
BULK_TARGET_PATCHER_CACHE_PATH=.

# ---------- Use these for BULK_TARGET_PATCHER_SOURCE_IDENTIFIER ---------- #
BULK_TARGET_PATCHER_SOURCE_IDENTIFIER_DRY_RUN=false
BULK_TARGET_PATCHER_SOURCE_IDENTIFIER_HURON_PERSON_CONFIG_PATH=
BULK_TARGET_PATCHER_SOURCE_IDENTIFIER_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>
BULK_TARGET_PATCHER_SOURCE_IDENTIFIER_CACHE_ENABLED=true
BULK_TARGET_PATCHER_SOURCE_IDENTIFIER_CACHE_PATH=.

# ---------- Use these for SYNC_EVALUATOR ---------- #
SYNC_EVALUATOR_HURON_PERSON_HRN=hrn:hrs:persons:148
SYNC_EVALUATOR_HURON_PERSON_SOURCE_ID=U01733060
SYNC_EVALUATOR_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for HASH_STORAGE_RESET_S3 ---------- #
HASH_STORAGE_RESET_S3_HURON_PERSON_HRN=hrn:hrs:persons:148
HASH_STORAGE_RESET_S3_HURON_PERSON_SOURCE_ID=U01733060
HASH_STORAGE_RESET_S3_HURON_PERSON_CONFIG_PATH=
HASH_STORAGE_RESET_S3_INTEGRATED_DELTA_CLIENT_ID=delta-storage
HASH_STORAGE_RESET_S3_DELTA_STORAGE_BUCKET=<s3-bucket-name>

# ---------- Use these for HASH_STORAGE_RESET_ALL ---------- #
HASH_STORAGE_RESET_ALL_HURON_PERSON_CONFIG_PATH=
HASH_STORAGE_RESET_ALL_INTEGRATED_DELTA_CLIENT_ID=delta-storage
HASH_STORAGE_RESET_ALL_DELTA_STORAGE_BUCKET=<s3-bucket-name>

# ---------- Use these for SYNC_PEOPLE ---------- #
SYNC_PEOPLE_CACHE_ENABLED=true
SYNC_PEOPLE_CACHE_PATH=.
SYNC_PEOPLE_HURON_PERSON_CONFIG_PATH=

# ---------- Use these for SYNC_PERSON ---------- #
SYNC_PERSON_HURON_PERSON_CONFIG_PATH=
SYNC_PERSON_SYNC_BUID=U73645483
SYNC_PERSON_SYNC_CRUD=update
SYNC_PERSON_SYNC_PREVIEW=false
SYNC_PERSON_SYNC_UPDATE_HASH=false
SYNC_PERSON_DRY_RUN=false

# ---------- Use these for SYNC_PERSON_BATCH ---------- #
SYNC_PERSON_BATCH_HURON_PERSON_CONFIG_PATH=
SYNC_PERSON_BATCH_SYNC_BUIDS=U13061973,U74538490,U27857128
SYNC_PERSON_BATCH_SYNC_PREVIEW=false
SYNC_PERSON_BATCH_SYNC_UPDATE_HASH=false

# ---------- Use these for src/data-target/OrganizationDataTarget.ts ---------- #
ORGANIZATION_DATA_TARGET_TASK=create
ORGANIZATION_DATA_TARGET_JSON_VALUE=
ORGANIZATION_DATA_TARGET_JSON_FILE_PATH=./organization-data.json
ORGANIZATION_DATA_TARGET_HURON_PERSON_CONFIG_PATH=
ORGANIZATION_DATA_TARGET_SECRET_ARN=<arn:aws:secretsmanager:region:account:secret:path-xxxxx>
ORGANIZATION_DATA_TARGET_CACHE_ENABLED=true
ORGANIZATION_DATA_TARGET_CACHE_PATH=.

# ---------- Use these for src/miscellaneous/custom-mapping/SyncPersonBatchUnassignedOrgEnforcer.ts ---------- #
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_SYNC_PREVIEW=false
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_SYNC_UPDATE_HASH=false
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_INTEGRATED_DELTA_CLIENT_ID=
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_DELTA_STORAGE_BUCKET=
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_AUTHORIZED_BUIDS_FILE_PATH=./authorized-buids.txt
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_OUTPUT_FILE_PATH=./data/sync_person_batch_unassigned_org_enforcer_output.json
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_SYNC_BUIDS_FILE_PATH=
SYNC_PERSON_BATCH_UNASSIGNED_ORG_ENFORCER_SYNC_BUIDS=
```
