/**
 * Generic retry strategy contract for transient API failures.
 */
export interface ApiRetryStrategy {
  executeWithRetry: <T>(fn: () => Promise<T>, context?: string) => Promise<T>;
}
