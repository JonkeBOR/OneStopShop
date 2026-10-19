import { notFound } from 'next/navigation';
import {
  listBodyParts,
  listProgramBodyPartLinks,
} from '@/features/fitness-tracker/server/body-parts';
import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { getProgram, listPrograms } from '@/features/fitness-tracker/server/programs';
import { getTrainingOverview } from '@/features/fitness-tracker/server/training';
import { ProgramEditScreen } from './ProgramEditScreen';

type ProgramEditPageProps = { params: Promise<{ programId: string }> };

export default async function ProgramEditPage({ params }: ProgramEditPageProps) {
  const { programId } = await params;
  const { db, profileId } = await requireFitnessContext(`/fitness-tracker/programs/${programId}`);
  const program = await getProgram(db, profileId, programId);
  if (!program.ok) {
    notFound();
  }
  const [summaries, overview, bodyPartLinks, bodyParts] = await Promise.all([
    listPrograms(db, profileId),
    program.value.isActive ? getTrainingOverview(db, profileId) : Promise.resolve(null),
    listProgramBodyPartLinks(db, profileId, programId),
    listBodyParts(db),
  ]);
  return (
    <ProgramEditScreen
      program={program.value}
      otherActiveProgramName={
        program.value.isActive
          ? null
          : (summaries.find((summary) => summary.isActive)?.name ?? null)
      }
      inProgressWorkoutIds={
        overview?.workouts
          .filter((workout) => workout.status === 'in-progress')
          .map((workout) => workout.id) ?? []
      }
      bodyPartLinks={bodyPartLinks}
      bodyParts={bodyParts}
    />
  );
}
