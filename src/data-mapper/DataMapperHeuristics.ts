import { isEmpty } from "../Utils"

export enum SOURCE { SAP = 'SAP', CS = 'Campus Solutions', VDS = 'VDS', DARS = 'DARS' };

export enum EMAIL_TYPE { UNIVERSITY = 'University', PERSONAL = 'Personal', BUEMAIL = 'BUEM' };

/**
 * The CDM spec is defines certain person record fields, but the values defined for it to take do
 * not match exactly what is observed in the actual data. Since what is in the observed data does 
 * not match the spec, any assumption that what is seen in the observed data is guaranteed to be
 * consistent cannot be relied upon. Therefore, since there is enough commonality between the
 * two values (observed & spec) to base a match on the appearance of certain root terms within 
 * the larger values of both terms being compared, a heuristic approach seems reasonable.
 */
export class DataMapperHeuristics {
  constructor(private _term: any) {}

  public getSource = (): SOURCE | undefined => {
    if(isEmpty(this._term)) {
      return undefined;
    }

    const term = String(this._term).trim();

    // Try direct matches first, as these seem to be the most prevalent values in observed data.
    if(SOURCE[term as keyof typeof SOURCE]) {
      return SOURCE[term as keyof typeof SOURCE];
    }

    const lower = `${term.toLowerCase().trim()}`;

    // Try variants in case, abbreviations, clipping, acronyms, aliases, etc. next.

    // Campus Solutions
    if(lower === 'cs') {
      return SOURCE.CS;
    } 
    if(lower.includes('campus') && lower.includes('solutions')) {
      return SOURCE.CS;
    }

    // SAP
    if(lower === 'sap') {
      return SOURCE.SAP;
    }
    const terms = lower.split(/[\s,]+/);
    if(terms.includes('sap')) {
      return SOURCE.SAP;
    }

    // VDS
    if(lower.includes('vds')) {
      return SOURCE.VDS;
    }

    // DARS
    if(lower.includes('dars') || lower.includes('bbec')) {
      return SOURCE.DARS;
    }

    return undefined;
  }

  public getEmailType = (): EMAIL_TYPE | undefined => {
    if(isEmpty(this._term)) {
      return undefined;
    }
    const lower = `${String(this._term).toLowerCase().trim()}`;
    if(lower.includes('univ')) {
      return EMAIL_TYPE.UNIVERSITY;
    }
    if(lower.includes('pers')) {
      return EMAIL_TYPE.PERSONAL;
    }
    if(lower.includes('buem')) {
      return EMAIL_TYPE.BUEMAIL;
    }
    return undefined;
  }
}


/**
 * A person may is either an employee, student, affiliate, etc. it will be because the corresponding
 * section of the person record (employeeInfo, studentInfo, affiliateInfo, etc.) contains non-empty 
 * values. Therefore, the presence of non-empty values within those sections can be used as a 
 * heuristic to determine the person's type(s).
 */
export class PersonHeuristics {
  constructor(private _person: any) {}

  private isNotEmpty = (obj: any): boolean => {
    let propertyCount = 0;
    Object.keys(obj).forEach(k => {
      const val = obj[k];
      if( ! isEmpty(val) ) {
        propertyCount++;
      }
    });
    return propertyCount > 0;
  }

  public isEmployee = (): boolean => {
    const { employeeInfo = {}} = this._person;
    return this.isNotEmpty(employeeInfo);
  }

  public isStudent = (): boolean => {
    const { studentInfo = {}} = this._person;
    return this.isNotEmpty(studentInfo);
  }

  public isAffiliate = (): boolean => {
    const { affiliateInfo = {}} = this._person;
    return this.isNotEmpty(affiliateInfo);
  }

  public isFaculty = (): boolean => {
    const { facultyInfo = {}} = this._person;
    return this.isNotEmpty(facultyInfo);
  }

  public isConstituent = (): boolean => {
    const { constituentInfo = {}} = this._person;
    return this.isNotEmpty(constituentInfo);
  }
}