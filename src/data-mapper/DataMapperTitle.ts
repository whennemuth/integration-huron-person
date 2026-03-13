import { isEmpty, isNotEmpty, removeNullValues as removeNulls } from "../Utils";
import { PersonHeuristics } from "./DataMapperHeuristics";

export const TitleMapper = (person: any, removeNullValues:boolean = true): { getTitle: () => any } => {

  if(removeNullValues) {
    person = removeNulls(person);
  }

  const truncate = (title: string): string => {
    const maxLength = 255; // Huron max length for title field
    return title.length > maxLength ? title.substring(0, maxLength) : title;
  }

  const { employeeInfo: { positions = []} = {} } = person;

  // Priority 1: Employee title from position description (fallback to shortDescription if description is empty)
  for (const pos of positions) {
    const { positionInfo: { BasicData: { position: { description, shortDescription } = {} } = {}} = {} } = pos;
    if(isNotEmpty(description)) {
      return {
        getTitle: () => truncate(`${description}`.trim())
      }
    }
    // Only use shortDescription if description is empty
    if(isEmpty(description) && isNotEmpty(shortDescription)) {
      return {
        getTitle: () => truncate(`${shortDescription}`.trim())
      }
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

  // No title found
  return {
    getTitle: () => undefined
  }
}
