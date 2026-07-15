import { isEmpty, isNotEmpty, removeNullValues as removeNulls } from "../Utils";
import { PersonHeuristics } from "./DataMapperHeuristics";

export enum PERSON_TYPE { EMPLOYEE = 'Employee', STUDENT = 'Student', AFFILIATE = 'Affiliate' };

export type TitleMapperParams = { 
  person: any, removeNullValues?: boolean, personType?: PERSON_TYPE 
};

export const TitleMapper = ({ person, removeNullValues = true, personType }: TitleMapperParams): { getTitle: () => any } => {

  if(removeNullValues) {
    person = removeNulls(person);
  }

  const truncate = (title: string): string => {
    const maxLength = 255; // Huron max length for title field
    return title.length > maxLength ? title.substring(0, maxLength) : title;
  }

  const { employeeInfo: { positions = []} = {} } = person;

  const { EMPLOYEE, STUDENT, AFFILIATE } = PERSON_TYPE;

  const getEmployeeTitle = (): string | undefined => {
    for (const pos of positions) {
      const { positionInfo: { BasicData: { position: { description, shortDescription } = {} } = {}} = {} } = pos;
      if(isNotEmpty(description)) {
        return truncate(`${description}`.trim());
      }
      // Only use shortDescription if description is empty
      if(isEmpty(description) && isNotEmpty(shortDescription)) {
        return truncate(`${shortDescription}`.trim());
      }
    }
    return undefined;
  }

  switch(personType) {
    case EMPLOYEE:
      return {
        getTitle: () => getEmployeeTitle()
      }
    case STUDENT:
      return {
        getTitle: () => 'Student'
      }
    case AFFILIATE:
      return {
        getTitle: () => 'University Affiliate'
      }
    default:
      // Priority 1: Employee title from position description (fallback to shortDescription if description is empty)
      const employeeTitle = getEmployeeTitle();
      if(employeeTitle) {
        return {
          getTitle: () => employeeTitle
        }
      }

      const personHeuristics = new PersonHeuristics(person);

      // Priority 2: Student fixed value
      if(personHeuristics.isStudent()) {
        return {
          getTitle: () => 'Student'
        }
      }

      // Priority 3: Affiliate fixed value
      if(personHeuristics.isAffiliate()) {
        return {
          getTitle: () => 'University Affiliate'
        }
      }
  }

  // No title found
  return {
    getTitle: () => undefined
  }

}
