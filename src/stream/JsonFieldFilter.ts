import { Transform } from 'stream';

/**
 * JsonFieldFilter - Filters fields from JSON objects during streaming
 * Supports hierarchical field paths with dot notation and array indexing with [*]
 */
export class JsonFieldFilter extends Transform {
  constructor(
    private fieldsToKeep: string[], 
    private customFilterCase?: (source: any, target?: any) => void
) {
    super({ objectMode: true });
  }

  _transform(obj: any, encoding: string, callback: Function): void {
    if (typeof obj === 'object' && obj !== null) {
      const filtered: any = {};
      this.fieldsToKeep.forEach(fieldPath => {
        this.extractField(obj, fieldPath, filtered);
      });
      if(this.customFilterCase) {
        this.customFilterCase(obj, filtered);
      }
      // Clean up empty structures that may have been created for invalid paths
      this.cleanupEmptyStructures(filtered);
      this.push(filtered);
    } else {
      this.push(obj);
    }
    callback();
  }

  _flush(callback: Function): void {
    callback();
  }

  /**
   * Extracts a field from the source object using a hierarchical path
   * Supports dot notation and array indexing with [*]
   */
  private extractField(source: any, fieldPath: string, target: any): void {
    // Parse the path properly, treating [*] as separate tokens
    const pathParts = this.parsePath(fieldPath);
    this.buildStructureFromPath(source, pathParts, 0, target, pathParts);
  }

  private parsePath(path: string): string[] {
    // Split on dots, but keep [*] and [number] as separate tokens
    const parts: string[] = [];
    const segments = path.split('.');
    
    for (const segment of segments) {
      if (segment.includes('[*]')) {
        // Handle cases like "names[*]" -> ["names", "*"]
        const base = segment.replace('[*]', '');
        if (base) parts.push(base);
        parts.push('*');
      } else if (segment.includes('[') && segment.includes(']')) {
        // Handle cases like "positions[0]" -> ["positions", "0"]
        const bracketIndex = segment.indexOf('[');
        const base = segment.substring(0, bracketIndex);
        const indexPart = segment.substring(bracketIndex + 1, segment.indexOf(']'));
        if (base) parts.push(base);
        parts.push(indexPart);
      } else {
        parts.push(segment);
      }
    }
    
    return parts;
  }

  private buildStructureFromPath(source: any, pathParts: string[], index: number, target: any, fullPath: string[]): void {
    if (index >= pathParts.length) return;

    const part = pathParts[index];
    const isLast = index === pathParts.length - 1;

    if (part === '*') {
      // Handle array indexing - we expect the source to be an array here
      if (Array.isArray(source)) {
        // Check if target is already an array
        if (!Array.isArray(target)) {
          // Create target array with same length
          const targetArray: any[] = [];
          source.forEach((sourceItem, i) => {
            targetArray[i] = {};
            this.buildStructureFromPath(sourceItem, pathParts, index + 1, targetArray[i], fullPath);
          });
          // Replace the target with the array
          Object.keys(target).forEach(key => delete target[key]);
          target.length = 0;
          target.push(...targetArray);
        } else {
          // Target is already an array, merge into existing items
          source.forEach((sourceItem, i) => {
            if (target[i] === undefined) {
              target[i] = {};
            }
            this.buildStructureFromPath(sourceItem, pathParts, index + 1, target[i], fullPath);
          });
        }
      }
    } else if (!isNaN(Number(part))) {
      // Handle specific array index - part is a number like "0", "1", "2"
      const arrayIndex = Number(part);
      if (Array.isArray(source) && arrayIndex >= 0 && arrayIndex < source.length) {
        const sourceItem = source[arrayIndex];
        
        if (isLast) {
          // Last part - set the value at the specific index
          target[arrayIndex] = sourceItem;
        } else {
          // Intermediate part - ensure structure exists at the specific index
          if (!target[arrayIndex]) {
            target[arrayIndex] = {};
          }
          this.buildStructureFromPath(sourceItem, pathParts, index + 1, target[arrayIndex], fullPath);
        }
      }
      // If index is out of bounds, don't modify target
    } else {
      // Handle regular property
      if (source && typeof source === 'object' && source.hasOwnProperty(part)) {
        const sourceValue = source[part];

        if (isLast) {
          // Last part - set the value
          target[part] = sourceValue;
        } else {
          // Intermediate part - ensure structure exists
          if (!target[part]) {
            const nextPart = pathParts[index + 1];
            if (nextPart === '*' || !isNaN(Number(nextPart))) {
              // Next part is array access (either * or specific index), so create array
              target[part] = [];
            } else {
              // Next part is object, create object
              target[part] = {};
            }
          }
          this.buildStructureFromPath(sourceValue, pathParts, index + 1, target[part], fullPath);
        }
      }
    }
  }

  private cleanupEmptyStructures(obj: any): void {
    if (typeof obj !== 'object' || obj === null) return;

    const keys = Object.keys(obj);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      const value = obj[key];
      
      if (Array.isArray(value)) {
        // Remove empty arrays
        if (value.length === 0) {
          delete obj[key];
        } else {
          // Recursively clean array elements
          value.forEach(item => {
            if (item && typeof item === 'object') {
              this.cleanupEmptyStructures(item);
            }
          });
          // Remove arrays that only contain undefined/null/empty objects
          if (value.every(item => item === undefined || item === null || 
              (typeof item === 'object' && item !== null && Object.keys(item).length === 0))) {
            delete obj[key];
          }
        }
      } else if (value && typeof value === 'object') {
        // Recursively clean nested objects
        this.cleanupEmptyStructures(value);
        // Remove empty objects
        if (Object.keys(value).length === 0) {
          delete obj[key];
        }
      }
    }
  }
}