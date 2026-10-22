import Link from 'next/link';
import { ActionButton } from '@/features/fitness-tracker/components/ActionButton';
import { BodyPartEditor } from '@/features/fitness-tracker/components/BodyPartEditor';
import { DeleteExerciseButton } from '@/features/fitness-tracker/components/DeleteExerciseButton';
import { type ChartFilter, ChartFilters } from '@/features/fitness-tracker/components/ChartFilters';
import { ProgramLegend } from '@/features/fitness-tracker/components/ProgramLegend';
import { ProgressLineChart } from '@/features/fitness-tracker/components/ProgressLineChart';
import { VariantEditor } from '@/features/fitness-tracker/components/VariantEditor';
import { RenameForm } from '@/features/fitness-tracker/components/RenameForm';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import {
  type ChartRange,
  chartRanges,
  type ExerciseChart,
  type ExerciseMetric,
  exerciseMetrics,
} from '@/features/fitness-tracker/domain/progress-chart';
import type { BodyPartView, ExerciseUsage } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import styles from './ExerciseEditScreen.module.css';

type ExerciseEditScreenProps = {
  usage: ExerciseUsage;
  bodyParts: readonly BodyPartView[];
  chart: ExerciseChart;
};

const usedInHeadingId = 'exercise-used-in-heading';
const musclesHeadingId = 'exercise-muscles-heading';
const variantsHeadingId = 'exercise-variants-heading';
const progressHeadingId = 'exercise-progress-heading';

function chartHref(
  exerciseId: string,
  metric: ExerciseMetric,
  range: ChartRange,
  variant: string | null,
): string {
  const path = `/fitness-tracker/exercises/${exerciseId}?metric=${metric}&range=${range}`;
  return variant === null ? path : `${path}&variant=${variant}`;
}

function ProgressSection({ exerciseId, chart }: { exerciseId: string; chart: ExerciseChart }) {
  const progress = fitnessStrings.progress;
  const metricText = progress.metrics[chart.metric];
  const metricFilter: ChartFilter = {
    label: progress.metricLabel,
    value: chart.metric,
    options: exerciseMetrics.map((metric) => ({
      value: metric,
      text: progress.metrics[metric].option,
      href: chartHref(exerciseId, metric, chart.range, chart.selectedParam),
    })),
  };
  const rangeFilter: ChartFilter = {
    label: progress.rangeLabel,
    value: chart.range,
    options: chartRanges.map((range) => ({
      value: range,
      text: progress.ranges[range],
      href: chartHref(exerciseId, chart.metric, range, chart.selectedParam),
    })),
  };
  const variantFilter: ChartFilter = {
    label: progress.variantLabel,
    value: chart.selectedParam ?? '',
    options: chart.chips.map((chip) => ({
      value: chip.param,
      text: chip.variantName ?? progress.noVariant,
      href: chartHref(exerciseId, chart.metric, chart.range, chip.param),
    })),
  };
  const filters =
    chart.chips.length === 0
      ? [metricFilter, rangeFilter]
      : [metricFilter, rangeFilter, variantFilter];
  return (
    <section className={styles.section} aria-labelledby={progressHeadingId}>
      <h2 id={progressHeadingId} className={styles.heading}>
        {progress.heading}
      </h2>
      {chart.metric === '1rm' && <p className={styles.note}>{progress.metrics['1rm'].note}</p>}
      <ChartFilters filters={filters} />
      {chart.points.length === 0 ? (
        <p className={styles.empty}>{metricText.empty}</p>
      ) : (
        <>
          <ProgressLineChart
            label={metricText.chartLabel}
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

export function ExerciseEditScreen({ usage, bodyParts, chart }: ExerciseEditScreenProps) {
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
      <ProgressSection exerciseId={exercise.id} chart={chart} />
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
