import { NewNameForm } from '@/features/fitness-tracker/components/NewNameForm';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './NewExerciseScreen.module.css';

export function NewExerciseScreen() {
  return (
    <Screen
      title={fitnessStrings.exerciseEdit.newTitle}
      back={{ href: '/fitness-tracker/exercises', label: fitnessStrings.navigation.toExercises }}
    >
      <NewNameForm
        label={fitnessStrings.exerciseEdit.nameLabel}
        url="/api/fitness/exercises"
        createdHrefPrefix="/fitness-tracker/exercises"
      />
      <p className={styles.note}>{fitnessStrings.exerciseEdit.nameFirst}</p>
    </Screen>
  );
}
