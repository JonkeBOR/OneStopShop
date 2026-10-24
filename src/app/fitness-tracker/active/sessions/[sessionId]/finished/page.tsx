import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { parseCompletedBlock } from '@/features/fitness-tracker/domain/values';
import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { readTimeZone } from '@/features/fitness-tracker/server/time-zone';
import { getSession, getTrainingOverview } from '@/features/fitness-tracker/server/training';
import { SessionAffirmation } from './SessionAffirmation';
import { WorkoutFinishedScreen } from './WorkoutFinishedScreen';

type WorkoutFinishedPageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ completed?: string }>;
};

export default async function WorkoutFinishedPage({
  params,
  searchParams,
}: WorkoutFinishedPageProps) {
  const { sessionId } = await params;
  const { completed } = await searchParams;
  const { db, profileId, now } = await requireFitnessContext(
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
      affirmation={
        <Suspense fallback={null}>
          <SessionAffirmation db={db} profileId={profileId} session={session.value} now={now} />
        </Suspense>
      }
      workoutName={session.value.workout.name}
      overview={overview}
      completedBlock={completedBlock}
      startedAgain={completedBlock !== null && overview.currentBlock.number === 1}
      timeZone={await readTimeZone()}
    />
  );
}
