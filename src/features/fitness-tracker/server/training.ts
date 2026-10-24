import 'server-only';
import { and, asc, count, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import { affirmationWeekStart } from '../domain/affirmation';
import { decideLogSet, prefill } from '../domain/logging';
import { blockStatuses, decideAfterFinish } from '../domain/progression';
import { fail, type Result, succeed } from '../domain/result';
import { decideStartWorkout, suggestedNextWorkout, workoutStatuses } from '../domain/session';
import type { SessionSlotSettings, SessionView, SetLog, TrainingOverview } from '../domain/types';
import { isUniqueConstraintViolation, runBatch, type Statement } from './batch';
import { startPassStatements } from './cycle-statements';
import { type BlockRow, type CycleRow, toExercise, toSetLog } from './mapping';
import {
  cycles,
  exerciseSlots,
  exercises,
  plannedSets,
  profiles,
  programs,
  setLogs,
  trainingBlocks,
  workoutSessions,
  workouts,
} from './schema';
import { listActiveVariants } from './variants';

type ActiveContext = {
  programId: string;
  programName: string;
  cycle: CycleRow;
  blocks: BlockRow[];
  workouts: { id: string; name: string }[];
};

async function loadActiveContext(db: Database, profileId: string): Promise<ActiveContext | null> {
  const [profile] = await db
    .select({ activeProgramId: profiles.activeProgramId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  const programId = profile?.activeProgramId ?? null;
  if (programId === null) {
    return null;
  }
  const [program] = await db
    .select({ name: programs.name })
    .from(programs)
    .where(
      and(
        eq(programs.id, programId),
        eq(programs.profileId, profileId),
        isNull(programs.deletedAt),
      ),
    )
    .limit(1);
  const [cycle] = await db.select().from(cycles).where(eq(cycles.programId, programId)).limit(1);
  if (!program || !cycle) {
    return null;
  }
  const [blocks, workoutRows] = await Promise.all([
    db
      .select()
      .from(trainingBlocks)
      .where(eq(trainingBlocks.programId, programId))
      .orderBy(asc(trainingBlocks.position)),
    db
      .select({ id: workouts.id, name: workouts.name })
      .from(workouts)
      .where(eq(workouts.programId, programId))
      .orderBy(asc(workouts.position)),
  ]);
  return { programId, programName: program.name, cycle, blocks, workouts: workoutRows };
}

function sessionsOfPass(db: Database, cycle: CycleRow) {
  return db
    .select({
      id: workoutSessions.id,
      workoutId: workoutSessions.workoutId,
      trainingBlockId: workoutSessions.trainingBlockId,
      status: workoutSessions.status,
      finishedAt: workoutSessions.finishedAt,
    })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.cycleId, cycle.id), eq(workoutSessions.pass, cycle.pass)));
}

function groupFinishedByBlock(
  sessions: readonly { workoutId: string; trainingBlockId: string; status: string }[],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const session of sessions) {
    if (session.status === 'finished') {
      grouped[session.trainingBlockId] = [
        ...(grouped[session.trainingBlockId] ?? []),
        session.workoutId,
      ];
    }
  }
  return grouped;
}

export async function getTrainingOverview(
  db: Database,
  profileId: string,
): Promise<TrainingOverview | null> {
  const context = await loadActiveContext(db, profileId);
  if (!context) {
    return null;
  }
  const currentBlock = context.blocks.find((block) => block.id === context.cycle.currentBlockId);
  if (!currentBlock) {
    throw new Error(`The cycle of program ${context.programId} points at a block that is gone`);
  }
  const passSessions = await sessionsOfPass(db, context.cycle);
  const sessionsOfCurrentBlock = passSessions.filter(
    (session) => session.trainingBlockId === currentBlock.id,
  );
  const workoutIds = context.workouts.map((workout) => workout.id);
  const statuses = blockStatuses({
    blockIds: context.blocks.map((block) => block.id),
    currentBlockId: currentBlock.id,
    workoutIds,
    finishedWorkoutIdsByBlock: groupFinishedByBlock(passSessions),
  });
  return {
    program: { id: context.programId, name: context.programName },
    currentBlock: {
      id: currentBlock.id,
      number: currentBlock.position,
      label: currentBlock.label,
      isLast: currentBlock.id === context.blocks[context.blocks.length - 1]?.id,
    },
    blocks: context.blocks.map((block) => {
      const progress = statuses.find((entry) => entry.blockId === block.id);
      return {
        id: block.id,
        number: block.position,
        label: block.label,
        status: progress?.status ?? 'upcoming',
        finishedCount: progress?.finishedCount ?? 0,
      };
    }),
    workoutCount: workoutIds.length,
    workouts: workoutStatuses(workoutIds, sessionsOfCurrentBlock).map((entry) => {
      const session = sessionsOfCurrentBlock.find(
        (candidate) => candidate.workoutId === entry.workoutId,
      );
      return {
        id: entry.workoutId,
        name: context.workouts.find((workout) => workout.id === entry.workoutId)?.name ?? '',
        status: entry.status,
        sessionId: session?.id ?? null,
        finishedAt: session?.finishedAt ?? null,
      };
    }),
    suggestedWorkoutId: suggestedNextWorkout(workoutIds, sessionsOfCurrentBlock),
  };
}

export async function getSession(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<Result<SessionView, 'not-found'>> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.profileId, profileId)))
    .limit(1);
  if (!session) {
    return fail('not-found');
  }
  const [workout] = await db
    .select({ id: workouts.id, name: workouts.name })
    .from(workouts)
    .where(eq(workouts.id, session.workoutId))
    .limit(1);
  if (!workout) {
    return fail('not-found');
  }
  const [block] = await db
    .select({ position: trainingBlocks.position, label: trainingBlocks.label })
    .from(trainingBlocks)
    .where(eq(trainingBlocks.id, session.trainingBlockId))
    .limit(1);
  const [slotRows, logRows] = await Promise.all([
    db.query.exerciseSlots.findMany({
      where: eq(exerciseSlots.workoutId, workout.id),
      orderBy: asc(exerciseSlots.position),
      with: {
        exercise: true,
        plannedSets: { where: eq(plannedSets.trainingBlockId, session.trainingBlockId) },
      },
    }),
    db
      .select()
      .from(setLogs)
      .where(eq(setLogs.workoutSessionId, session.id))
      .orderBy(asc(setLogs.performedAt), sql`rowid`),
  ]);
  const logs = logRows.map(toSetLog);
  const activeVariants = await listActiveVariants(
    db,
    slotRows.map((slot) => slot.exercise.id),
  );
  return succeed({
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    workout,
    block: {
      id: session.trainingBlockId,
      number: block?.position ?? null,
      label: block?.label ?? null,
    },
    slots: slotRows.map((slot) => {
      const variants = activeVariants.get(slot.exercise.id) ?? [];
      return {
        id: slot.id,
        exercise: toExercise(slot.exercise),
        isOptional: slot.isOptional,
        plannedSets: prefill(slot.plannedSets),
        loggedSets: logs.filter((log) => log.context.exerciseSlotId === slot.id),
        variant: variants.find((entry) => entry.id === slot.plannedSets[0]?.variantId) ?? null,
        hasVariantChoice: variants.length >= 2,
      };
    }),
  });
}

export async function countEarlierSessionsThisWeek(
  db: Database,
  profileId: string,
  session: SessionView,
): Promise<number> {
  const { finishedAt } = session;
  if (finishedAt === null) {
    return 0;
  }
  const [row] = await db
    .select({ earlier: count() })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.profileId, profileId),
        eq(workoutSessions.status, 'finished'),
        gte(workoutSessions.finishedAt, affirmationWeekStart(finishedAt)),
        or(
          lt(workoutSessions.finishedAt, finishedAt),
          and(eq(workoutSessions.finishedAt, finishedAt), lt(workoutSessions.id, session.id)),
        ),
      ),
    );
  return row?.earlier ?? 0;
}

export async function getSessionSlotSettings(
  db: Database,
  profileId: string,
  sessionId: string,
  slotId: string,
): Promise<Result<SessionSlotSettings, 'not-found'>> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.profileId, profileId)))
    .limit(1);
  if (!session) {
    return fail('not-found');
  }
  const [slot] = await db
    .select({ exercise: exercises })
    .from(exerciseSlots)
    .innerJoin(exercises, eq(exercises.id, exerciseSlots.exerciseId))
    .where(and(eq(exerciseSlots.id, slotId), eq(exerciseSlots.workoutId, session.workoutId)))
    .limit(1);
  if (!slot) {
    return fail('not-found');
  }
  const [slotPlannedSets, [logged], active] = await Promise.all([
    db
      .select({ id: plannedSets.id, variantId: plannedSets.variantId })
      .from(plannedSets)
      .where(
        and(
          eq(plannedSets.exerciseSlotId, slotId),
          eq(plannedSets.trainingBlockId, session.trainingBlockId),
        ),
      )
      .orderBy(asc(plannedSets.setNumber)),
    db
      .select({ id: setLogs.id })
      .from(setLogs)
      .where(and(eq(setLogs.workoutSessionId, session.id), eq(setLogs.exerciseSlotId, slotId)))
      .limit(1),
    listActiveVariants(db, [slot.exercise.id]),
  ]);
  return succeed({
    sessionId: session.id,
    status: session.status,
    exercise: toExercise(slot.exercise),
    plannedSetIds: slotPlannedSets.map((plannedSet) => plannedSet.id),
    variants: active.get(slot.exercise.id) ?? [],
    selectedVariantId: slotPlannedSets[0]?.variantId ?? null,
    isLocked: logged !== undefined,
  });
}

export async function startWorkout(
  db: Database,
  profileId: string,
  workoutId: string,
  now: Date,
): Promise<
  Result<
    SessionView,
    'no-active-program' | 'workout-not-in-active-program' | 'workout-already-finished'
  >
> {
  const context = await loadActiveContext(db, profileId);
  if (!context) {
    return fail('no-active-program');
  }
  const findExisting = async () => {
    const [existing] = await db
      .select({ id: workoutSessions.id, status: workoutSessions.status })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.cycleId, context.cycle.id),
          eq(workoutSessions.pass, context.cycle.pass),
          eq(workoutSessions.trainingBlockId, context.cycle.currentBlockId),
          eq(workoutSessions.workoutId, workoutId),
        ),
      )
      .limit(1);
    return existing ?? null;
  };
  const decision = decideStartWorkout({
    workoutId,
    programWorkoutIds: context.workouts.map((workout) => workout.id),
    existingSession: await findExisting(),
  });
  if (!decision.ok) {
    return fail(decision.error);
  }
  let sessionId = decision.value.kind === 'resume' ? decision.value.sessionId : null;
  if (sessionId === null) {
    const newSessionId = crypto.randomUUID();
    try {
      await db.insert(workoutSessions).values({
        id: newSessionId,
        profileId,
        programId: context.programId,
        cycleId: context.cycle.id,
        pass: context.cycle.pass,
        trainingBlockId: context.cycle.currentBlockId,
        workoutId,
        status: 'in_progress',
        startedAt: now,
        finishedAt: null,
      });
      sessionId = newSessionId;
    } catch (error) {
      const existing = isUniqueConstraintViolation(error) ? await findExisting() : null;
      if (!existing) {
        throw error;
      }
      sessionId = existing.id;
    }
  }
  const session = await getSession(db, profileId, sessionId);
  if (!session.ok) {
    throw new Error('The session was not found after it was started');
  }
  return succeed(session.value);
}

export async function startUpcomingWorkout(
  db: Database,
  profileId: string,
  now: Date,
): Promise<
  Result<
    SessionView,
    | 'no-active-program'
    | 'program-incomplete'
    | 'workout-not-in-active-program'
    | 'workout-already-finished'
  >
> {
  const overview = await getTrainingOverview(db, profileId);
  if (!overview) {
    return fail('no-active-program');
  }
  if (overview.suggestedWorkoutId === null) {
    return fail('program-incomplete');
  }
  return startWorkout(db, profileId, overview.suggestedWorkoutId, now);
}

export async function logSet(
  db: Database,
  profileId: string,
  sessionId: string,
  plannedSetId: string,
  input: { reps: number; weightKg?: number | null; expectedVariantId?: string | null },
  now: Date,
): Promise<
  Result<
    SetLog,
    | 'not-found'
    | 'session-not-in-progress'
    | 'planned-set-not-in-session'
    | 'invalid-reps'
    | 'invalid-weight'
    | 'variant-changed'
  >
> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.profileId, profileId)))
    .limit(1);
  const [target] = await db
    .select({
      setNumber: plannedSets.setNumber,
      variantId: plannedSets.variantId,
      slotId: exerciseSlots.id,
      slotWorkoutId: exerciseSlots.workoutId,
      exerciseId: exerciseSlots.exerciseId,
      isPeriodized: exerciseSlots.isPeriodized,
      blockId: trainingBlocks.id,
      blockNumber: trainingBlocks.position,
    })
    .from(plannedSets)
    .innerJoin(exerciseSlots, eq(exerciseSlots.id, plannedSets.exerciseSlotId))
    .innerJoin(workouts, eq(workouts.id, exerciseSlots.workoutId))
    .innerJoin(programs, eq(programs.id, workouts.programId))
    .innerJoin(trainingBlocks, eq(trainingBlocks.id, plannedSets.trainingBlockId))
    .where(and(eq(plannedSets.id, plannedSetId), eq(programs.profileId, profileId)))
    .limit(1);
  if (!session || !target) {
    return fail('not-found');
  }
  const decision = decideLogSet({
    session: {
      status: session.status,
      workoutId: session.workoutId,
      trainingBlockId: session.trainingBlockId,
    },
    plannedSet: { slotWorkoutId: target.slotWorkoutId, trainingBlockId: target.blockId },
    input,
  });
  if (!decision.ok) {
    return fail(decision.error);
  }
  if (input.expectedVariantId !== undefined && input.expectedVariantId !== target.variantId) {
    return fail('variant-changed');
  }
  const row = {
    id: crypto.randomUUID(),
    profileId,
    exerciseId: target.exerciseId,
    performedAt: now,
    setNumber: target.setNumber,
    reps: decision.value.reps,
    weightGrams: decision.value.weightGrams,
    programId: session.programId,
    cycleId: session.cycleId,
    trainingBlockId: target.blockId,
    workoutId: session.workoutId,
    exerciseSlotId: target.slotId,
    workoutSessionId: session.id,
    pass: session.pass,
    blockNumber: target.blockNumber,
    variantId: target.variantId,
  };
  await runBatch(db, [
    db.insert(setLogs).values(row),
    db
      .update(plannedSets)
      .set({ lastWeightGrams: decision.value.newLastWeightGrams })
      .where(
        target.isPeriodized
          ? eq(plannedSets.id, plannedSetId)
          : and(
              eq(plannedSets.exerciseSlotId, target.slotId),
              eq(plannedSets.setNumber, target.setNumber),
            ),
      ),
  ]);
  return succeed(toSetLog(row));
}

export async function finishWorkout(
  db: Database,
  profileId: string,
  sessionId: string,
  now: Date,
): Promise<
  Result<
    {
      progression: 'none' | 'block-advanced' | 'new-pass';
      completedBlockNumber: number | null;
    },
    'not-found' | 'session-not-in-progress'
  >
> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.profileId, profileId)))
    .limit(1);
  if (!session) {
    return fail('not-found');
  }
  if (session.status !== 'in_progress') {
    return fail('session-not-in-progress');
  }
  const statements: Statement[] = [
    db
      .update(workoutSessions)
      .set({ status: 'finished', finishedAt: now })
      .where(eq(workoutSessions.id, sessionId)),
  ];
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, session.cycleId)).limit(1);
  let progression: 'none' | 'block-advanced' | 'new-pass' = 'none';
  let completedBlockNumber: number | null = null;
  if (cycle && cycle.pass === session.pass && cycle.currentBlockId === session.trainingBlockId) {
    const [workoutRows, finishedRows, blockRows] = await Promise.all([
      db.select({ id: workouts.id }).from(workouts).where(eq(workouts.programId, cycle.programId)),
      db
        .select({ workoutId: workoutSessions.workoutId })
        .from(workoutSessions)
        .where(
          and(
            eq(workoutSessions.cycleId, cycle.id),
            eq(workoutSessions.pass, cycle.pass),
            eq(workoutSessions.trainingBlockId, cycle.currentBlockId),
            eq(workoutSessions.status, 'finished'),
          ),
        ),
      db
        .select({ id: trainingBlocks.id, position: trainingBlocks.position })
        .from(trainingBlocks)
        .where(eq(trainingBlocks.programId, cycle.programId))
        .orderBy(asc(trainingBlocks.position)),
    ]);
    const blockIds = blockRows.map((block) => block.id);
    const decision = decideAfterFinish({
      blockIds,
      currentBlockId: cycle.currentBlockId,
      workoutIds: workoutRows.map((workout) => workout.id),
      finishedWorkoutIdsInBlock: [...finishedRows.map((row) => row.workoutId), session.workoutId],
    });
    completedBlockNumber =
      blockRows.find((block) => block.id === cycle.currentBlockId)?.position ?? null;
    const firstBlockId = blockIds[0];
    if (decision.kind === 'advance') {
      progression = 'block-advanced';
      statements.push(
        db
          .update(cycles)
          .set({ currentBlockId: decision.toBlockId })
          .where(eq(cycles.id, cycle.id)),
      );
    } else if (decision.kind === 'new-pass' && firstBlockId !== undefined) {
      progression = 'new-pass';
      statements.push(
        ...startPassStatements(db, { id: cycle.id, programId: cycle.programId }, firstBlockId, now),
      );
    }
  }
  await runBatch(db, statements);
  return succeed({ progression, completedBlockNumber });
}
