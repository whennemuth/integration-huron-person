import { Config } from "./config/Config";

export type Cache<K, V> = {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): void;
  clear(): void;
};

export abstract class BasicCache implements Cache<string, string> {
  private cache: Map<string, string>;
  private static instance: BasicCache | undefined = undefined;

  constructor() {
    this.cache = new Map<string, string>();
  }

  /**
   * Get the singleton instance of the appropriate cache implementation.
   * @param cachePath Optional path for file system cache directory
   * @returns Singleton cache instance (in-memory for AWS Lambda, file system otherwise)
   */
  public static getInstance(config?: Config): BasicCache | undefined {
    if (!BasicCache.instance) {
      
      // Deconstruct environment variables and config values for cache settings
      const { AWS_LAMBDA_FUNCTION_NAME, IS_ECS_TASK, CACHE_ENABLED, CACHE_PATH, LANDSCAPE } = process.env;
      const { cache: { path, enabled=true } = {}, landscape=LANDSCAPE } = config || {};

      // Environment variables (if presesent) take precedence over config values for cache settings
      const cachePath = CACHE_PATH || path;
      const cacheEnabled = CACHE_ENABLED !== undefined ? 
        CACHE_ENABLED.toLowerCase() === 'true' : 
        enabled;

      if(!cacheEnabled) {
        console.log('Caching is disabled');
        return undefined;
      }
      
      if (cachePath) {       
        BasicCache.instance = new FileSystemCache(cachePath, landscape);
      }
      else if (AWS_LAMBDA_FUNCTION_NAME) {
        BasicCache.instance = new InMemoryCache();
      } 
      else if (IS_ECS_TASK === 'true') {
        BasicCache.instance = new InMemoryCache();
      }
    }
    return BasicCache.instance;
  }

  /** 
   * Reset the singleton instance (mainly for testing purposes)
   */
  public static resetInstance(): void {
    BasicCache.instance = undefined;
  }

  public get(key: string): string | undefined {
    return this.cache.get(key);
  }

  public set(key: string, value: string): BasicCache {
    if (value) {      
      this.cache.set(key, value);
    }
    return this;
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public delete(key: string): void {
    this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }
}

export class InMemoryCache extends BasicCache {
  constructor() {
    super();
  }
  public set(key: string, value: string): InMemoryCache {
    super.set(key, value);
    console.log(`InMemoryCache: Set key ${key}`);
    return this;
  }
}

/**
 * File system based cache implementation.
 * Stores cache data in a JSON file in the specified directory.
 */
export class FileSystemCache extends BasicCache {
  private path: string;
  constructor(dir:string = '/tmp', landscape?: string) {
    super();
    const landscapeSuffix = landscape ? `-${landscape}` : '';
    this.path = `${dir}/integration-cache${landscapeSuffix}.json`.replaceAll('//','/');
    // Ensure directory exists
    const fs = require('fs');
    const path = require('path');
    const dirPath = path.dirname(this.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    this.loadFromFile();
  }

  public set(key: string, value: string): FileSystemCache {
    // Only persist and log if the value is actually changing
    const existingValue = this.get(key);
    if (existingValue !== value) {
      super.set(key, value);
      this.persistToFile();
      console.log(`FileSystemCache: Set key ${key}`);
    }
    return this;
  }

  public delete(key: string): void {
    super.delete(key);
    this.persistToFile();
    console.log(`FileSystemCache: Deleted key ${key}`);
  }

  public clear(): void {
    super.clear();
    this.persistToFile();
  }

  private persistToFile(): void {
    const fs = require('fs');
    const data: { [key: string]: string } = {};
    this['cache'].forEach((value: string, key: string) => {
      data[key] = value;
    });
    fs.writeFileSync(this.path, JSON.stringify(data), 'utf8');
  }

  public loadFromFile(): void {
    const fs = require('fs');
    if (fs.existsSync(this.path)) {
      const fileContent = fs.readFileSync(this.path, 'utf8');
      const data = JSON.parse(fileContent);
      for (const key in data) {
        // Use super.set to bypass file persistence during load
        super.set(key, data[key]);
      }
    }
  }
}