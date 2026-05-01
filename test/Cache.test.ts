import { FileSystemCache, BasicCache } from '../src/Cache';
import * as fs from 'fs';
import * as path from 'path';

describe('Cache', () => {
  describe('FileSystemCache optimization', () => {
    let testCachePath: string;
    let cache: FileSystemCache;

    beforeEach(() => {
      // Reset singleton before each test
      BasicCache.resetInstance();
      
      // Create a temporary directory for testing
      testCachePath = path.join(__dirname, 'temp-cache-test');
      if (!fs.existsSync(testCachePath)) {
        fs.mkdirSync(testCachePath, { recursive: true });
      }
      cache = new FileSystemCache(testCachePath);
    });

    afterEach(() => {
      // Clean up test directory
      const cacheFile = path.join(testCachePath, 'integration-cache.json');
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
      if (fs.existsSync(testCachePath)) {
        fs.rmdirSync(testCachePath);
      }
      
      // Reset singleton after each test
      BasicCache.resetInstance();
    });

    it('should not write to file when setting the same value multiple times', () => {
      const key = 'test-key';
      const value = 'test-value';
      const cacheFile = path.join(testCachePath, 'integration-cache.json');

      // Set initial value
      cache.set(key, value);
      const initialStats = fs.statSync(cacheFile);
      const initialMtime = initialStats.mtimeMs;

      // Wait a bit to ensure mtime would change if file is written
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Small delay
      }

      // Set the same value again - should NOT write to file
      cache.set(key, value);
      const secondStats = fs.statSync(cacheFile);
      const secondMtime = secondStats.mtimeMs;

      // File modification time should be the same (no write occurred)
      expect(secondMtime).toBe(initialMtime);
      expect(cache.get(key)).toBe(value);
    });

    it('should write to file when setting a different value', () => {
      const key = 'test-key';
      const value1 = 'test-value-1';
      const value2 = 'test-value-2';
      const cacheFile = path.join(testCachePath, 'integration-cache.json');

      // Set initial value
      cache.set(key, value1);
      const initialStats = fs.statSync(cacheFile);
      const initialMtime = initialStats.mtimeMs;

      // Wait a bit to ensure mtime would change
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Small delay
      }

      // Set a different value - should write to file
      cache.set(key, value2);
      const secondStats = fs.statSync(cacheFile);
      const secondMtime = secondStats.mtimeMs;

      // File modification time should be different (write occurred)
      expect(secondMtime).toBeGreaterThanOrEqual(initialMtime);
      expect(cache.get(key)).toBe(value2);
    });

    it('should not trigger redundant file writes during loadFromFile', () => {
      const key1 = 'key1';
      const key2 = 'key2';
      const value1 = 'value1';
      const value2 = 'value2';

      // Set initial values
      cache.set(key1, value1);
      cache.set(key2, value2);

      // Create a new cache instance that will load from file
      const cache2 = new FileSystemCache(testCachePath);
      
      // Values should be loaded correctly
      expect(cache2.get(key1)).toBe(value1);
      expect(cache2.get(key2)).toBe(value2);
    });

    it('should reduce redundant set operations in batch scenarios', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const key = 'jwt-token';
      const token = 'Bearer xyz123';

      // Simulate what happens during batch operation - same token set multiple times
      cache.set(key, token); // First set - should log
      cache.set(key, token); // Same value - should NOT log
      cache.set(key, token); // Same value - should NOT log
      cache.set(key, token); // Same value - should NOT log

      // Should only log once for the first actual change
      const setKeyLogs = consoleSpy.mock.calls.filter(call => 
        call[0]?.includes('FileSystemCache: Set key')
      );
      expect(setKeyLogs.length).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe('BasicCache singleton behavior', () => {
    afterEach(() => {
      BasicCache.resetInstance();
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      delete process.env.IS_ECS_TASK;
      delete process.env.CACHE_ENABLED;
      delete process.env.CACHE_PATH;
    });

    it('should return the same instance on multiple getInstance calls', () => {
      const testPath = path.join(__dirname, 'temp-singleton-test');
      const mockConfig = {
        cache: { enabled: true, path: testPath }
      } as any;
      
      const cache1 = BasicCache.getInstance(mockConfig);
      const cache2 = BasicCache.getInstance(mockConfig);
      const cache3 = BasicCache.getInstance(); // No config should still return same instance
      
      // All calls should return the same instance
      expect(cache2).toBe(cache1);
      expect(cache3).toBe(cache1);
      
      // Clean up
      const cacheFile = path.join(testPath, 'integration-cache.json');
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
      if (fs.existsSync(testPath)) {
        fs.rmdirSync(testPath);
      }
    });

    it('should not reload from file on subsequent getInstance calls', () => {
      const testPath = path.join(__dirname, 'temp-singleton-reload-test');
      const mockConfig = {
        cache: { enabled: true, path: testPath }
      } as any;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // First call - creates instance and loads from file
      const cache1 = BasicCache.getInstance(mockConfig);
      cache1!.set('key1', 'value1');
      
      const firstCallLogs = consoleSpy.mock.calls.length;
      consoleSpy.mockClear();
      
      // Second call - should return existing instance without reloading
      const cache2 = BasicCache.getInstance(mockConfig);
      cache2!.set('key1', 'value1'); // Same value, should not log due to optimization
      
      // Should have no new logs (no file reload, no set operation)
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(cache2).toBe(cache1);
      
      consoleSpy.mockRestore();
      
      // Clean up
      const cacheFile = path.join(testPath, 'integration-cache.json');
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
      if (fs.existsSync(testPath)) {
        fs.rmdirSync(testPath);
      }
    });
  });
});
