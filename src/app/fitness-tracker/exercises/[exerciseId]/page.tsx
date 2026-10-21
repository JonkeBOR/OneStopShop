import { notFound } from 'next/navigation';
import {
  localDay,
  oneRepMaxChart,
  parseChartRange,
} from '@/features/fitness-tracker/domain/progress-chart';
import { listBodyParts } from '@/features/fitness-tracker/server/body-parts';
import { getExerciseUsage } from '@/features/fitness-tracker/server/exercises';
import { getExerciseHistory } from '@/features/fitness-tracker/server/history';
import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { listAllVariants, listProgramSessions } from '@/features/fitness-tracker/server/progress';
import { readTimeZone } from '@/features/fitness-tracker/server/time-zone';
import { ExerciseEditScreen } from './ExerciseEditScreen';

type ExerciseEditPageProps = {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ range?: string; variant?: string }>;
};

export default async function ExerciseEditPage({ params, searchParams }: ExerciseEditPageProps) {
  const { exerciseId } = await params;
  const { range, variant } = await searchParams;
  const { db, profileId, now } = await requireFitnessContext(
    `/fitness-tracker/exercises/${exerciseId}`,
  );
  const timeZone = await readTimeZone();
  const [usage, bodyParts, history, variants, sessions] = await Promise.all([
    getExerciseUsage(db, profileId, exerciseId),
    listBodyParts(db),
    getExerciseHistory(db, profileId, exerciseId),
    listAllVariants(db, profileId, exerciseId),
    listProgramSessions(db, profileId),
  ]);
  if (!usage.ok) {
    notFound();
  }
  return (
    <ExerciseEditScreen
      usage={usage.value}
      bodyParts={bodyParts}
      oneRepMax={oneRepMaxChart({
        setLogs: history.ok ? history.value.setLogs : [],
        variants,
        sessions,
        today: localDay(now, timeZone),
        timeZone,
        range: parseChartRange(range),
        requestedVariant: variant,
      })}
    />
  );
}
