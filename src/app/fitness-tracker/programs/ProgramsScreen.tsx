import Link from 'next/link';
import { AddLink } from '@/features/fitness-tracker/components/AddLink';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import type { ProgramSummary } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './ProgramsScreen.module.css';

type ProgramsScreenProps = { programs: readonly ProgramSummary[] };

export function ProgramsScreen({ programs }: ProgramsScreenProps) {
  return (
    <Screen
      title={fitnessStrings.programs.title}
      back={{ href: '/fitness-tracker', label: fitnessStrings.navigation.toHome }}
      action={<AddLink href="/fitness-tracker/programs/new" label={fitnessStrings.programs.add} />}
    >
      {programs.length === 0 ? (
        <p className={styles.empty}>{fitnessStrings.programs.empty}</p>
      ) : (
        <ul className={styles.list}>
          {programs.map((program) => (
            <li key={program.id}>
              <Link className={styles.row} href={`/fitness-tracker/programs/${program.id}`}>
                <span className={styles.name}>{program.name}</span>
                <span className={styles.summary}>
                  {fitnessStrings.programs.summary(program.blockCount, program.workoutCount)}
                </span>
                {program.isActive ? (
                  <span className={styles.badge}>{fitnessStrings.programEdit.active}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
