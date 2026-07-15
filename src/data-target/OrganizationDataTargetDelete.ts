import { CrudOperation, FieldSet, PushOneParms, SinglePushResult, Status } from "integration-core";
import { Config, TargetOrganizationDeleteType } from "../config/Config";
import { ApiClientForJWT } from "./ApiClientForJWT";
import { HuronOrganization } from "./crud/Organization";
import { ReadOrganization } from "./crud/ReadOrganization";
import { getOrganizationIdentifierInfo, HuronOrganizationDataTarget, OrganizationPushRequest, OrganizationPushResponse } from "./OrganizationDataTarget";

export type HuronOrganizationDataTargetDeleteConfig = {
  config: Config;
  apiClient: ApiClientForJWT;
  pushOneParms: PushOneParms;
}
  
export type DeleteOrganizationResult = { 
  response?: OrganizationPushResponse | any | {}, 
  result?: SinglePushResult 
};

/**
 * Handles deletion of Organization records in Huron. Since Huron does not support hard deletes, 
 * this class implements soft delete by setting active: false on the Organization record.
 */
export class HuronOrganizationDataTargetDelete {
  private config: Config;
  private apiClient: ApiClientForJWT;
  private organizationRequest: OrganizationPushRequest;
  private data: FieldSet;
  private crud: CrudOperation;
  private _hrn: string | undefined;

  constructor(private params: HuronOrganizationDataTargetDeleteConfig) {
    const { config, apiClient, pushOneParms: { data, crud } } = params;
    this.config = config;
    this.apiClient = apiClient;
    this.data = data;
    this.crud = crud; 
    this.organizationRequest = HuronOrganizationDataTarget.convertFieldSetToRequest(data, crud);
  }

  public deleteOrganization = async (): Promise<DeleteOrganizationResult> => {
    let endpoint = this.config.dataTarget.organizationsPath;
    const { organizationRequest, apiClient, data, crud } = this;
    
    let retval: DeleteOrganizationResult = {};
    console.log(`Soft deleting single organization record with PATCH operation:`, getOrganizationIdentifierInfo(data));
    
    // Extract HRN from the original fieldSet data
    let hrn = data.fieldValues.find((fv: any) => fv.hrn)?.hrn as string | undefined;
    
    if (hrn) {
      this._hrn = hrn;
      const { SOFT, HARD, LOG, NONE } = TargetOrganizationDeleteType;
      const deleteType = this.config.dataTarget.organizationDeleteType || SOFT; // Get from config
      
      let patch = true;
      switch (deleteType) {
        case HARD:
          console.warn(`HARD delete requested for HRN ${hrn}. But only SOFT delete (deactivation) is allowed - deactivating instead.`);
          break;
        case LOG:
          console.log(`${hrn} not present anymore in source system. Logging this event but not deactivating in Huron as per configuration.`);
          patch = false;
          break;
        case NONE:
          patch = false;
          break;
      }
      
      if(patch) {
        endpoint = `${endpoint}/${hrn}`;
        // For soft delete, we only need to set active: false
        const softDeleteData = { hrn: hrn, active: false };
        this.apiClient.setErrorEventDetails({ message: 'Huron organization deletion error', object: { 
          hrn: hrn, 
          sourceIdentifier: data.fieldValues.find((fv: any) => fv.sourceIdentifier)?.sourceIdentifier 
        }});
        let response = await this.apiClient.patch<OrganizationPushResponse>(endpoint, softDeleteData);
        retval = { response };
      }
    } 
    else {
      // HRN not directly available; attempt fallback lookup by sourceIdentifier
      const sourceIdentifier = data.fieldValues.find((fv: any) => fv.sourceIdentifier)?.sourceIdentifier as string | undefined;
      const id = data.fieldValues.find((fv: any) => fv.id)?.id as string | undefined;
      
      if (sourceIdentifier || id) {
        const lookupValue = sourceIdentifier || id;
        const lookupType = sourceIdentifier ? 'sourceIdentifier' : 'id';
        console.log(`HRN not found in fieldSet for DELETE operation. Attempting fallback lookup by ${lookupType}: ${lookupValue}`);
        
        const reader = new ReadOrganization(this.config);
        try {
          let lookupResult: HuronOrganization[] = [];
          
          if (sourceIdentifier) {
            lookupResult = await reader.readOrganizationBySourceIdentifier(sourceIdentifier);
          } else if (id) {
            lookupResult = await reader.readOrganizationById(id);
          }
          
          hrn = lookupResult?.[0]?.hrn;
          if (hrn) {
            this._hrn = hrn;
            const { SOFT, HARD, LOG, NONE } = TargetOrganizationDeleteType;
            const deleteType = this.config.dataTarget.organizationDeleteType || SOFT; // Get from config
            
            let patch = true;
            switch (deleteType) {
              case HARD:
                console.warn(`HARD delete requested for HRN ${hrn}. But only SOFT delete (deactivation) is allowed - deactivating instead.`);
                break;
              case LOG:
                console.log(`${hrn} not present anymore in source system. Logging this event but not deactivating in Huron as per configuration.`);
                patch = false;
                break;
              case NONE:
                patch = false;
                break;
            }
            
            if (patch) {
              endpoint = `${endpoint}/${hrn}`;
              const softDeleteData = { hrn: hrn, active: false };
              this.apiClient.setErrorEventDetails({ message: 'Huron organization deletion error', object: { 
                hrn: hrn, 
                sourceIdentifier: sourceIdentifier,
                id: id
              }});
              let response = await this.apiClient.patch<OrganizationPushResponse>(endpoint, softDeleteData);
              retval = { response };
            }
          } else {
            const errorMsg = `Cannot perform soft delete: HRN lookup by ${lookupType} failed`;
            console.error(`${errorMsg}:`, getOrganizationIdentifierInfo(data));
            retval = { 
              result: {
                status: Status.FAILURE,
                message: errorMsg,
                timestamp: new Date(),
                primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'sourceIdentifier' in fv),
                crud
              }
            };
          }
        } catch (error: any) {
          const errorMsg = `Cannot perform soft delete: HRN lookup by ${lookupType} encountered an error`;
          console.error(`${errorMsg}: ${error.message}`);
          retval = { 
            result: {
              status: Status.FAILURE,
              message: errorMsg,
              timestamp: new Date(),
              primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'sourceIdentifier' in fv),
              crud
            }
          };
        }
      } else {
        const errorMsg = 'Cannot perform soft delete: no HRN, sourceIdentifier, or id available for organization';
        console.error(`${errorMsg}:`, getOrganizationIdentifierInfo(data));
        retval = { 
          result: {
            status: Status.FAILURE,
            message: errorMsg,
            timestamp: new Date(),
            primaryKey: data.fieldValues.filter((fv: any) => 'id' in fv || 'sourceIdentifier' in fv),
            crud
          }
        };
      }
    }
    
    return retval;
  }

  public hrn = (): string | undefined => {
    return this._hrn;
  }
}
