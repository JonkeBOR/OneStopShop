import Link from 'next/link';
import { ActionButton } from '@/features/fitness-tracker/components/ActionButton';
import { BodyPartEditor } from '@/features/fitness-tracker/components/BodyPartEditor';
import { DeleteExerciseButton } from '@/features/fitness-tracker/components/DeleteExerciseButton';
import { RenameForm } from '@/features/fitness-tracker/components/RenameForm';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import type { BodyPartView, ExerciseUsage } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './ExerciseEditScreen.module.css';

type ExerciseEditScreenProps = { usage: ExerciseUsage; bodyParts: readonly BodyPartView[] };

const usedInHeadingId = 'exercise-used-in-heading';
const musclesHeadingId = 'exercise-muscles-heading';

export function ExerciseEditScreen({ usage, bodyParts }: ExerciseEditScreenProps) {
  const { exercise, slots, hasSetLogs } = usage;
  const url = `/api/fitness/exercises/${exercise.id}`;
  const canDelete = slots.length === 0 && !hasSetLogs;

  return (
    <Screen
      title={exercise.name}
      back={{ href: '/fitness-tracker/exercises', label: fitnessStrings.navigation.toExercises }}
    >
      <RenameForm
        label={fitnessStrings.exerciseEdit.nameLabel}
        currentName={exercise.name}
        url={url}
      />
      <section className={styles.section} aria-labelledby={musclesHeadingId}>
        <h2 id={musclesHeadingId} className={styles.heading}>
          {fitnessStrings.exerciseEdit.musclesHeading}
        </h2>
        <BodyPartEditor
          exerciseId={exercise.id}
          bodyParts={bodyParts}
          selected={usage.bodyParts.map((link) => link.bodyPart)}
        />
      </section>
      <section className={styles.section}>
        <h2 id={usedInHeadingId} className={styles.heading}>
          {fitnessStrings.exerciseEdit.usedIn}
        </h2>
        {slots.length === 0 ? (
          <p className={styles.empty}>{fitnessStrings.exerciseEdit.notUsed}</p>
        ) : (
          <ul className={styles.list} aria-labelledby={usedInHeadingId}>
            {slots.map((slot) => (
              <li key={`${slot.programId}:${slot.workoutId}`}>
                <Link
                  className={styles.link}
                  href={`/fitness-tracker/programs/${slot.programId}/workouts/${slot.workoutId}`}
                >
                  {fitnessStrings.exerciseEdit.usedItem(slot.programName, slot.workoutName)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className={styles.actions}>
        <ActionButton
          label={
            exercise.isArchived
              ? fitnessStrings.exerciseEdit.unarchive
              : fitnessStrings.exerciseEdit.archive
          }
          method="PATCH"
          url={url}
          body={{ isArchived: !exercise.isArchived }}
        />
        {canDelete ? <DeleteExerciseButton exerciseId={exercise.id} /> : null}
      </div>
    </Screen>
  );
}
