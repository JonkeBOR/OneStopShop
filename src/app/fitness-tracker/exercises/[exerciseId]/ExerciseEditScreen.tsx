import Link from 'next/link';
import { ActionButton } from '@/features/fitness-tracker/components/ActionButton';
import { BodyPartEditor } from '@/features/fitness-tracker/components/BodyPartEditor';
import { DeleteExerciseButton } from '@/features/fitness-tracker/components/DeleteExerciseButton';
import { FilterLinks } from '@/features/fitness-tracker/components/FilterLinks';
import { ProgramLegend } from '@/features/fitness-tracker/components/ProgramLegend';
import { ProgressLineChart } from '@/features/fitness-tracker/components/ProgressLineChart';
import { VariantEditor } from '@/features/fitness-tracker/components/VariantEditor';
import { RenameForm } from '@/features/fitness-tracker/components/RenameForm';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import {
  type ChartRange,
  chartRanges,
  type OneRepMaxChart,
} from '@/features/fitness-tracker/domain/progress-chart';
import type { BodyPartView, ExerciseUsage } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './ExerciseEditScreen.module.css';

type ExerciseEditScreenProps = {
  usage: ExerciseUsage;
  bodyParts: readonly BodyPartView[];
  oneRepMax: OneRepMaxChart;
};

const usedInHeadingId = 'exercise-used-in-heading';
const musclesHeadingId = 'exercise-muscles-heading';
const variantsHeadingId = 'exercise-variants-heading';
const oneRepMaxHeadingId = 'exercise-one-rep-max-heading';

function chartHref(exerciseId: string, range: ChartRange, variant: string | null): string {
  const path = `/fitness-tracker/exercises/${exerciseId}?range=${range}`;
  return variant === null ? path : `${path}&variant=${variant}`;
}

function OneRepMaxSection({ exerciseId, chart }: { exerciseId: string; chart: OneRepMaxChart }) {
  const progress = fitnessStrings.progress;
  const rangeLinks = chartRanges.map((range) => ({
    key: range,
    text: progress.ranges[range],
    href: chartHref(exerciseId, range, chart.selectedParam),
    isSelected: range === chart.range,
  }));
  const variantLinks = chart.chips.map((chip) => ({
    key: chip.param,
    text: chip.variantName ?? progress.noVariant,
    href: chartHref(exerciseId, chart.range, chip.param),
    isSelected: chip.isSelected,
  }));
  return (
    <section className={styles.section} aria-labelledby={oneRepMaxHeadingId}>
      <h2 id={oneRepMaxHeadingId} className={styles.heading}>
        {progress.oneRepMax.heading}
      </h2>
      <p className={styles.note}>{progress.oneRepMax.note}</p>
      <FilterLinks label={progress.rangeLabel} links={rangeLinks} />
      {variantLinks.length === 0 ? null : (
        <FilterLinks label={progress.variantLabel} links={variantLinks} />
      )}
      {chart.points.length === 0 ? (
        <p className={styles.empty}>{progress.oneRepMax.empty}</p>
      ) : (
        <>
          <ProgressLineChart
            label={progress.oneRepMax.chartLabel}
            points={chart.points}
            domain={chart.domain}
            bands={chart.bands}
          />
          <ProgramLegend entries={chart.legend} />
        </>
      )}
    </section>
  );
}

export function ExerciseEditScreen({ usage, bodyParts, oneRepMax }: ExerciseEditScreenProps) {
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
      <OneRepMaxSection exerciseId={exercise.id} chart={oneRepMax} />
      <section className={styles.section} aria-labelledby={musclesHeadingId}>
        <h2 id={musclesHeadingId} className={styles.heading}>
          {fitnessStrings.exerciseEdit.musclesHeading}
        </h2>
        <BodyPartEditor exerciseId={exercise.id} bodyParts={bodyParts} links={usage.bodyParts} />
      </section>
      <section className={styles.section} aria-labelledby={variantsHeadingId}>
        <h2 id={variantsHeadingId} className={styles.heading}>
          {fitnessStrings.exerciseEdit.variants.heading}
        </h2>
        <VariantEditor exerciseId={exercise.id} variants={usage.variants} />
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
