import { describe, expect, test } from 'vitest';
import { bodyweightCodec, parseBodyweightInput } from './bodyweight';

const TODAY = '2026-03-05';

describe('parseBodyweightInput', () => {
  test('accepts a valid body and defaults recordedOn to today when omitted', () => {
    const result = parseBodyweightInput({ kilograms: 82.4 }, TODAY);

    expect(result).toEqual({ ok: true, value: { kilograms: 82.4, recordedOn: TODAY } });
  });

  test('accepts an explicit recordedOn no later than today', () => {
    const result = parseBodyweightInput({ kilograms: 82.4, recordedOn: '2026-03-01' }, TODAY);

    expect(result).toEqual({ ok: true, value: { kilograms: 82.4, recordedOn: '2026-03-01' } });
  });

  test('rejects a missing weight', () => {
    const result = parseBodyweightInput({}, TODAY);

    expect(result.ok).toBe(false);
  });

  test.each([5, 20, 400, 500])('rejects a weight of %d as out of range', (kilograms) => {
    const result = parseBodyweightInput({ kilograms }, TODAY);

    expect(result.ok).toBe(false);
  });

  test('rejects a weight with more than one decimal place', () => {
    const result = parseBodyweightInput({ kilograms: 82.456 }, TODAY);

    expect(result.ok).toBe(false);
  });

  test('rejects a non-finite weight', () => {
    const result = parseBodyweightInput({ kilograms: Number.POSITIVE_INFINITY }, TODAY);

    expect(result.ok).toBe(false);
  });

  test('rejects a malformed date', () => {
    const result = parseBodyweightInput({ kilograms: 80, recordedOn: '03/05/2026' }, TODAY);

    expect(result.ok).toBe(false);
  });

  test('rejects a date later than today', () => {
    const result = parseBodyweightInput({ kilograms: 80, recordedOn: '2026-03-06' }, TODAY);

    expect(result.ok).toBe(false);
  });
});

describe('bodyweightCodec', () => {
  test('header matches the column order toRow produces', () => {
    const measurement = {
      id: 'the-id',
      recordedOn: '2026-03-05',
      kilograms: 82.4,
      createdAt: '2026-03-05T06:00:00.000Z',
    };

    expect(bodyweightCodec.toRow(measurement)).toEqual([
      'the-id',
      '2026-03-05',
      '82.4',
      '2026-03-05T06:00:00.000Z',
    ]);
    expect(bodyweightCodec.header).toEqual(['id', 'recordedOn', 'kilograms', 'createdAt']);
  });

  test('round-trips a row through toRow and fromRow', () => {
    const measurement = {
      id: 'the-id',
      recordedOn: '2026-03-05',
      kilograms: 82.4,
      createdAt: '2026-03-05T06:00:00.000Z',
    };

    expect(bodyweightCodec.fromRow(bodyweightCodec.toRow(measurement))).toEqual(measurement);
  });

  test('decodes a blank row to null', () => {
    expect(bodyweightCodec.fromRow([])).toBeNull();
  });

  test('decodes a short row to null', () => {
    expect(bodyweightCodec.fromRow(['the-id', '2026-03-05'])).toBeNull();
  });

  test('decodes a row with an unparseable number to null', () => {
    expect(
      bodyweightCodec.fromRow(['the-id', '2026-03-05', 'not-a-number', '2026-03-05T06:00:00.000Z']),
    ).toBeNull();
  });

  test('tolerates a row with extra trailing columns, per the hand-editing tolerance in data-model.md', () => {
    const row = ['the-id', '2026-03-05', '82.4', '2026-03-05T06:00:00.000Z', 'unexpected-extra'];

    expect(bodyweightCodec.fromRow(row)).toEqual({
      id: 'the-id',
      recordedOn: '2026-03-05',
      kilograms: 82.4,
      createdAt: '2026-03-05T06:00:00.000Z',
    });
  });
});
