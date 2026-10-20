import { AddLink } from '@/features/fitness-tracker/components/AddLink';
import { NewNameForm } from '@/features/fitness-tracker/components/NewNameForm';
import { RenameForm } from '@/features/fitness-tracker/components/RenameForm';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import { SlotList } from '@/features/fitness-tracker/components/SlotList';
import type { WorkoutView } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './WorkoutEditScreen.module.css';

type WorkoutEditScreenProps = {
  programId: string;
  workout: WorkoutView | null;
};

const slotsHeadingId = 'workout-slots-heading';

export function WorkoutEditScreen({ programId, workout }: WorkoutEditScreenProps) {
  return (
    <Screen
      title={workout?.name ?? fitnessStrings.workoutEdit.newTitle}
      back={{
        href: `/fitness-tracker/programs/${programId}`,
        label: fitnessStrings.navigation.toProgram,
      }}
    >
      {workout ? (
        <RenameForm
          label={fitnessStrings.workoutEdit.nameLabel}
          currentName={workout.name}
          url={`/api/fitness/workouts/${workout.id}`}
        />
      ) : (
        <NewNameForm
          label={fitnessStrings.workoutEdit.nameLabel}
          url={`/api/fitness/programs/${programId}/workouts`}
          createdHrefPrefix={`/fitness-tracker/programs/${programId}/workouts`}
        />
      )}
      <section className={styles.section}>
        <div className={styles.headingRow}>
          <h2 id={slotsHeadingId} className={styles.heading}>
            {fitnessStrings.workoutEdit.slotsTitle}
          </h2>
          {workout ? (
            <AddLink
              href={`/fitness-tracker/programs/${programId}/workouts/${workout.id}/slots/new`}
              label={fitnessStrings.workoutEdit.addExercise}
            />
          ) : null}
        </div>
        {workout === null ? (
          <p className={styles.empty}>{fitnessStrings.workoutEdit.nameFirst}</p>
        ) : workout.slots.length === 0 ? (
          <p className={styles.empty}>{fitnessStrings.workoutEdit.noSlots}</p>
        ) : (
          <SlotList
            programId={programId}
            workoutId={workout.id}
            slots={workout.slots}
            className={styles.list}
            labelledBy={slotsHeadingId}
          />
        )}
      </section>
    </Screen>
  );
}
