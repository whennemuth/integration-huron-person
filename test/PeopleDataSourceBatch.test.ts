import { BuCdmPeopleDataSourceBatch } from '../src/data-source/PeopleDataSourceBatch';
import { BuCdmPeopleDataSource } from '../src/data-source/PeopleCdmDataSource';

describe('BuCdmPeopleDataSourceBatch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('disables pagination params and stops after one request when limit is -1', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const setQueryParam = jest.fn();
    const fetchRaw = jest.fn().mockResolvedValue([{ personid: 'U12345678' }]);

    const dataSource = {
      setQueryParam,
      fetchRaw,
      apiClient: { recreateInstance: jest.fn() }
    } as unknown as BuCdmPeopleDataSource;

    const process = jest.fn().mockResolvedValue(undefined);

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = process;
    }({ dataSource, batchSize: 1, offset: 0, limit: -1 });

    await batchProcessor.processBatch();

    expect(fetchRaw).toHaveBeenCalledTimes(1);
    expect(setQueryParam).not.toHaveBeenCalled();
    expect(process).toHaveBeenCalledTimes(1);
    expect(batchProcessor.recordsProcessed()).toBe(1);
    expect(batchProcessor.reachedTheEndOfRecords()).toBe(true);

    consoleSpy.mockRestore();
  });

  it('sends recordCount/offset query params and respects iteration limit in batchable mode', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const setQueryParam = jest.fn();
    const fetchRaw = jest
      .fn()
      .mockResolvedValueOnce([{ personid: 'U1' }, { personid: 'U2' }])
      .mockResolvedValueOnce([{ personid: 'U3' }, { personid: 'U4' }]);

    const dataSource = {
      setQueryParam,
      fetchRaw,
      apiClient: { recreateInstance: jest.fn() }
    } as unknown as BuCdmPeopleDataSource;

    const process = jest.fn().mockResolvedValue(undefined);

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = process;
    }({ dataSource, batchSize: 2, offset: 0, limit: 2 });

    await batchProcessor.processBatch();

    expect(setQueryParam).toHaveBeenNthCalledWith(1, 'recordCount', 2);
    expect(setQueryParam).toHaveBeenNthCalledWith(2, 'offset', 0);
    expect(setQueryParam).toHaveBeenNthCalledWith(3, 'offset', 1);
    expect(fetchRaw).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenCalledTimes(2);
    expect(batchProcessor.recordsProcessed()).toBe(4);
    expect(batchProcessor.reachedTheEndOfRecords()).toBe(false);

    consoleSpy.mockRestore();
  });
});
