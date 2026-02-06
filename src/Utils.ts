
export const isEmpty = (obj: any): boolean => {
  if(obj == null || obj == undefined) {
    return true;
  }
  if(typeof obj === 'string' && obj.trim() === '') {
    return true;
  }
  if(Array.isArray(obj) && obj.length === 0) {
    return true;
  }
  if(typeof obj === 'object' && Object.keys(obj).length === 0) {
    return true;
  }
  return `${obj}`.trim() === '';
}

export const isNotEmpty = (obj: any): boolean => {
  return !isEmpty(obj);
}

export const anyEmpty = (...objs: any[]): boolean => {
  for(const obj of objs) {
    if(isEmpty(obj)) {
      return true;
    }
  }
  return false;
}

export const allEmpty = (...objs: any[]): boolean => {
  for(const obj of objs) {
    if(isNotEmpty(obj)) {
      return false;
    }
  }
  return true;
}

/**
 * Recursively iterate over an object and convert all null values to undefined.
 * This helps destructuring assignments where missing fields are expected to be undefined 
 * and default value assignment expressions are in use in the destructuring syntax.
 * @param obj 
 * @returns 
 */
export const nullsToUndefined = (obj: any): any => {
  if (obj === null) {
    return undefined;
  }
  if (typeof obj !== 'object' || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(nullsToUndefined);
  }
  if (obj.constructor === Object) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = nullsToUndefined(obj[key]);
      }
    }
    return result;
  }
  return obj;
}