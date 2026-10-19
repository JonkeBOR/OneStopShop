import { ActivateButton } from '@/features/fitness-tracker/components/ActivateButton';
import { ActionButton } from '@/features/fitness-tracker/components/ActionButton';
import { AddLink } from '@/features/fitness-tracker/components/AddLink';
import { BlockRow } from '@/features/fitness-tracker/components/BlockRow';
import { DeleteProgramButton } from '@/features/fitness-tracker/components/DeleteProgramButton';
import { PauseButton } from '@/features/fitness-tracker/components/PauseButton';
import { ProgramVolume } from '@/features/fitness-tracker/components/ProgramVolume';
import { RenameForm } from '@/features/fitness-tracker/components/RenameForm';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import { WorkoutList } from '@/features/fitness-tracker/components/WorkoutList';
import type { BodyPartLink } from '@/features/fitness-tracker/domain/body-part';
import type { BlockView, BodyPartView, Program } from '@/features/fitness-tracker/domain/types';
import { weeklyVolume } from '@/features/fitness-tracker/domain/volume';
import Link from 'next/link';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './ProgramEditScreen.module.css';

type ProgramEditScreenProps = {
  program: Program;
  otherActiveProgramName: string | null;
  inProgressWorkoutIds: readonly string[];
  bodyPartLinks: ReadonlyMap<string, readonly BodyPartLink[]>;
  bodyParts: readonly BodyPartView[];
};

const blocksHeadingId = 'program-blocks-heading';
const workoutsHeadingId = 'program-workouts-heading';
const volumeHeadingId = 'program-volume-heading';

function blockRemoveMessage(program: Program, block: BlockView, index: number): string {
  if (block.id !== program.cycle.currentBlockId) {
    return fitnessStrings.programEdit.removeBlockPlain(block.number);
  }
  const next = program.blocks[index + 1];
  return next === undefined
    ? fitnessStrings.programEdit.removeCurrentBlockStartsAgain(block.number)
    : fitnessStrings.programEdit.removeCurrentBlockMovesOn(block.number, next.number);
}

function workoutRemoveMessage(program: Program, name: string, isInProgress: boolean): string {
  return [
    fitnessStrings.programEdit.removeWorkoutPlain(name),
    isInProgress ? fitnessStrings.programEdit.removeWorkoutInProgress : null,
    program.isActive ? fitnessStrings.programEdit.removeWorkoutMovesOn : null,
  ]
    .filter((sentence) => sentence !== null)
    .join(' ');
}

export function ProgramEditScreen({
  program,
  otherActiveProgramName,
  inProgressWorkoutIds,
  bodyPartLinks,
  bodyParts,
}: ProgramEditScreenProps) {
  const volumes = program.blocks.map((block) => ({
    block,
    sets: weeklyVolume(program.workouts, block.id, bodyPartLinks),
  }));

  return (
    <Screen
      title={program.name}
      back={{ href: '/fitness-tracker/programs', label: fitnessStrings.navigation.toPrograms }}
    >
      <RenameForm
        label={fitnessStrings.programEdit.nameLabel}
        currentName={program.name}
        url={`/api/fitness/programs/${program.id}`}
      />
      <div className={styles.status}>
        {program.isActive ? (
          <>
            <span className={styles.badge}>{fitnessStrings.programEdit.active}</span>
            <PauseButton triggerLabel={fitnessStrings.programEdit.pause} />
            <Link className={styles.link} href="/fitness-tracker/active">
              {fitnessStrings.programEdit.openActiveProgram}
            </Link>
          </>
        ) : (
          <ActivateButton programId={program.id} otherActiveProgramName={otherActiveProgramName} />
        )}
      </div>
      {program.isActive ? (
        <p className={styles.note}>{fitnessStrings.programEdit.futureOnlyNote}</p>
      ) : null}

      <section className={styles.section}>
        <h2 id={blocksHeadingId} className={styles.heading}>
          {fitnessStrings.programEdit.blocksTitle}
        </h2>
        <ul className={styles.list} aria-labelledby={blocksHeadingId}>
          {program.blocks.map((block, index) => (
            <li key={block.id}>
              <BlockRow
                block={block}
                canRemove={program.blocks.length > 1}
                removeMessage={blockRemoveMessage(program, block, index)}
              />
            </li>
          ))}
        </ul>
        <ActionButton
          label={fitnessStrings.programEdit.addBlock}
          method="POST"
          url={`/api/fitness/programs/${program.id}/blocks`}
          body={{}}
        />
      </section>

      {program.workouts.length > 0 ? (
        <section className={styles.section} aria-labelledby={volumeHeadingId}>
          <h2 id={volumeHeadingId} className={styles.heading}>
            {fitnessStrings.programVolume.heading}
          </h2>
          <ProgramVolume
            volumes={volumes}
            bodyParts={bodyParts}
            currentBlockId={program.cycle.currentBlockId}
          />
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.headingRow}>
          <h2 id={workoutsHeadingId} className={styles.heading}>
            {fitnessStrings.programEdit.workoutsTitle}
          </h2>
          <AddLink
            href={`/fitness-tracker/programs/${program.id}/workouts/new`}
            label={fitnessStrings.programEdit.addWorkout}
          />
        </div>
        {program.workouts.length === 0 ? (
          <p className={styles.empty}>{fitnessStrings.programEdit.noWorkouts}</p>
        ) : (
          <WorkoutList
            programId={program.id}
            workouts={program.workouts.map((workout) => ({
              id: workout.id,
              name: workout.name,
              removeMessage: workoutRemoveMessage(
                program,
                workout.name,
                inProgressWorkoutIds.includes(workout.id),
              ),
            }))}
            className={styles.list}
            labelledBy={workoutsHeadingId}
          />
        )}
      </section>

      {program.isActive ? null : <DeleteProgramButton programId={program.id} />}
    </Screen>
  );
}
