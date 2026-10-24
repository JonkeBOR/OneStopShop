import Link from 'next/link';
import { BlockWorkoutRow } from '@/features/fitness-tracker/components/BlockWorkoutRow';
import type { TrainingOverview } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './WorkoutFinishedScreen.module.css';

type WorkoutFinishedScreenProps = {
  affirmation: string;
  workoutName: string;
  overview: TrainingOverview;
  completedBlock: number | null;
  startedAgain: boolean;
  timeZone: string;
};

export function WorkoutFinishedScreen({
  affirmation,
  workoutName,
  overview,
  completedBlock,
  startedAgain,
  timeZone,
}: WorkoutFinishedScreenProps) {
  const nextWorkout = overview.workouts.find(
    (workout) => workout.id === overview.suggestedWorkoutId,
  );
  const blockTitle = fitnessStrings.block.title(
    overview.currentBlock.number,
    overview.currentBlock.label,
  );

  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <svg className={styles.mark} viewBox="0 0 52 52" aria-hidden="true">
          <path
            className={styles.ring}
            d="M26 2a24 24 0 1 1 0 48a24 24 0 1 1 0-48"
            pathLength={1}
          />
          <circle className={styles.disc} cx="26" cy="26" r="24" />
          <path className={styles.tick} d="M15 27l7 7 15-15" pathLength={1} />
        </svg>
        <h1 className={styles.title}>{affirmation}</h1>
        <p className={styles.summary}>{fitnessStrings.finished.summary(workoutName)}</p>
        {completedBlock === null ? null : (
          <p role="status" className={styles.notice}>
            {startedAgain
              ? fitnessStrings.block.programComplete
              : fitnessStrings.block.blockComplete(completedBlock)}
          </p>
        )}
        {nextWorkout === undefined ? null : (
          <BlockWorkoutRow workout={nextWorkout} isSuggested timeZone={timeZone} />
        )}
        <Link className={styles.toBlock} href="/fitness-tracker/active/block">
          {fitnessStrings.finished.toBlock(blockTitle)}
        </Link>
      </div>
    </main>
  );
}
