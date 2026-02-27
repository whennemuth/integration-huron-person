import { isNotEmpty, nullsToUndefined } from "../Utils";
import { PersonHeuristics } from "./DataMapperHeuristics";

export const TitleMapper = (person: any, convertNullstoUndefined:boolean = true): { getTitle: () => any } => {

  if(convertNullstoUndefined) {
    person = nullsToUndefined(person);
  }

  const { employeeInfo: { positions = []} = {} } = person;

  // Priority 1: Employee title from position shortDescription
  for (const pos of positions) {
    const { positionInfo: { BasicData: { position: { shortDescription } = {} } = {}} = {} } = pos;
    if(isNotEmpty(shortDescription)) {
      return {
        getTitle: () => `${shortDescription}`.trim()
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
