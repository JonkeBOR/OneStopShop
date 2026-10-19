import type { BodyPart, BodyPartLink } from './body-part';
import type { BlockStatus } from './progression';

export type Profile = { id: string };

export type Exercise = { id: string; name: string; isArchived: boolean };

export type BodyPartView = { id: BodyPart; name: string };

export type SessionStatus = 'in_progress' | 'finished';

export type Cycle = { id: string; currentBlockId: string; pass: number };

export type PlannedSetView = {
  id: string;
  setNumber: number;
  targetReps: number;
  lastWeightKg: number | null;
};

export type Prescription = { blockId: string; plannedSets: PlannedSetView[] };

export type SlotView = {
  id: string;
  exercise: Exercise;
  isOptional: boolean;
  isPeriodized: boolean;
  prescriptions: Prescription[];
};

export type WorkoutView = { id: string; name: string; slots: SlotView[] };

export type BlockView = { id: string; number: number; label: string | null };

export type Program = {
  id: string;
  name: string;
  isActive: boolean;
  blocks: BlockView[];
  workouts: WorkoutView[];
  cycle: Cycle;
};

export type ProgramSummary = {
  id: string;
  name: string;
  isActive: boolean;
  blockCount: number;
  workoutCount: number;
};

export type SetLogContext = {
  programId: string;
  cycleId: string;
  pass: number;
  trainingBlockId: string;
  blockNumber: number;
  workoutId: string;
  exerciseSlotId: string;
  workoutSessionId: string;
};

export type SetLog = {
  id: string;
  exerciseId: string;
  performedAt: Date;
  setNumber: number;
  reps: number;
  weightKg: number | null;
  context: SetLogContext;
};

export type BodyweightEntry = { id: string; date: string; weightKg: number };

export type SessionPlannedSet = {
  id: string;
  setNumber: number;
  targetReps: number;
  suggestedWeightKg: number | null;
};

export type SessionSlot = {
  id: string;
  exercise: Exercise;
  isOptional: boolean;
  plannedSets: SessionPlannedSet[];
  loggedSets: SetLog[];
};

export type SessionView = {
  id: string;
  status: SessionStatus;
  startedAt: Date;
  finishedAt: Date | null;
  workout: { id: string; name: string };
  block: { id: string; number: number | null; label: string | null };
  slots: SessionSlot[];
};

export type WorkoutProgress = 'not-started' | 'in-progress' | 'finished';

export type BlockProgress = {
  id: string;
  number: number;
  label: string | null;
  status: BlockStatus;
  finishedCount: number;
};

export type TrainingOverview = {
  program: { id: string; name: string };
  currentBlock: { id: string; number: number; label: string | null; isLast: boolean };
  blocks: BlockProgress[];
  workoutCount: number;
  workouts: {
    id: string;
    name: string;
    status: WorkoutProgress;
    sessionId: string | null;
    finishedAt: Date | null;
  }[];
  suggestedWorkoutId: string | null;
};

export type ExerciseUsage = {
  exercise: Exercise;
  slots: { programId: string; programName: string; workoutId: string; workoutName: string }[];
  hasSetLogs: boolean;
  bodyParts: BodyPartLink[];
};
