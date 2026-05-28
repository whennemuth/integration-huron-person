import { CrudOperation, FieldSet, PushOneParms, SinglePushResult, Status } from "integration-core";
import { Config, TargetPersonDeleteType } from "../config/Config";
import { ApiClientForJWT } from "./ApiClientForJWT";
import { HuronPerson } from "./crud/Person";
import { ReadPerson } from "./crud/ReadPerson";
import { getPersonIdentifierInfo, HuronPersonDataTarget, PersonPushRequest, PersonPushResponse } from "./PersonDataTarget";

export type HuronPersonDataTargetDeleteConfig = {
  config: Config;
  apiClient: ApiClientForJWT;
  pushOneParms: PushOneParms;
}
  
export type DeletePersonResult = { 
  response?: PersonPushResponse | any | {}, 
  result?: SinglePushResult 
};

/**
 * Handles deletion of Person records in Huron. Since Huron does not support hard deletes, this class 
 * implements soft delete by setting active: false on the Person record. It also includes safeguards to 
 * prevent the API user from accidentally deleting themselves, by looking up the API user's Person 
 * record in Huron and comparing it to the target of the delete operation.
 */
export class HuronPersonDataTargetDelete {
  private config: Config;
  private apiClient: ApiClientForJWT;
  private apiUserLookup: { lookupResult: HuronPerson | undefined };
  private personRequest: PersonPushRequest;
  private data: FieldSet;
  private crud: CrudOperation;
  private _hrn: string | undefined;

  constructor(private params: HuronPersonDataTargetDeleteConfig) {
    const { config, apiClient, pushOneParms: { data, crud } } = params;
    this.config = config;
    this.apiClient = apiClient;
    this.data = data;
    this.crud = crud; 
    this.personRequest = HuronPersonDataTarget.convertFieldSetToRequest(data, crud);
  }

  /**
   * Lookup the API user as a Person record in Huron, to get their HRN and other details. 
   * This is used for auditing and to prevent the API user from accidentally deleting themselves.
   * @returns The Person record of the API user, or undefined if it cannot be determined
   */
  private getApiUser = async (): Promise<HuronPerson | undefined> => {
    if (this.apiUserLookup) {
      return this.apiUserLookup.lookupResult;
    }
    const userId = this.apiClient.getUserId();
    if (!userId) {
      console.warn('Unable to determine API user ID from token. API user-specific operations will not be possible.');
      return undefined;
    } 
    const reader = new ReadPerson(this.config);
    const retval = await reader.readPersonByUserId(userId);
    if(retval.length === 0) {
      console.warn(`API user with ID ${userId} not found in Huron. API user-specific operations will not be possible.`);
      this.apiUserLookup = { lookupResult: undefined };
      return undefined;
    }
    this.apiUserLookup = { lookupResult: retval[0] };
    return this.apiUserLookup.lookupResult;
  }

  public deletePerson = async (): Promise<DeletePersonResult> => {
    let endpoint = this.config.dataTarget.personsPath;
    
    // Check first if the api user is trying to delete themselves and prevent it.
    const { personRequest, apiClient, getApiUser, data, crud } = this;
    const apiUserId = apiClient.getUserId();
    if(apiUserId) {
      const apiUser = await getApiUser();
      if(apiUser) {
        const { id, sourceIdentifier } = apiUser || {};
        const { 
          fullData: { id: id2, sourceIdentifier: sourceIdentifier2 } = {},              
        } = personRequest;
        if ((id && id === id2) || (sourceIdentifier && sourceIdentifier === sourceIdentifier2)) {
          const errorMsg = '⊘ API user attempted to delete/deactivate themselves. This operation is not allowed and has been prevented.';
          console.error(errorMsg);
          return { 
            result: {
              status: Status.FAILURE,
              message: errorMsg,
              timestamp: new Date(),
              primaryKey: [{ id: id2, sourceIdentifier: sourceIdentifier2 || sourceIdentifier2 }],
              crud
            }
          };  
        }
      }
    }
    
    let retval: DeletePersonResult = {};
    console.log(`Soft deleting single person record with PATCH operation:`, getPersonIdentifierInfo(data));
    // DELETE: Implement as soft delete by setting active: false
    // Extract HRN from the original fieldSet data
    let hrn = data.fieldValues.find((fv: any) => fv.hrn)?.hrn as string | undefined;
    if (hrn) {
      this._hrn = hrn;
      const { SOFT, HARD, LOG, NONE } = TargetPersonDeleteType;
      const deleteType = this.config.dataTarget.personDeleteType || SOFT; // Get from config
      
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
        this.apiClient.setErrorEventDetails({ message: 'Huron deletion error', object: { 
          hrn: hrn, 
          sourceIdentifier: data.fieldValues.find((fv: any) => fv.sourceIdentifier)?.sourceIdentifier 
        }});
        let response = await this.apiClient.patch<PersonPushResponse>(endpoint, softDeleteData);
        retval = { response };
      }
    } else {
      // HRN not directly available; attempt fallback lookup by sourceIdentifier
      const sourceIdentifier = data.fieldValues.find((fv: any) => fv.sourceIdentifier)?.sourceIdentifier as string | undefined;
      if (sourceIdentifier) {
        console.log(`HRN not found in fieldSet for DELETE operation. Attempting fallback lookup by sourceIdentifier: ${sourceIdentifier}`);
        const reader = new ReadPerson(this.config);
        try {
          const lookupResult: HuronPerson[] = await reader.readPersonByHailMary(sourceIdentifier);
          hrn = lookupResult?.[0]?.hrn;
          if (hrn) {
            this._hrn = hrn;
            const { SOFT, HARD, LOG, NONE } = TargetPersonDeleteType;
            const deleteType = this.config.dataTarget.personDeleteType || SOFT; // Get from config
            
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
              this.apiClient.setErrorEventDetails({ message: 'Huron deletion error', object: { 
                hrn: hrn, 
                sourceIdentifier: sourceIdentifier
              }});
              let response = await this.apiClient.patch<PersonPushResponse>(endpoint, softDeleteData);
              retval = { response };
            }
          } else {
            const errorMsg = 'Cannot perform soft delete: HRN lookup by sourceIdentifier failed';
            console.error(`${errorMsg}:`, getPersonIdentifierInfo(data));
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
          const errorMsg = 'Cannot perform soft delete: HRN lookup by sourceIdentifier encountered an error';
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
        const errorMsg = 'Cannot perform soft delete: no HRN or sourceIdentifier available for person';
        console.error(`${errorMsg}:`, getPersonIdentifierInfo(data));
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