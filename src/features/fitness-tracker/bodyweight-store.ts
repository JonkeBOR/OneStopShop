import 'server-only';
import { StoreMisconfiguredError, StoreUnavailableError } from '@/lib/server/collection';
import { createSheetsCollection } from '@/lib/server/sheets-collection';
import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';
import type { BodyweightMeasurement, ValidatedBodyweightInput } from './bodyweight';
import { bodyweightCodec } from './bodyweight';

const COLLECTION_NAME = 'Bodyweight';

function bodyweightCollection() {
  return createSheetsCollection<BodyweightMeasurement>(COLLECTION_NAME, bodyweightCodec);
}

function compareMeasurements(a: BodyweightMeasurement, b: BodyweightMeasurement): number {
  if (a.recordedOn !== b.recordedOn) {
    return a.recordedOn > b.recordedOn ? -1 : 1;
  }
  return a.createdAt > b.createdAt ? -1 : 1;
}

export async function listBodyweightMeasurements(): Promise<readonly BodyweightMeasurement[]> {
  const measurements = await bodyweightCollection().readAll();
  return [...measurements].sort(compareMeasurements);
}

export async function appendBodyweightMeasurement(
  input: ValidatedBodyweightInput,
): Promise<BodyweightMeasurement> {
  const measurement: BodyweightMeasurement = {
    id: crypto.randomUUID(),
    recordedOn: input.recordedOn,
    kilograms: input.kilograms,
    createdAt: new Date().toISOString(),
  };
  await bodyweightCollection().append(measurement);
  return measurement;
}

export function bodyweightStoreErrorMessage(error: unknown): string {
  if (error instanceof StoreUnavailableError) {
    return fitnessTrackerStrings.errors.storeUnavailable;
  }
  if (error instanceof StoreMisconfiguredError) {
    return fitnessTrackerStrings.errors.storeMisconfigured;
  }
  throw error;
}
