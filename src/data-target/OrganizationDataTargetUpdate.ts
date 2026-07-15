import { PushOneParms, SinglePushResult, Status } from "integration-core";
import { Config } from "../config/Config";
import { ApiClientForJWT } from "./ApiClientForJWT";
import { getOrganizationIdentifierInfo, HuronOrganizationDataTarget, OrganizationPushResponse } from "./OrganizationDataTarget";
import { ReadOrganization } from "./crud/ReadOrganization";
import { HuronOrganization } from "./crud/Organization";

export type HuronOrganizationDataTargetUpdateConfig = {
  config: Config;
  apiClient: ApiClientForJWT;
  pushOneParms: PushOneParms;
}

export type UpdateOrganizationResult = { 
  response?: OrganizationPushResponse | any | {}, 
  result?: SinglePushResult 
};

/**
 * Handles update of Organization records in Huron. Since Huron requires the HRN to perform updates,
 * this class implements update by using PATCH to the /api/v2/organizations/{hrn} endpoint. If the
 * HRN of the target Organization record is not available in the incoming data, it attempts to look 
 * it up using the sourceIdentifier or id from the fieldSet data.
 */
export class HuronOrganizationDataTargetUpdate {
  private config: Config;
  private apiClient: ApiClientForJWT;
  private organizationRequest: any;
  private data: any;
  private crud: any;
  private _hrn: string | undefined;

  constructor(private params: HuronOrganizationDataTargetUpdateConfig) {
    const { config, apiClient, pushOneParms: { data, crud } } = params;
    this.config = config;
    this.apiClient = apiClient;
    this.data = data;
    this.crud = crud; 
    this.organizationRequest = HuronOrganizationDataTarget.convertFieldSetToRequest(data, crud);
  }

  public updateOrganization = async (): Promise<UpdateOrganizationResult> => {
    // UPDATE: Use PATCH to /api/v2/organizations/{hrn} if hrn is available
    let response;
    let endpoint = this.config.dataTarget.organizationsPath;
    const { config, organizationRequest, apiClient, data, crud } = this;

    console.log(`Pushing single organization record with PATCH operation:`, getOrganizationIdentifierInfo(organizationRequest.data));
    
    if (organizationRequest.data?.hrn) {
      this._hrn = organizationRequest.data.hrn;
      endpoint = `${endpoint}/${this._hrn}`;
      this.apiClient.setErrorEventDetails({ message: 'Huron organization patching error', object: { 
        hrn: organizationRequest.data?.hrn, 
        sourceIdentifier: organizationRequest.data?.sourceIdentifier 
      }});
      response = await this.apiClient.patch<OrganizationPushResponse>(endpoint, organizationRequest.data);
    } 
    else {
      // Attempt to lookup HRN using sourceIdentifier or id from the fieldSet data
      const reader = new ReadOrganization(config);
      
      let result: HuronOrganization[] = [];
      
      // Try sourceIdentifier first
      if (organizationRequest.data?.sourceIdentifier) {
        result = await reader.readOrganizationBySourceIdentifier(organizationRequest.data.sourceIdentifier);
      }
      
      // If not found and id is available, try id
      if (result.length === 0 && organizationRequest.data?.id) {
        result = await reader.readOrganizationById(organizationRequest.data.id);
      }
      
      this._hrn = result?.[0]?.hrn;
      if( ! this._hrn) {
        const identifier = organizationRequest.data?.sourceIdentifier || organizationRequest.data?.id;
        return {
          result: {
            status: Status.FAILURE,
            message: `Cannot determine HRN for UPDATE operation for organization ${identifier}`,
            timestamp: new Date(),
            primaryKey: data.fieldValues.filter((fv: any) => 'sourceIdentifier' in fv || 'id' in fv),
            crud
          }
        };
      }

      // Perform the patch now that the hrn is known
      organizationRequest.data.hrn = this._hrn;
      endpoint = `${endpoint}/${this._hrn}`;
      this.apiClient.setErrorEventDetails({ message: 'Huron organization patching error', object: { 
        hrn: this._hrn, 
        sourceIdentifier: organizationRequest.data?.sourceIdentifier 
      }});
      response = await this.apiClient.patch<OrganizationPushResponse>(endpoint, organizationRequest.data);
    }

    return { response };
  }

  public hrn = (): string | undefined => {
    return this._hrn;
  }
}
