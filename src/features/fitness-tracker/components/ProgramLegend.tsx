import { fitnessStrings } from '@/lib/strings/fitness';
import type { LegendEntry } from '../domain/progress-chart';
import styles from './ProgramLegend.module.css';

type ProgramLegendProps = { entries: readonly LegendEntry[] };

const swatchClasses = [styles.swatch0, styles.swatch1, styles.swatch2, styles.swatch3];

function entryName(entry: LegendEntry): string {
  return entry.isDeleted ? fitnessStrings.progress.deletedProgram(entry.name) : entry.name;
}

export function ProgramLegend({ entries }: ProgramLegendProps) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <ul className={styles.legend} aria-label={fitnessStrings.progress.legendLabel}>
      {entries.map((entry) => (
        <li key={entry.programId} className={styles.entry}>
          <span
            className={`${styles.swatch} ${swatchClasses[entry.colorIndex] ?? styles.swatch0}`}
            aria-hidden="true"
          />
          {entryName(entry)}
        </li>
      ))}
    </ul>
  );
}
