import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';
import type { BodyweightMeasurement } from './bodyweight';
import styles from './BodyweightHistory.module.css';

type BodyweightHistoryProps = {
  measurements: readonly BodyweightMeasurement[];
};

export function BodyweightHistory({ measurements }: BodyweightHistoryProps) {
  if (measurements.length === 0) {
    return <p className={styles.empty}>{fitnessTrackerStrings.emptyHistory}</p>;
  }

  return (
    <ul className={styles.list}>
      {measurements.map((measurement) => {
        const weightLabel = `${measurement.kilograms} ${fitnessTrackerStrings.weightUnit}`;
        return (
          <li className={styles.row} key={measurement.id}>
            <span className={styles.date}>{measurement.recordedOn}</span>
            <span className={styles.weight}>{weightLabel}</span>
          </li>
        );
      })}
    </ul>
  );
}
