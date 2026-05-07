import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, InputUtilsDecorator } from "integration-core";

/**
 * This is a wrapper/decorator strategy that can be used to cause integration of people
 * data to ignore removals by simply filtering out removed items from the delta result. 
 * This gives the appearance that there are no candidates for removal.
 */
export class IgnoreRemovalsDeltaStrategy implements DeltaStrategy {
  parms: DeltaStrategyParams;

  constructor(private underlyingStrategy: DeltaStrategy) {
    this.parms = underlyingStrategy.parms;
  }

  get storage() {
    return this.underlyingStrategy.storage;
  }

  public async computeDelta(parms: {
    storage: DeltaStorage;
    currentFieldSets: any[];
    inputUtils: InputUtilsDecorator;
    clientId: string;
  }): Promise<DeltaResult> {

    const result = await this.underlyingStrategy.computeDelta(parms) as DeltaResult;
    return {
      added: result.added,
      updated: result.updated,
      removed: [] // Filter out removals to ignore them
    } satisfies DeltaResult;
  }
}