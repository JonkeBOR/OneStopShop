import { fail, type Result, succeed } from './result';

const gramsPerKilogram = 1000;
const maxWeightGrams = 1000 * gramsPerKilogram;
const maxReps = 999;
const maxNameLength = 100;
const gramRoundingTolerance = 1e-6;

export function parseWeightKg(kilograms: number): Result<number, 'invalid-weight'> {
  if (!Number.isFinite(kilograms)) {
    return fail('invalid-weight');
  }
  const exactGrams = kilograms * gramsPerKilogram;
  const grams = Math.round(exactGrams);
  const hasSubGramPrecision = Math.abs(exactGrams - grams) > gramRoundingTolerance;
  if (hasSubGramPrecision || grams < 1 || grams > maxWeightGrams) {
    return fail('invalid-weight');
  }
  return succeed(grams);
}

export function gramsToKg(grams: number): number {
  return grams / gramsPerKilogram;
}

const kgInputPattern = /^(\d+([.,]\d{1,2})?|[.,]\d{1,2})$/;

export function parseKgInput(text: string): Result<number | null, 'invalid-weight'> {
  const trimmed = text.trim();
  if (trimmed === '') {
    return succeed(null);
  }
  if (!kgInputPattern.test(trimmed)) {
    return fail('invalid-weight');
  }
  const kilograms = Number(trimmed.replace(',', '.'));
  return parseWeightKg(kilograms).ok ? succeed(kilograms) : fail('invalid-weight');
}

export function formatKg(kilograms: number): string {
  return String(Math.round(kilograms * 100) / 100);
}

function isWholeRepCount(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= maxReps;
}

export function parseTargetReps(reps: number): Result<number, 'invalid-target'> {
  return isWholeRepCount(reps) ? succeed(reps) : fail('invalid-target');
}

export function parseLoggedReps(reps: number): Result<number, 'invalid-reps'> {
  return isWholeRepCount(reps) ? succeed(reps) : fail('invalid-reps');
}

export function parseName(text: string): Result<string, 'name-required' | 'name-too-long'> {
  const name = text.trim();
  if (name.length === 0) {
    return fail('name-required');
  }
  if (name.length > maxNameLength) {
    return fail('name-too-long');
  }
  return succeed(name);
}

export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function isNameTaken(name: string, existingNames: readonly string[]): boolean {
  const key = nameKey(name);
  return existingNames.some((existing) => nameKey(existing) === key);
}

export function localDate(now: Date, timeZone: string): Result<string, 'invalid-time-zone'> {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return succeed(formatter.format(now));
  } catch {
    return fail('invalid-time-zone');
  }
}

function decodeOrNull(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function resolveTimeZone(raw: string | undefined): string {
  const decoded = raw === undefined ? null : decodeOrNull(raw);
  if (decoded === null || decoded === '') {
    return 'UTC';
  }
  return localDate(new Date(), decoded).ok ? decoded : 'UTC';
}

export function formatShortDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimeZone(timeZone),
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function parseCompletedBlock(value: string | undefined): number | null {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}
