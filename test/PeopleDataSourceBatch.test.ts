import { BuCdmPeopleDataSourceBatch } from '../src/data-source/PeopleDataSourceBatch';
import { BuCdmPeopleDataSource } from '../src/data-source/PeopleCdmDataSource';

describe('BuCdmPeopleDataSourceBatch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('disables pagination params and stops after one request when iterationLimit is -1', async () => {
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
    }({ dataSource, batchSize: 1, offset: 0, iterationLimit: -1 });

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
    }({ dataSource, batchSize: 2, offset: 0, iterationLimit: 2 });

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

  it('records the offset of the final partial page as the last offset used', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const setQueryParam = jest.fn();
    const fetchRaw = jest
      .fn()
      .mockResolvedValueOnce([{ personid: 'U1' }, { personid: 'U2' }])
      .mockResolvedValueOnce([{ personid: 'U3' }]);

    const dataSource = {
      setQueryParam,
      fetchRaw,
      apiClient: { recreateInstance: jest.fn() }
    } as unknown as BuCdmPeopleDataSource;

    const process = jest.fn().mockResolvedValue(undefined);

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = process;
    }({ dataSource, batchSize: 2, offset: 540, iterationLimit: 10 });

    await batchProcessor.processBatch();

    expect(batchProcessor.reachedTheEndOfRecords()).toBe(true);
    expect(batchProcessor.getLastOffsetUsed()).toBe(541);

    consoleSpy.mockRestore();
  });

  it('records its own starting offset as the last offset used when the first page is already empty', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const setQueryParam = jest.fn();
    const fetchRaw = jest.fn().mockResolvedValueOnce([]);

    const dataSource = {
      setQueryParam,
      fetchRaw,
      apiClient: { recreateInstance: jest.fn() }
    } as unknown as BuCdmPeopleDataSource;

    const process = jest.fn().mockResolvedValue(undefined);

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = process;
    }({ dataSource, batchSize: 200, offset: 700, iterationLimit: 10 });

    await batchProcessor.processBatch();

    expect(batchProcessor.reachedTheEndOfRecords()).toBe(true);
    expect(batchProcessor.getLastOffsetUsed()).toBe(700);

    consoleSpy.mockRestore();
  });

  it('proceeds normally when isOffsetPastKnownEnd reports no boundary has been reached', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const setQueryParam = jest.fn();
    const fetchRaw = jest
      .fn()
      .mockResolvedValueOnce([{ personid: 'U1' }, { personid: 'U2' }])
      .mockResolvedValueOnce([{ personid: 'U3' }]);

    const dataSource = {
      setQueryParam,
      fetchRaw,
      apiClient: { recreateInstance: jest.fn() }
    } as unknown as BuCdmPeopleDataSource;

    const process = jest.fn().mockResolvedValue(undefined);
    const isOffsetPastKnownEnd = jest.fn().mockResolvedValue(false);

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = process;
    }({ dataSource, batchSize: 2, offset: 0, iterationLimit: 10, isOffsetPastKnownEnd });

    await batchProcessor.processBatch();

    expect(isOffsetPastKnownEnd).toHaveBeenCalledWith(0);
    expect(isOffsetPastKnownEnd).toHaveBeenCalledWith(1);
    expect(fetchRaw).toHaveBeenCalledTimes(2);
    expect(batchProcessor.recordsProcessed()).toBe(3);
    expect(batchProcessor.reachedTheEndOfRecords()).toBe(true);

    consoleSpy.mockRestore();
  });

  it('discards a batch and stops without fetching when isOffsetPastKnownEnd reports the offset is already past the boundary', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const setQueryParam = jest.fn();
    const fetchRaw = jest.fn().mockResolvedValueOnce([{ personid: 'U1' }, { personid: 'U2' }]);

    const dataSource = {
      setQueryParam,
      fetchRaw,
      apiClient: { recreateInstance: jest.fn() }
    } as unknown as BuCdmPeopleDataSource;

    const process = jest.fn().mockResolvedValue(undefined);
    const isOffsetPastKnownEnd = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = process;
    }({ dataSource, batchSize: 2, offset: 840, iterationLimit: 10, isOffsetPastKnownEnd });

    await batchProcessor.processBatch();

    expect(isOffsetPastKnownEnd).toHaveBeenCalledTimes(2);
    expect(fetchRaw).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledTimes(1);
    expect(batchProcessor.recordsProcessed()).toBe(2);
    expect(batchProcessor.reachedTheEndOfRecords()).toBe(true);
    expect(batchProcessor.getLastOffsetUsed()).toBe(841);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Offset 841 is already past a boundary established elsewhere'));

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('discards even the very first offset and still records it as the last offset used', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const setQueryParam = jest.fn();
    const fetchRaw = jest.fn();

    const dataSource = {
      setQueryParam,
      fetchRaw,
      apiClient: { recreateInstance: jest.fn() }
    } as unknown as BuCdmPeopleDataSource;

    const process = jest.fn().mockResolvedValue(undefined);
    const isOffsetPastKnownEnd = jest.fn().mockResolvedValue(true);

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = process;
    }({ dataSource, batchSize: 2, offset: 900, iterationLimit: 10, isOffsetPastKnownEnd });

    await batchProcessor.processBatch();

    expect(fetchRaw).not.toHaveBeenCalled();
    expect(setQueryParam).not.toHaveBeenCalledWith('offset', 900);
    expect(batchProcessor.recordsProcessed()).toBe(0);
    expect(batchProcessor.reachedTheEndOfRecords()).toBe(true);
    expect(batchProcessor.getLastOffsetUsed()).toBe(900);

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
