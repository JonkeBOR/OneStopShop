import { notFound, redirect } from 'next/navigation';
import { parseCompletedBlock } from '@/features/fitness-tracker/domain/values';
import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { readTimeZone } from '@/features/fitness-tracker/server/time-zone';
import { getSession, getTrainingOverview } from '@/features/fitness-tracker/server/training';
import { fitnessStrings } from '@/lib/strings/fitness';
import { WorkoutFinishedScreen } from './WorkoutFinishedScreen';

type WorkoutFinishedPageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ completed?: string }>;
};

function randomAffirmation(): string {
  const { affirmations } = fitnessStrings.finished;
  return affirmations[Math.floor(Math.random() * affirmations.length)] ?? affirmations[0];
}

export default async function WorkoutFinishedPage({
  params,
  searchParams,
}: WorkoutFinishedPageProps) {
  const { sessionId } = await params;
  const { completed } = await searchParams;
  const { db, profileId } = await requireFitnessContext(
    `/fitness-tracker/active/sessions/${sessionId}/finished`,
  );
  const session = await getSession(db, profileId, sessionId);
  if (!session.ok) {
    notFound();
  }
  if (session.value.status !== 'finished') {
    redirect(`/fitness-tracker/active/sessions/${sessionId}`);
  }
  const overview = await getTrainingOverview(db, profileId);
  if (overview === null) {
    redirect('/fitness-tracker');
  }
  const completedBlock = parseCompletedBlock(completed);
  return (
    <WorkoutFinishedScreen
      affirmation={randomAffirmation()}
      workoutName={session.value.workout.name}
      overview={overview}
      completedBlock={completedBlock}
      startedAgain={completedBlock !== null && overview.currentBlock.number === 1}
      timeZone={await readTimeZone()}
    />
  );
}
