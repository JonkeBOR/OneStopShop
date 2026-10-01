import type { RowCodec } from '@/lib/server/collection';
import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';

export type BodyweightMeasurement = {
  readonly id: string;
  readonly recordedOn: string;
  readonly kilograms: number;
  readonly createdAt: string;
};

export type ValidatedBodyweightInput = {
  readonly recordedOn: string;
  readonly kilograms: number;
};

export type BodyweightValidationProblems = Readonly<Record<string, string>>;

export type BodyweightValidationResult =
  | { readonly ok: true; readonly value: ValidatedBodyweightInput }
  | { readonly ok: false; readonly problems: BodyweightValidationProblems };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidKilogramsValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 20 &&
    value < 400 &&
    Math.round(value * 10) === value * 10
  );
}

function kilogramsProblem(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fitnessTrackerStrings.errors.weightRequired;
  }
  if (value <= 20 || value >= 400) {
    return fitnessTrackerStrings.errors.weightRange;
  }
  return fitnessTrackerStrings.errors.weightPrecision;
}

function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  return !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

export function parseBodyweightInput(body: unknown, today: string): BodyweightValidationResult {
  if (!isRecord(body)) {
    return { ok: false, problems: { kilograms: fitnessTrackerStrings.errors.weightRequired } };
  }

  const problems: Record<string, string> = {};

  let kilograms = 0;
  if (isValidKilogramsValue(body['kilograms'])) {
    kilograms = body['kilograms'];
  } else {
    problems['kilograms'] = kilogramsProblem(body['kilograms']);
  }

  let recordedOn = today;
  const rawRecordedOn = body['recordedOn'];
  if (rawRecordedOn !== undefined && rawRecordedOn !== null) {
    if (typeof rawRecordedOn !== 'string' || !isValidDateString(rawRecordedOn)) {
      problems['recordedOn'] = fitnessTrackerStrings.errors.dateInvalid;
    } else if (rawRecordedOn > today) {
      problems['recordedOn'] = fitnessTrackerStrings.errors.dateInFuture;
    } else {
      recordedOn = rawRecordedOn;
    }
  }

  if (Object.keys(problems).length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { kilograms, recordedOn } };
}

export const bodyweightCodec: RowCodec<BodyweightMeasurement> = {
  header: ['id', 'recordedOn', 'kilograms', 'createdAt'],
  toRow: (measurement) => [
    measurement.id,
    measurement.recordedOn,
    String(measurement.kilograms),
    measurement.createdAt,
  ],
  fromRow: (row) => {
    const [id, recordedOn, kilogramsRaw, createdAt] = row;
    if (!id || !recordedOn || !kilogramsRaw || !createdAt) {
      return null;
    }
    const kilograms = Number(kilogramsRaw);
    if (!Number.isFinite(kilograms)) {
      return null;
    }
    return { id, recordedOn, kilograms, createdAt };
  },
};
