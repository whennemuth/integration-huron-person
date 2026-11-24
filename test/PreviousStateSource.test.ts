/**
 * Tests for previousStateSource (src/delta-strategy/PreviousStateSource.ts), the one setting that replaces the
 * bulkReset / trustPreviousStorage pair, and for HuronPersonIntegration resolving it once, up front. The factory's
 * wrapping by it is tested in DeltaStrategyFactory.test.ts.
 */
import {
  HuronPersonIntegration,
  PREVIOUS_STATE_SOURCES,
  PreviousStateSource,
  PreviousStateSourceParams,
  isPreviousStateSource,
  previousStateSourceOf
} from '../bin/index';

describe('previousStateSource', () => {
  describe('isPreviousStateSource()', () => {
    it.each(PREVIOUS_STATE_SOURCES)('accepts %p', value => {
      expect(isPreviousStateSource(value)).toBe(true);
    });

    it.each([undefined, null, '', 'Storage', 'TARGET', 'storage-then-target', true, 1])('refuses %p', value => {
      expect(isPreviousStateSource(value)).toBe(false);
    });
  });

  describe('previousStateSourceOf()', () => {
    // Every combination of the deprecated pair, translated as the factory always did: target if bulkReset is true or
    // trustPreviousStorage is false; an unset bulkReset means false, an unset trustPreviousStorage means true.
    it.each<[PreviousStateSourceParams, PreviousStateSource]>([
      [{ bulkReset: false, trustPreviousStorage: true }, 'storage'],
      [{ bulkReset: false, trustPreviousStorage: false }, 'target'],
      [{ bulkReset: true, trustPreviousStorage: true }, 'target'],
      [{ bulkReset: true, trustPreviousStorage: false }, 'target'],
      [{ bulkReset: false }, 'storage'],
      [{ bulkReset: true }, 'target'],
      [{ trustPreviousStorage: true }, 'storage'],
      [{ trustPreviousStorage: false }, 'target']
    ])('translates the deprecated pair %j to %p', (params, expected) => {
      expect(previousStateSourceOf(params)).toBe(expected);
    });

    it.each(PREVIOUS_STATE_SOURCES)('returns previousStateSource %p when given alone', value => {
      expect(previousStateSourceOf({ previousStateSource: value })).toBe(value);
    });

    it('accepts the deprecated pair alongside previousStateSource when they agree', () => {
      expect(previousStateSourceOf({ previousStateSource: 'target', bulkReset: true })).toBe('target');
      expect(previousStateSourceOf({ previousStateSource: 'storage', bulkReset: false, trustPreviousStorage: true }))
        .toBe('storage');
    });

    it('defaults to storage, or to the fallback given, when nothing is set', () => {
      expect(previousStateSourceOf({})).toBe('storage');
      expect(previousStateSourceOf({}, 'target')).toBe('target');
    });

    it('lets the deprecated pair win over the fallback', () => {
      expect(previousStateSourceOf({ trustPreviousStorage: true }, 'target')).toBe('storage');
    });

    it.each<[PreviousStateSourceParams, string]>([
      [{ previousStateSource: 'storage', bulkReset: true }, 'means target'],
      [{ previousStateSource: 'storage', trustPreviousStorage: false }, 'means target'],
      [{ previousStateSource: 'target', bulkReset: false, trustPreviousStorage: true }, 'means storage']
    ])('refuses %j, a contradiction', (params, message) => {
      expect(() => previousStateSourceOf(params)).toThrow(message);
    });

    it('refuses a value that is not a previous state source', () => {
      expect(() => previousStateSourceOf({ previousStateSource: 'bulk' as PreviousStateSource }))
        .toThrow('Invalid previousStateSource: "bulk"');
    });
  });

  describe('HuronPersonIntegration', () => {
    const config = {
      dataSource: {},
      dataTarget: {},
      integration: { clientId: 'test', batchSize: 10, timeout: 5000 },
      storage: { type: 'file', config: { path: './test' } }
    } as any;
    const resolved = (integration: HuronPersonIntegration) => (integration as any).previousStateSource;

    beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
    afterEach(() => jest.restoreAllMocks());

    it('resolves previousStateSource, defaulting to storage', () => {
      expect(resolved(new HuronPersonIntegration({ config }))).toBe('storage');
      expect(resolved(new HuronPersonIntegration({ config, previousStateSource: 'target' }))).toBe('target');
    });

    it('still translates the deprecated pair', () => {
      expect(resolved(new HuronPersonIntegration({ config, bulkReset: true }))).toBe('target');
      expect(resolved(new HuronPersonIntegration({ config, trustPreviousStorage: false }))).toBe('target');
      expect(resolved(new HuronPersonIntegration({ config, bulkReset: false, trustPreviousStorage: true }))).toBe('storage');
    });

    it('refuses a contradiction when constructed, before any work', () => {
      expect(() => new HuronPersonIntegration({ config, previousStateSource: 'storage', bulkReset: true }))
        .toThrow('contradicts');
    });
  });
});
