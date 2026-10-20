import { NewNameForm } from '@/features/fitness-tracker/components/NewNameForm';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './NewProgramScreen.module.css';

export function NewProgramScreen() {
  return (
    <Screen
      title={fitnessStrings.programEdit.newTitle}
      back={{ href: '/fitness-tracker/programs', label: fitnessStrings.navigation.toPrograms }}
    >
      <NewNameForm
        label={fitnessStrings.programEdit.nameLabel}
        url="/api/fitness/programs"
        createdHrefPrefix="/fitness-tracker/programs"
      />
      <p className={styles.note}>{fitnessStrings.programEdit.nameFirst}</p>
    </Screen>
  );
}
