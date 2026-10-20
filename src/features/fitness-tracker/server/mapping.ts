import 'server-only';
import type {
  BodyweightEntry,
  Cycle,
  Exercise,
  ExerciseVariant,
  PlannedSetView,
  Program,
  SetLog,
} from '../domain/types';
import { gramsToKg } from '../domain/values';
import type {
  bodyweightEntries,
  cycles,
  exerciseSlots,
  exercises,
  exerciseVariants,
  plannedSets,
  programs,
  setLogs,
  trainingBlocks,
  workouts,
} from './schema';

export type ExerciseRow = typeof exercises.$inferSelect;
export type ExerciseVariantRow = typeof exerciseVariants.$inferSelect;
export type CycleRow = typeof cycles.$inferSelect;
export type SetLogRow = typeof setLogs.$inferSelect;
export type BodyweightEntryRow = typeof bodyweightEntries.$inferSelect;
export type PlannedSetRow = typeof plannedSets.$inferSelect;
export type SlotRow = typeof exerciseSlots.$inferSelect;
export type WorkoutRow = typeof workouts.$inferSelect;
export type BlockRow = typeof trainingBlocks.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;

export type ProgramRows = {
  program: ProgramRow;
  isActive: boolean;
  blocks: BlockRow[];
  workouts: (WorkoutRow & {
    slots: (SlotRow & { exercise: ExerciseRow; plannedSets: PlannedSetRow[] })[];
  })[];
  cycles: CycleRow[];
};

function byPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.position - right.position);
}

function nullableGramsToKg(grams: number | null): number | null {
  return grams === null ? null : gramsToKg(grams);
}

export function toExercise(row: ExerciseRow): Exercise {
  return { id: row.id, name: row.name, isArchived: row.archivedAt !== null };
}

export function toExerciseVariant(row: ExerciseVariantRow): ExerciseVariant {
  return { id: row.id, name: row.name };
}

export function toCycle(row: CycleRow): Cycle {
  return { id: row.id, currentBlockId: row.currentBlockId, pass: row.pass };
}

export function toSetLog(row: SetLogRow): SetLog {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    performedAt: row.performedAt,
    setNumber: row.setNumber,
    reps: row.reps,
    weightKg: nullableGramsToKg(row.weightGrams),
    variantId: row.variantId,
    context: {
      programId: row.programId,
      cycleId: row.cycleId,
      pass: row.pass,
      trainingBlockId: row.trainingBlockId,
      blockNumber: row.blockNumber,
      workoutId: row.workoutId,
      exerciseSlotId: row.exerciseSlotId,
      workoutSessionId: row.workoutSessionId,
    },
  };
}

export function toBodyweightEntry(row: BodyweightEntryRow): BodyweightEntry {
  return { id: row.id, date: row.entryDate, weightKg: gramsToKg(row.weightGrams) };
}

function toPlannedSetView(row: PlannedSetRow): PlannedSetView {
  return {
    id: row.id,
    setNumber: row.setNumber,
    targetReps: row.targetReps,
    lastWeightKg: nullableGramsToKg(row.lastWeightGrams),
  };
}

export function toProgram(rows: ProgramRows): Program {
  const blocks = byPosition(rows.blocks);
  const [cycle] = rows.cycles;
  if (!cycle) {
    throw new Error(`The program ${rows.program.id} has no cycle`);
  }
  return {
    id: rows.program.id,
    name: rows.program.name,
    isActive: rows.isActive,
    blocks: blocks.map((block) => ({ id: block.id, number: block.position, label: block.label })),
    workouts: byPosition(rows.workouts).map((workout) => ({
      id: workout.id,
      name: workout.name,
      slots: byPosition(workout.slots).map((slot) => ({
        id: slot.id,
        exercise: toExercise(slot.exercise),
        isOptional: slot.isOptional,
        isPeriodized: slot.isPeriodized,
        prescriptions: blocks.map((block) => ({
          blockId: block.id,
          plannedSets: slot.plannedSets
            .filter((plannedSet) => plannedSet.trainingBlockId === block.id)
            .sort((left, right) => left.setNumber - right.setNumber)
            .map(toPlannedSetView),
        })),
      })),
    })),
    cycle: toCycle(cycle),
  };
}
