/**
 * Tests for previousStateSource (src/delta-strategy/PreviousStateSource.ts), the one setting that replaced the
 * bulkReset / trustPreviousStorage pair (now refused), and for HuronPersonIntegration resolving it once, up front. The factory's
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
import { previousStateSourceFromEnvironment } from '../src/delta-strategy/PreviousStateSource';

describe('previousStateSource', () => {
  describe("previousStateSourceFromEnvironment() (manual runs' SYNC_PREVIOUS_STATE_SOURCE)", () => {
    it.each([[undefined, 'target'], ['', 'target'], ['  ', 'target'], ['storage', 'storage'], [' target ', 'target']])(
      'reads %p as %p (unset means target, as manual runs always compared with the target)', (value, expected) => {
        expect(previousStateSourceFromEnvironment(value, 'SYNC_PREVIOUS_STATE_SOURCE')).toBe(expected);
      });

    it.each(['true', 'false', 'Storage', 'bulk'])('refuses %p, naming the variable', value => {
      expect(() => previousStateSourceFromEnvironment(value, 'SYNC_PREVIOUS_STATE_SOURCE'))
        .toThrow(`Invalid SYNC_PREVIOUS_STATE_SOURCE: "${value}"`);
    });
  });

  describe('isPreviousStateSource()', () => {
    it.each(PREVIOUS_STATE_SOURCES)('accepts %p', value => {
      expect(isPreviousStateSource(value)).toBe(true);
    });

    it.each([undefined, null, '', 'Storage', 'TARGET', 'storage-then-target', true, 1])('refuses %p', value => {
      expect(isPreviousStateSource(value)).toBe(false);
    });
  });

  describe('previousStateSourceOf()', () => {
    it.each(PREVIOUS_STATE_SOURCES)('returns previousStateSource %p when given alone', value => {
      expect(previousStateSourceOf({ previousStateSource: value })).toBe(value);
    });

    it('defaults to storage, or to the fallback given, when nothing is set', () => {
      expect(previousStateSourceOf({})).toBe('storage');
      expect(previousStateSourceOf({}, 'target')).toBe('target');
    });

    // The pair previousStateSource replaced: refused rather than ignored, which would quietly change what was asked for
    it.each<[object, string]>([
      [{ bulkReset: true }, 'bulkReset is no longer accepted'],
      [{ trustPreviousStorage: true }, 'trustPreviousStorage is no longer accepted'],
      [{ bulkReset: false, trustPreviousStorage: true }, 'bulkReset and trustPreviousStorage are no longer accepted'],
      [{ previousStateSource: 'target', bulkReset: true }, 'bulkReset is no longer accepted']
    ])('refuses %j, which carries the removed pair', (params, message) => {
      expect(() => previousStateSourceOf(params as PreviousStateSourceParams)).toThrow(message);
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

    it('refuses the removed pair when constructed, before any work', () => {
      expect(() => new HuronPersonIntegration({ config, bulkReset: true } as any)).toThrow('no longer accepted');
      expect(() => new HuronPersonIntegration({ config, trustPreviousStorage: false } as any)).toThrow('no longer accepted');
    });
  });
});
