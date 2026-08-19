import { DataTarget } from 'integration-core';
import { Cache } from '../Cache';
import { Config } from '../config/Config';
import { TargetApiErrorEventProcessor } from './ApiClientForJWT';
import { HuronPersonDataTarget } from './PersonDataTarget';
import { MockDataTarget } from './MockDataTarget';

/**
 * Flags interface (subset of fargate metadata Flags type)
 * Used to determine target selection strategy
 */
export interface DataTargetFlags {
  useMockTarget?: boolean;
  mockTargetConfig?: {
    tableName?: string;
    resetStateBeforeRun?: boolean;
    validateOnly?: boolean;
  };
}

/**
 * Factory for creating appropriate DataTarget implementation based on flags.
 * 
 * Purpose:
 * Provides single point of control for switching between real and mock targets.
 * When flags.useMockTarget is true, returns MockDataTarget for testing with source simulator.
 * Otherwise, returns HuronPersonDataTarget for production API calls.
 * 
 * Usage Pattern:
 * ```typescript
 * // In processor entry point:
 * const flags = await metadataManager.readFlags();
 * const factory = new DataTargetFactory(config, flags);
 * const target = factory.create();
 * await target.pushOne({ data: personRecord, crud: CrudOperation.CREATE });
 * ```
 * 
 * Configuration Sources:
 * 1. flags.useMockTarget - Primary switch (from chunk metadata FLAGS record)
 * 2. flags.mockTargetConfig - Optional override settings
 * 3. Environment variables - Fallback for table name, region, etc.
 */
export class DataTargetFactory {
  private config: Config;
  private flags: DataTargetFlags;
  private cache?: Cache<string, string>;
  private hrn?: string;
  private errorEventProcessor?: TargetApiErrorEventProcessor;
  private syncRunId?: string;

  constructor(params: {
    config: Config;
    flags: DataTargetFlags;
    cache?: Cache<string, string>;
    hrn?: string;
    errorEventProcessor?: TargetApiErrorEventProcessor;
    syncRunId?: string;
  }) {
    this.config = params.config;
    this.flags = params.flags;
    this.cache = params.cache;
    this.hrn = params.hrn;
    this.errorEventProcessor = params.errorEventProcessor;
    this.syncRunId = params.syncRunId;
  }

  /**
   * Create appropriate DataTarget based on flags
   */
  create(): DataTarget {
    const useMockTarget = this.flags.useMockTarget === true;

    if (useMockTarget) {
      console.log('[DATA-TARGET-FACTORY] Using MockDataTarget (flags.useMockTarget = true)');
      
      const mockConfig = this.flags.mockTargetConfig || {};
      
      return new MockDataTarget({
        config: this.config,
        tableName: mockConfig.tableName,
        syncRunId: this.syncRunId,
        validateOnly: mockConfig.validateOnly,
      });
    }

    console.log('[DATA-TARGET-FACTORY] Using HuronPersonDataTarget (real API)');
    
    return new HuronPersonDataTarget({
      config: this.config,
      cache: this.cache,
      hrn: this.hrn,
      errorEventProcessor: this.errorEventProcessor,
    });
  }
}
