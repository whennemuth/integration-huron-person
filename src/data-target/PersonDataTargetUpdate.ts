import { PushOneParms, SinglePushResult, Status } from "integration-core";
import { Config } from "../config/Config";
import { ApiClientForJWT } from "./ApiClientForJWT";
import { getPersonIdentifierInfo, HuronPersonDataTarget, PersonPushResponse } from "./PersonDataTarget";
import { ReadPerson } from "./crud/ReadPerson";
import { HuronPerson } from "./crud/Person";

export type HuronPersonDataTargetUpdateConfig = {
  config: Config;
  apiClient: ApiClientForJWT;
  pushOneParms: PushOneParms;
}

export type UpdatePersonResult = { 
  response?: PersonPushResponse | any | {}, 
  result?: SinglePushResult 
};

/**
 * Handles update of Person records in Huron. Since Huron does not support PUT for updating existing 
 * records, this class implements update by using PATCH to the /api/v2/persons/{hrn} endpoint. If the
 * HRN of the target Person record is not available in the incoming data, it attempts to look it up 
 * using the sourceIdentifier or id from the fieldSet data, since Huron requires the HRN to perform 
 * updates (NOTE: Becomes unnecessary when Huron starts supporting lookup syntax for the hrn). 
 */
export class HuronPersonDataTargetUpdate {
  private config: Config;
  private apiClient: ApiClientForJWT;
  private personRequest: any;
  private data: any;
  private crud: any;
  private _hrn: string | undefined;

  constructor(private params: HuronPersonDataTargetUpdateConfig) {
    const { config, apiClient, pushOneParms: { data, crud } } = params;
    this.config = config;
    this.apiClient = apiClient;
    this.data = data;
    this.crud = crud; 
    this.personRequest = HuronPersonDataTarget.convertFieldSetToRequest(data, crud);
  }

  public updatePerson = async (): Promise<UpdatePersonResult> => {
    // UPDATE: Use PATCH to /api/v2/persons/{hrn} if hrn is available
    let response;
    let endpoint = this.config.dataTarget.personsPath;
    const { config, personRequest, apiClient, data, crud } = this;

    console.log(`Pushing single person record with PATCH operation:`, getPersonIdentifierInfo(personRequest.data));
    if (personRequest.data?.hrn) {
      this._hrn = personRequest.data.hrn;
      endpoint = `${endpoint}/${this._hrn}`;
      // response = await this.apiClient.put<PersonPushResponse>(endpoint, personRequest.data);
      this.apiClient.setErrorEventDetails({ message: 'Huron patching error', object: { 
        hrn: personRequest.data?.hrn, 
        sourceIdentifier: personRequest.data?.sourceIdentifier 
      }});
      response = await this.apiClient.patch<PersonPushResponse>(endpoint, personRequest.data);
    } 
    else {
      // Huron lookup feature not ready yet, so attempt to lookup HRN using sourceIdentifier or id from the fieldSet data
      const reader = new ReadPerson({ config });
      const result:HuronPerson[] = await reader.readPersonByHailMary(personRequest.data?.sourceIdentifier);
      this._hrn = result?.[0]?.hrn;
      if( ! this._hrn) {
        return {
          result: {
            status: Status.FAILURE,
            message: `Cannot determine HRN for UPDATE operation for ${personRequest.data?.sourceIdentifier}`,
            timestamp: new Date(),
            primaryKey: data.fieldValues.filter((fv: any) => 'sourceIdentifier' in fv || 'id' in fv),
            crud
          }
        };
      }

      // Perform the patch now that the hrn is known
      personRequest.data.hrn = this._hrn;
      endpoint = `${endpoint}/${this._hrn}`;
      this.apiClient.setErrorEventDetails({ message: 'Huron patching error', object: { 
        hrn: this._hrn, 
        sourceIdentifier: personRequest.data?.sourceIdentifier 
      }});
      response = await this.apiClient.patch<PersonPushResponse>(endpoint, personRequest.data);
    }

    return { response };
  }

  public hrn = (): string | undefined => {
    return this._hrn;
  }
}