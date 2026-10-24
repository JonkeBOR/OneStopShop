import {
  affirmationCategories,
  affirmationsPerCategory,
  type AffirmationCategory,
  type AffirmationSet,
} from '../domain/affirmation';
import type { Result } from '../domain/result';
import type { ExerciseVariant, Program, TrainingOverview } from '../domain/types';
import type { Database } from '@/lib/server/database';
import { addExercise, listExercises } from './exercises';
import { addExerciseSlot, addWorkout, createProgram } from './programs';
import { finishWorkout, getTrainingOverview, startWorkout } from './training';
import { listActiveVariants } from './variants';

export function expectOk<T, E extends string>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected the operation to succeed but it was refused: ${result.error}`);
  }
  return result.value;
}

export type ProgramSpec = {
  name?: string;
  blockCount: number;
  workouts: {
    name: string;
    slots: { exercise: string; targetReps: number[]; isPeriodized?: boolean }[];
  }[];
};

async function exerciseIdByName(
  db: Database,
  profileId: string,
  name: string,
  now: Date,
): Promise<string> {
  const existing = (await listExercises(db, profileId, { includeArchived: true })).find(
    (exercise) => exercise.name === name,
  );
  if (existing) {
    return existing.id;
  }
  return expectOk(await addExercise(db, profileId, { name }, now)).id;
}

export async function createProgramFromSpec(
  db: Database,
  profileId: string,
  spec: ProgramSpec,
  now: Date,
): Promise<Program> {
  let program = expectOk(
    await createProgram(
      db,
      profileId,
      { name: spec.name ?? `Test program ${crypto.randomUUID()}`, blockCount: spec.blockCount },
      now,
    ),
  );
  for (const workoutSpec of spec.workouts) {
    program = expectOk(await addWorkout(db, profileId, program.id, { name: workoutSpec.name }));
    const workout = program.workouts.find((candidate) => candidate.name === workoutSpec.name);
    for (const slotSpec of workoutSpec.slots) {
      const exerciseId = await exerciseIdByName(db, profileId, slotSpec.exercise, now);
      program = expectOk(
        await addExerciseSlot(db, profileId, workout?.id ?? '', {
          exerciseId,
          targetReps: slotSpec.targetReps,
          isPeriodized: slotSpec.isPeriodized ?? true,
        }),
      );
    }
  }
  return program;
}

export async function defaultVariantOf(db: Database, exerciseId: string): Promise<ExerciseVariant> {
  const [oldest] = (await listActiveVariants(db, [exerciseId])).get(exerciseId) ?? [];
  if (!oldest) {
    throw new Error('Expected the exercise to have an active variant');
  }
  return oldest;
}

export async function activeOverview(db: Database, profileId: string): Promise<TrainingOverview> {
  const overview = await getTrainingOverview(db, profileId);
  if (!overview) {
    throw new Error('Expected the profile to have an active program');
  }
  return overview;
}

export async function finishBlock(
  db: Database,
  profileId: string,
  nextTime: () => Date,
): Promise<'none' | 'block-advanced' | 'new-pass'> {
  const overview = await activeOverview(db, profileId);
  let progression: 'none' | 'block-advanced' | 'new-pass' = 'none';
  for (const workout of overview.workouts.filter((entry) => entry.status !== 'finished')) {
    const session = expectOk(await startWorkout(db, profileId, workout.id, nextTime()));
    progression = expectOk(await finishWorkout(db, profileId, session.id, nextTime())).progression;
  }
  return progression;
}

export function messagesOf(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(' | ');
}

export async function rejectionOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

export function affirmationSetOf(label: string): AffirmationSet {
  return Object.fromEntries(
    affirmationCategories.map((category) => [
      category,
      Array.from(
        { length: affirmationsPerCategory },
        (_, index) => `${label} ${category} ${index}`,
      ),
    ]),
  ) as Record<AffirmationCategory, string[]>;
}
