/**
 * Custom URL parameter serializer for Huron API
 * 
 * The Huron API expects brackets and special characters in parameter names to remain unencoded,
 * while values (especially HRNs) need proper encoding. This serializer provides that behavior.
 * 
 * Example output:
 *   filter[roles]=eq:hrn%3Ahrs%3Alists%3Aroles%2Fprimary
 *   pagination[offset]=0
 *   include=firstName,lastName,roles
 */

/**
 * Serialize parameters object into URL query string with Huron API-compatible encoding
 * 
 * @param params - Object containing query parameters
 * @returns Query string without leading '?'
 * 
 * Encoding rules:
 * - Parameter names (keys): NOT encoded - preserves brackets, colons, exclamation marks
 * - Filter values: Preserve comparison operator (eq:, in:, etc.), encode the value part
 * - Include values: NOT encoded - preserves commas in field lists
 * - Other values: Encoded using encodeURIComponent
 */
export function serializeParams(params: Record<string, any>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    // Convert value to string
    const valueStr = String(value);

    // Handle different parameter types
    let encodedValue: string;

    if (key.startsWith('filter[') || key.startsWith('filter%5B')) {
      // Filter parameter: preserve comparison operator, encode the value part
      encodedValue = encodeFilterValue(valueStr);
    } else if (key === 'include') {
      // Include parameter: preserve commas in field list
      encodedValue = valueStr; // Don't encode commas
    } else if (key.startsWith('pagination[') || key.startsWith('pagination%5B')) {
      // Pagination parameter: encode normally (numbers don't need encoding but handle edge cases)
      encodedValue = encodeURIComponent(valueStr);
    } else if (key === 'sort') {
      // Sort parameter: preserve dash prefix for descending, don't encode field name
      encodedValue = valueStr; // Field names like "firstName" or "-firstName" don't need encoding
    } else {
      // Default: encode the value
      encodedValue = encodeURIComponent(valueStr);
    }

    // Key is NOT encoded - preserves brackets, colons, exclamation marks
    parts.push(`${key}=${encodedValue}`);
  }

  return parts.join('&');
}

/**
 * Encode filter value while preserving comparison operator
 * 
 * @param value - Filter value in format "operator:value"
 * @returns Encoded filter value
 * 
 * Examples:
 *   "eq:true" -> "eq:true"
 *   "eq:hrn:hrs:lists:roles/primary" -> "eq:hrn%3Ahrs%3Alists%3Aroles%2Fprimary"
 *   "in:value1,value2,value3" -> "in:value1,value2,value3" (commas preserved for 'in' operator)
 */
function encodeFilterValue(value: string): string {
  // Match pattern: operator:value
  const match = value.match(/^(eq|neq|lt|lte|gt|gte|null|in):(.*)$/);
  
  if (!match) {
    // No operator found, encode entire value
    return encodeURIComponent(value);
  }

  const [, operator, valuePart] = match;

  if (!valuePart) {
    // Just the operator (like "null:")
    return `${operator}:`;
  }

  // Special handling for 'in' operator - preserve commas in list
  if (operator === 'in') {
    // Split by comma, encode each part, rejoin with comma
    const values = valuePart.split(',');
    const encodedValues = values.map(v => encodeValuePart(v.trim()));
    return `${operator}:${encodedValues.join(',')}`;
  }

  // For other operators, encode the value part
  const encodedValuePart = encodeValuePart(valuePart);
  return `${operator}:${encodedValuePart}`;
}

/**
 * Encode value part of a filter (after the comparison operator)
 * 
 * @param value - Value to encode
 * @returns Encoded value
 * 
 * Special handling:
 * - Simple values (true, false, numbers): not encoded
 * - HRNs: encode colons and slashes
 * - Other strings: fully encoded
 */
function encodeValuePart(value: string): string {
  // Simple values that don't need encoding
  if (value === 'true' || value === 'false' || /^\d+$/.test(value)) {
    return value;
  }

  // HRNs need special encoding: encode colons and slashes
  // HRN format: hrn:hrs:type:identifier
  if (value.startsWith('hrn:') || value.startsWith('hrn%3A')) {
    return value
      .replace(/:/g, '%3A')  // Encode colons
      .replace(/\//g, '%2F'); // Encode slashes
  }

  // Default: encode the entire value
  return encodeURIComponent(value);
}
