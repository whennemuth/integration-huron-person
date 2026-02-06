import { isNotEmpty, nullsToUndefined } from "../Utils";

export const TitleMapper = (person: any, convertNullstoIndefined:boolean = true): { getTitle: () => any } => {

  if(convertNullstoIndefined) {
    person = nullsToUndefined(person);
  }

  const { employeeInfo: { positions = []} = {} } = person;

  for (const pos of positions) {
    const { positionInfo: { BasicData: { position: { description } = {} } = {}} = {} } = pos;
    if(isNotEmpty(description)) {
      return {
        getTitle: () => `${description}`.trim()
      }
    }
  }
  return {
    getTitle: () => undefined
  }
}