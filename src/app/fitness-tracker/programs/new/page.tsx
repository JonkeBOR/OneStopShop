import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { NewProgramScreen } from './NewProgramScreen';

export default async function NewProgramPage() {
  await requireFitnessContext('/fitness-tracker/programs/new');
  return <NewProgramScreen />;
}
