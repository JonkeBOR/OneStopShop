import { notFound } from 'next/navigation';
import { listBodyParts } from '@/features/fitness-tracker/server/body-parts';
import { getExerciseUsage } from '@/features/fitness-tracker/server/exercises';
import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { ExerciseEditScreen } from './ExerciseEditScreen';

type ExerciseEditPageProps = { params: Promise<{ exerciseId: string }> };

export default async function ExerciseEditPage({ params }: ExerciseEditPageProps) {
  const { exerciseId } = await params;
  const { db, profileId } = await requireFitnessContext(`/fitness-tracker/exercises/${exerciseId}`);
  const [usage, bodyParts] = await Promise.all([
    getExerciseUsage(db, profileId, exerciseId),
    listBodyParts(db),
  ]);
  if (!usage.ok) {
    notFound();
  }
  return <ExerciseEditScreen usage={usage.value} bodyParts={bodyParts} />;
}
