import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { NewExerciseScreen } from './NewExerciseScreen';

export default async function NewExercisePage() {
  await requireFitnessContext('/fitness-tracker/exercises/new');
  return <NewExerciseScreen />;
}
