import { relations } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { bodyPartIds, bodyPartRoles } from '../domain/body-part';

export const sessionStatuses = ['in_progress', 'finished'] as const;

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  accountSubject: text('account_subject').notNull().unique(),
  activeProgramId: text('active_program_id').references((): AnySQLiteColumn => programs.id, {
    onDelete: 'set null',
  }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('exercises_profile_name_key').on(table.profileId, table.nameKey)],
);

export const exerciseVariants = sqliteTable(
  'exercise_variants',
  {
    id: text('id').primaryKey(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('exercise_variants_exercise').on(table.exerciseId)],
);

export const bodyParts = sqliteTable('body_parts', {
  id: text('id', { enum: bodyPartIds }).primaryKey(),
  name: text('name').notNull(),
});

export const exerciseBodyParts = sqliteTable(
  'exercise_body_parts',
  {
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    bodyPartId: text('body_part_id', { enum: bodyPartIds })
      .notNull()
      .references(() => bodyParts.id, { onDelete: 'restrict' }),
    role: text('role', { enum: bodyPartRoles }).notNull().default('primary'),
  },
  (table) => [primaryKey({ columns: [table.exerciseId, table.bodyPartId] })],
);

export const programs = sqliteTable('programs', {
  id: text('id').primaryKey(),
  profileId: text('profile_id')
    .notNull()
    .references(() => profiles.id),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const trainingBlocks = sqliteTable(
  'training_blocks',
  {
    id: text('id').primaryKey(),
    programId: text('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    label: text('label'),
  },
  (table) => [uniqueIndex('training_blocks_program_position').on(table.programId, table.position)],
);

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    programId: text('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
  },
  (table) => [uniqueIndex('workouts_program_position').on(table.programId, table.position)],
);

export const exerciseSlots = sqliteTable(
  'exercise_slots',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    isOptional: integer('is_optional', { mode: 'boolean' }).notNull().default(false),
    isPeriodized: integer('is_periodized', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [uniqueIndex('exercise_slots_workout_position').on(table.workoutId, table.position)],
);

export const plannedSets = sqliteTable(
  'planned_sets',
  {
    id: text('id').primaryKey(),
    exerciseSlotId: text('exercise_slot_id')
      .notNull()
      .references(() => exerciseSlots.id, { onDelete: 'cascade' }),
    trainingBlockId: text('training_block_id')
      .notNull()
      .references(() => trainingBlocks.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    targetReps: integer('target_reps').notNull(),
    lastWeightGrams: integer('last_weight_grams'),
    variantId: text('variant_id').references((): AnySQLiteColumn => exerciseVariants.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [
    uniqueIndex('planned_sets_slot_block_set').on(
      table.exerciseSlotId,
      table.trainingBlockId,
      table.setNumber,
    ),
  ],
);

export const plannedSetVariantWeights = sqliteTable(
  'planned_set_variant_weights',
  {
    plannedSetId: text('planned_set_id')
      .notNull()
      .references(() => plannedSets.id, { onDelete: 'cascade' }),
    variantId: text('variant_id')
      .notNull()
      .references(() => exerciseVariants.id, { onDelete: 'cascade' }),
    lastWeightGrams: integer('last_weight_grams').notNull(),
  },
  (table) => [primaryKey({ columns: [table.plannedSetId, table.variantId] })],
);

export const cycles = sqliteTable(
  'cycles',
  {
    id: text('id').primaryKey(),
    programId: text('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    currentBlockId: text('current_block_id').notNull(),
    pass: integer('pass').notNull(),
  },
  (table) => [uniqueIndex('cycles_program').on(table.programId)],
);

export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    programId: text('program_id').notNull(),
    cycleId: text('cycle_id').notNull(),
    pass: integer('pass').notNull(),
    trainingBlockId: text('training_block_id').notNull(),
    workoutId: text('workout_id').notNull(),
    status: text('status', { enum: sessionStatuses }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('workout_sessions_cycle_pass_block_workout').on(
      table.cycleId,
      table.pass,
      table.trainingBlockId,
      table.workoutId,
    ),
  ],
);

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    performedAt: integer('performed_at', { mode: 'timestamp_ms' }).notNull(),
    setNumber: integer('set_number').notNull(),
    reps: integer('reps').notNull(),
    weightGrams: integer('weight_grams'),
    programId: text('program_id').notNull(),
    cycleId: text('cycle_id').notNull(),
    trainingBlockId: text('training_block_id').notNull(),
    workoutId: text('workout_id').notNull(),
    exerciseSlotId: text('exercise_slot_id').notNull(),
    workoutSessionId: text('workout_session_id').notNull(),
    pass: integer('cycle_number').notNull(),
    blockNumber: integer('block_number').notNull(),
    variantId: text('variant_id'),
  },
  (table) => [
    index('set_logs_profile_exercise_performed').on(
      table.profileId,
      table.exerciseId,
      table.performedAt,
    ),
  ],
);

export const bodyweightEntries = sqliteTable(
  'bodyweight_entries',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    entryDate: text('entry_date').notNull(),
    weightGrams: integer('weight_grams').notNull(),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('bodyweight_profile_date').on(table.profileId, table.entryDate)],
);

export const programsRelations = relations(programs, ({ many }) => ({
  blocks: many(trainingBlocks),
  workouts: many(workouts),
  cycles: many(cycles),
}));

export const trainingBlocksRelations = relations(trainingBlocks, ({ one, many }) => ({
  program: one(programs, { fields: [trainingBlocks.programId], references: [programs.id] }),
  plannedSets: many(plannedSets),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  program: one(programs, { fields: [workouts.programId], references: [programs.id] }),
  slots: many(exerciseSlots),
}));

export const exerciseSlotsRelations = relations(exerciseSlots, ({ one, many }) => ({
  workout: one(workouts, { fields: [exerciseSlots.workoutId], references: [workouts.id] }),
  exercise: one(exercises, { fields: [exerciseSlots.exerciseId], references: [exercises.id] }),
  plannedSets: many(plannedSets),
}));

export const plannedSetsRelations = relations(plannedSets, ({ one }) => ({
  slot: one(exerciseSlots, {
    fields: [plannedSets.exerciseSlotId],
    references: [exerciseSlots.id],
  }),
  block: one(trainingBlocks, {
    fields: [plannedSets.trainingBlockId],
    references: [trainingBlocks.id],
  }),
}));

export const cyclesRelations = relations(cycles, ({ one }) => ({
  program: one(programs, { fields: [cycles.programId], references: [programs.id] }),
}));
