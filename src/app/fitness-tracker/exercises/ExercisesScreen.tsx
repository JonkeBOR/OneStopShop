import { AddLink } from '@/features/fitness-tracker/components/AddLink';
import { ExerciseList } from '@/features/fitness-tracker/components/ExerciseList';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import type { Exercise } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';

type ExercisesScreenProps = { exercises: readonly Exercise[] };

export function ExercisesScreen({ exercises }: ExercisesScreenProps) {
  return (
    <Screen
      title={fitnessStrings.exercises.title}
      back={{ href: '/fitness-tracker', label: fitnessStrings.navigation.toHome }}
      action={
        <AddLink href="/fitness-tracker/exercises/new" label={fitnessStrings.exercises.add} />
      }
    >
      <ExerciseList exercises={exercises} />
    </Screen>
  );
}
