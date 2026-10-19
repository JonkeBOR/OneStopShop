import type { Program, SessionView, TrainingOverview } from '../domain/types';

export function overviewFixture(overrides: Partial<TrainingOverview> = {}): TrainingOverview {
  return {
    program: { id: 'p1', name: 'Strength' },
    currentBlock: { id: 'b2', number: 2, label: 'Deload', isLast: false },
    blocks: [
      { id: 'b1', number: 1, label: null, status: 'complete', finishedCount: 2 },
      { id: 'b2', number: 2, label: 'Deload', status: 'current', finishedCount: 1 },
      { id: 'b3', number: 3, label: null, status: 'upcoming', finishedCount: 0 },
    ],
    workoutCount: 2,
    workouts: [
      {
        id: 'w1',
        name: 'Upper A',
        status: 'finished',
        sessionId: 's1',
        finishedAt: new Date('2026-10-01T09:00:00Z'),
      },
      { id: 'w2', name: 'Lower A', status: 'not-started', sessionId: null, finishedAt: null },
    ],
    suggestedWorkoutId: 'w2',
    ...overrides,
  };
}

export function programFixture(overrides: Partial<Program> = {}): Program {
  const exercise = { id: 'e1', name: 'Incline bench press', isArchived: false };
  const prescription = (blockId: string, targets: number[]) => ({
    blockId,
    plannedSets: targets.map((targetReps, index) => ({
      id: `${blockId}-${index + 1}`,
      setNumber: index + 1,
      targetReps,
      lastWeightKg: index === 0 ? 62.5 : null,
    })),
  });
  return {
    id: 'p1',
    name: 'Strength',
    isActive: true,
    blocks: [
      { id: 'b1', number: 1, label: null },
      { id: 'b2', number: 2, label: 'Deload' },
      { id: 'b3', number: 3, label: null },
    ],
    workouts: [
      {
        id: 'w1',
        name: 'Upper A',
        slots: [
          {
            id: 's1',
            exercise,
            isOptional: false,
            isPeriodized: true,
            prescriptions: [
              prescription('b1', [12, 12, 12]),
              prescription('b2', [10, 10, 10]),
              prescription('b3', [8, 8]),
            ],
          },
          {
            id: 's2',
            exercise: { id: 'e2', name: 'Curl', isArchived: false },
            isOptional: true,
            isPeriodized: false,
            prescriptions: [
              prescription('b1', [12]),
              prescription('b2', [12]),
              prescription('b3', [12]),
            ],
          },
        ],
      },
      { id: 'w2', name: 'Lower A', slots: [] },
    ],
    cycle: { id: 'c1', currentBlockId: 'b2', pass: 1 },
    ...overrides,
  };
}

export function sessionFixture(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: 'session-1',
    status: 'in_progress',
    startedAt: new Date('2026-10-03T08:00:00Z'),
    finishedAt: null,
    workout: { id: 'w1', name: 'Day 1' },
    block: { id: 'b2', number: 2, label: null },
    slots: [
      {
        id: 's1',
        exercise: { id: 'e1', name: 'Incline bench press', isArchived: false },
        isOptional: false,
        plannedSets: [
          { id: 'p1', setNumber: 1, targetReps: 12, suggestedWeightKg: 65 },
          { id: 'p2', setNumber: 2, targetReps: 12, suggestedWeightKg: 62.5 },
          { id: 'p3', setNumber: 3, targetReps: 10, suggestedWeightKg: null },
        ],
        loggedSets: [],
        variants: [],
        selectedVariantId: null,
      },
      {
        id: 's2',
        exercise: { id: 'e2', name: 'Curl', isArchived: false },
        isOptional: true,
        plannedSets: [{ id: 'p4', setNumber: 1, targetReps: 12, suggestedWeightKg: null }],
        loggedSets: [],
        variants: [],
        selectedVariantId: null,
      },
    ],
    ...overrides,
  };
}
