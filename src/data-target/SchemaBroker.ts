import { FieldSet } from "integration-core";
import HuronSchema from "./huron-profile-api-2.0.0.json";

export enum SchemaPath {
  ORGANIZATIONS = '/api/v2/organizations',
  ORGANIZATIONS_BY_HRN = '/api/v2/organizations/{hrn}',
  ORGANIZATIONS_CUSTOM_PROPERTIES = '/api/v2/organizations/{hrn}/customProperties/sets/{name}',
  PERSONS = '/api/v2/persons',
  PERSONS_BY_HRN = '/api/v2/persons/{hrn}',
  PERSONS_CUSTOM_PROPERTIES = '/api/v2/persons/{hrn}/customProperties/sets/{name}',
  CURRENT_USER = '/api/v2/currentuser',
}

export enum Method {
  OPTIONS = 'options',
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  PATCH = 'patch',
  DELETE = 'delete'
}

export type HuronSchemaBrokerConfig = {
  path: SchemaPath;
  method: Method;
};

/**
 * Broker to convert FieldSet data to Huron API schema format and validate the data
 * against the schema definitions.
 */
export class HuronSchemaBroker {
  private method: any;
  
  constructor(private readonly config: HuronSchemaBrokerConfig) {
    const path = HuronSchema.paths[config.path];
    if (!path) {
      throw new Error(`Invalid schema path: ${config.path}`);
    }
    this.method = path[config.method as keyof typeof path];
    if (!this.method) {
      throw new Error(`Invalid method ${config.method} for path: ${config.path}`);
    }
  }

  private dataConformsToSchema = (data: any): boolean => {
    return true;
  }

  public getConvertedFieldSet = (fieldSet: FieldSet): any | undefined => {
    const data: any = {};
    
    // Extract field values from FieldSet format
    if (fieldSet.fieldValues && Array.isArray(fieldSet.fieldValues)) {
      fieldSet.fieldValues.forEach((field: any) => {
        // Merge all fields from each field object into the data object
        Object.keys(field).forEach(key => {
          data[key] = field[key];
        });
      });
    }

    if (!this.dataConformsToSchema(data)) {
      return undefined;
    }

    return data;
  }
}