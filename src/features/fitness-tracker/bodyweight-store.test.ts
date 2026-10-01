import { describe, expect, test, vi } from 'vitest';
import { StoreMisconfiguredError, StoreUnavailableError } from '@/lib/server/collection';
import type { BodyweightMeasurement } from './bodyweight';

const readAll = vi.fn<() => Promise<readonly BodyweightMeasurement[]>>();
const append = vi.fn<(measurement: BodyweightMeasurement) => Promise<void>>();

vi.mock('@/lib/server/sheets-collection', () => ({
  createSheetsCollection: () => ({ readAll, append }),
}));

const { appendBodyweightMeasurement, bodyweightStoreErrorMessage, listBodyweightMeasurements } =
  await import('./bodyweight-store');

describe('listBodyweightMeasurements', () => {
  test('sorts by recordedOn descending, then createdAt descending as a tie-break', async () => {
    readAll.mockResolvedValue([
      { id: '1', recordedOn: '2026-03-01', kilograms: 80, createdAt: '2026-03-01T06:00:00.000Z' },
      { id: '2', recordedOn: '2026-03-05', kilograms: 81, createdAt: '2026-03-05T06:00:00.000Z' },
      { id: '3', recordedOn: '2026-03-05', kilograms: 82, createdAt: '2026-03-05T09:00:00.000Z' },
    ]);

    const result = await listBodyweightMeasurements();

    expect(result.map((measurement) => measurement.id)).toEqual(['3', '2', '1']);
  });
});

describe('appendBodyweightMeasurement', () => {
  test('assigns an id and createdAt, and appends exactly once', async () => {
    append.mockResolvedValue(undefined);

    const measurement = await appendBodyweightMeasurement({
      kilograms: 82.4,
      recordedOn: '2026-03-05',
    });

    expect(measurement.kilograms).toBe(82.4);
    expect(measurement.recordedOn).toBe('2026-03-05');
    expect(measurement.id.length).toBeGreaterThan(0);
    expect(measurement.createdAt.length).toBeGreaterThan(0);
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(measurement);
  });
});

describe('bodyweightStoreErrorMessage', () => {
  test('maps a store-unavailable error to a retryable message', () => {
    expect(bodyweightStoreErrorMessage(new StoreUnavailableError('unavailable'))).toBe(
      'Could not save right now. Please try again.',
    );
  });

  test('maps a store-misconfigured error to a configuration message', () => {
    expect(bodyweightStoreErrorMessage(new StoreMisconfiguredError('misconfigured'))).toBe(
      'The store is not set up correctly.',
    );
  });

  test('rethrows an unrecognized error', () => {
    const other = new Error('boom');
    expect(() => bodyweightStoreErrorMessage(other)).toThrow(other);
  });
});
