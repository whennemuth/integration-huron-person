
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
 * Recursively iterate over an object and remove all properties with null values.
 * For objects, properties with null values are completely removed (not set to undefined).
 * For arrays, null values are converted to undefined to maintain array indices.
 * This helps destructuring assignments where missing fields are expected to be undefined 
 * and default value assignment expressions are in use in the destructuring syntax.
 * @param obj 
 * @returns 
 */
export const removeNullValues = (obj: any): any => {
  if (obj === null) {
    return undefined;
  }
  if (typeof obj !== 'object' || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeNullValues);
  }
  if (obj.constructor === Object) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const processedValue = removeNullValues(obj[key]);
        // Keep property if processed value is not undefined (removes null and undefined)
        if (processedValue !== undefined) {
          result[key] = processedValue;
        }
      }
    }
    return result;
  }
  return obj;
}

/**
 * Recursively iterate over an object and remove all properties with empty values.
 * For objects, properties with empty values (null, undefined, empty string, whitespace, empty arrays, etc.)
 * are completely removed (not set to undefined).
 * For arrays, empty values are filtered out entirely.
 * This helps with data cleansing and ensures clean JSON serialization without null/undefined values.
 * @param obj 
 * @returns 
 */
export const removeEmptyValues = (obj: any): any => {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  // Handle non-plain objects (Date, RegExp, Function, etc.) - return as-is
  if (typeof obj === 'object' && obj.constructor !== Object && !Array.isArray(obj)) {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    const result = obj
      .map(item => {
        const processed = removeEmptyValues(item);
        // Convert empty plain objects to undefined
        if (processed !== null && typeof processed === 'object' && 
            processed.constructor === Object && Object.keys(processed).length === 0) {
          return undefined;
        }
        return processed;
      })
      .filter(item => item !== undefined);  // Remove all undefined values
    // Return undefined for empty arrays
    return result.length === 0 ? undefined : result;
  }
  
  // Handle plain objects
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const processedValue = removeEmptyValues(obj[key]);
        
        // Don't add properties with undefined values or empty plain objects
        const isEmptyPlainObject = processedValue !== null && typeof processedValue === 'object' && 
                                   processedValue.constructor === Object && Object.keys(processedValue).length === 0;
        if (processedValue !== undefined && !isEmptyPlainObject) {
          result[key] = processedValue;
        }
      }
    }
    // Return undefined for empty objects
    return Object.keys(result).length === 0 ? undefined : result;
  }
  
  // Handle primitives - check if empty
  return isEmpty(obj) ? undefined : obj;
}

/**
 * Creates a deep clone of an object, avoiding mutations of the original.
 * Handles arrays, plain objects, Dates, and primitives.
 * @param obj - The object to clone
 * @returns A deep copy of the object
 */
export const deepClone = <T>(obj: T): T => {
  // Handle primitives and null/undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // Handle Array
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  // Handle plain objects
  if (obj.constructor === Object) {
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone((obj as any)[key]);
      }
    }
    return cloned as T;
  }

  // For other types (RegExp, Map, Set, etc.), return as is
  // These are less common in typical field value structures
  return obj;
}

export const debugLog = (o:any, msg?:string) => {
  if(process.env.DEBUG == 'true') {
    log(o, msg);
  }
}

export const serializeObject = (o:any, seen = new Set()):any => {
  if (o && typeof o === 'object') {
    if (seen.has(o)) return '[Circular]';
    seen.add(o);

    if (Array.isArray(o)) return o.map(item => serializeObject(item, seen));
    return Object.fromEntries(Object.entries(o).map(([key, value]) => [key, serializeObject(value, seen)]));
  }
  return o;
}

const toConsole = (o:any, out:Function, msg?:string) => {
  const output = (suffix:string) => {
    if(msg) msg = msg.endsWith(': ') ? msg : `${msg}: `;
    out(msg ? `${msg}${suffix}` : suffix);
  }
  if(o instanceof Error) {
    console.error(msg);
    console.error(o);
    return;
  }
  if(o instanceof Object) {
    output(JSON.stringify(serializeObject(o), null, 2));
    return;
  }
  output(`${o}`);
}

export const log = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.log(s), msg);
}

export const warn = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.warn(s), msg);
}

export const error = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.error(s), msg);
}

export const isABuid = (id:string) => /^U[0-9]{8,9}$/.test(id);
