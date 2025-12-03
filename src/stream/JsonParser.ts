import { Transform } from 'stream';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { pick } from 'stream-json/filters/Pick';

/**
 * Configuration for JsonParser
 */
export interface JsonParserConfig {
  /**
   * The path to extract array elements from, must end with [*] to indicate array streaming.
   * Examples: 'response[*]' (extract from response array), '[*]' (extract from root array)
   */
  extractPath: string;
}

/**
 * JsonParser - Parses streaming JSON and extracts objects at specified paths
 * Uses stream-json library for true incremental JSON parsing to enable memory-efficient processing
 * 
 * The extractPath must end with [*] to indicate which array elements should be streamed.
 * Examples: 'response[*]' extracts elements from the 'response' array,
 * '[*]' extracts elements from the root-level array.
 */
export class JsonParser extends Transform {
  private jsonParser: any;
  private pipeline: any;

  constructor(private config: JsonParserConfig) {
    super({ objectMode: true });

    // Create streaming JSON parser pipeline
    this.jsonParser = parser({ jsonStreaming: true });

    // Parse extractPath to separate the JSON path from the [*] array indicator
    const pathMatch = this.config.extractPath.match(/^(.+)\[\*\]$/);
    if (!pathMatch) {
      throw new Error(`extractPath must end with [*] to indicate array extraction: ${this.config.extractPath}`);
    }
    
    const jsonPath = pathMatch[1]; // The path without [*]
    
    if (jsonPath === '') {
      // extractPath is just '[*]' - stream the entire JSON as array elements
      this.pipeline = this.jsonParser.pipe(streamArray());
    } else {
      // extractPath is 'some.path[*]' - pick the path and stream array elements
      this.pipeline = this.jsonParser
        .pipe(pick({ filter: jsonPath }))
        .pipe(streamArray());
    }

    // Handle parsed objects ("data" is a standard axios field present in all responses)
    this.pipeline.on('data', (data: any) => {
      // stream-json emits objects with { key, value } structure for arrays
      if (data.value !== undefined) {
        this.push(data.value);
      }
    });

    this.pipeline.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  _transform(chunk: any, encoding: string, callback: Function): void {
    // Pass chunks directly to the streaming parser
    this.jsonParser.write(chunk);
    callback();
  }

  _flush(callback: Function): void {
    // Signal end of stream to parser
    this.jsonParser.end();
    // Wait for pipeline to finish processing
    this.pipeline.on('end', () => {
      callback();
    });
  }
}