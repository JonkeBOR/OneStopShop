'use client';

import { type KeyboardEvent, type ReactElement, useId } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import {
  type BodyPart,
  type BodyPartRole,
  bodyPartRoles,
  isBodyPartRole,
} from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import type { VolumeLevel } from '../domain/volume';
import styles from './AnatomyChart.module.css';
import {
  type AnatomyMuscle,
  type AnatomyTone,
  anatomyBasePaths,
  anatomyViewBox,
  anatomyViews,
} from './anatomy-paths';

export type Highlight = BodyPartRole | Exclude<VolumeLevel, 'none'>;

export type AnatomyLegendEntry = { highlight: Highlight | null; label: string };

type AnatomyChartProps = {
  bodyParts: readonly BodyPartView[];
  highlights?: Partial<Record<BodyPart, Highlight>>;
  legend?: readonly AnatomyLegendEntry[];
} & (
  | { readOnly: true; label?: string; pending?: never; onToggle?: never }
  | {
      readOnly?: false;
      label?: never;
      pending?: readonly BodyPart[];
      onToggle: (part: BodyPart) => void;
    }
);

type PlacedMuscle = AnatomyMuscle & { key: string; isFirstCopy: boolean };

const toneClass: Record<AnatomyTone, string | undefined> = {
  body: styles.body,
  detail: styles.detail,
  shade: styles.shade,
};

const highlightClass: Record<Highlight, string | undefined> = {
  primary: styles.primary,
  secondary: styles.secondary,
  low: styles.low,
  target: styles.target,
  high: styles.high,
};

function muscleClass(highlight: Highlight | null | undefined): string {
  return [styles.muscle, highlight ? highlightClass[highlight] : undefined]
    .filter((name) => name !== undefined)
    .join(' ');
}

const placedMuscles: readonly PlacedMuscle[] = anatomyViews.flatMap((view, viewIndex) =>
  view.muscles.map((muscle) => ({
    ...muscle,
    key: `${view.view}:${muscle.bodyPart}`,
    isFirstCopy: !anatomyViews
      .slice(0, viewIndex)
      .some((earlier) => earlier.muscles.some((other) => other.bodyPart === muscle.bodyPart)),
  })),
);

function isToggleKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Enter';
}

function withLegend(chart: ReactElement, legend: readonly AnatomyLegendEntry[] | undefined) {
  if (legend === undefined) {
    return chart;
  }
  return (
    <div className={styles.figure}>
      {chart}
      <ul className={styles.legend}>
        {legend.map((entry) => (
          <li key={entry.label} className={styles.legendItem}>
            <svg className={styles.swatch} viewBox="0 0 1 1" aria-hidden>
              <rect className={muscleClass(entry.highlight)} width="1" height="1" />
            </svg>
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnatomyChart({
  bodyParts,
  highlights = {},
  legend,
  readOnly,
  label,
  pending = [],
  onToggle,
}: AnatomyChartProps) {
  const roleTextId = useId();
  const roleTextIdOf = (role: BodyPartRole) => `${roleTextId}-${role}`;
  const nameOf = (part: BodyPart) =>
    bodyParts.find((bodyPart) => bodyPart.id === part)?.name ?? part;
  const highlightOf = (part: BodyPart) => highlights[part];
  const roleOf = (part: BodyPart) => {
    const highlight = highlightOf(part);
    return isBodyPartRole(highlight) ? highlight : undefined;
  };
  const describedBy = (role: BodyPartRole | undefined) =>
    role === undefined ? undefined : roleTextIdOf(role);

  const base = anatomyBasePaths.map((path, index) => (
    <path key={index} className={toneClass[path.tone]} d={path.d} />
  ));

  if (readOnly || !onToggle) {
    const names = bodyParts
      .filter((bodyPart) => highlightOf(bodyPart.id) !== undefined)
      .map((bodyPart) => bodyPart.name);
    return withLegend(
      <svg
        className={styles.chart}
        viewBox={anatomyViewBox}
        role="img"
        aria-label={label ?? fitnessStrings.anatomy.summary(names)}
      >
        {base}
        {placedMuscles.map((muscle) => (
          <g
            key={muscle.key}
            className={muscleClass(highlightOf(muscle.bodyPart))}
            data-muscle={muscle.bodyPart}
          >
            {muscle.paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        ))}
      </svg>,
      legend,
    );
  }

  const toggleOnKey = (part: BodyPart) => (event: KeyboardEvent) => {
    if (isToggleKey(event)) {
      event.preventDefault();
      onToggle(part);
    }
  };

  return withLegend(
    <svg
      className={`${styles.chart} ${styles.interactive}`}
      viewBox={anatomyViewBox}
      role="group"
      aria-label={fitnessStrings.anatomy.chartLabel}
    >
      {base}
      {bodyPartRoles.map((role) => (
        <text key={role} id={roleTextIdOf(role)} className={styles.roleText}>
          {fitnessStrings.anatomy.roles[role]}
        </text>
      ))}
      {placedMuscles.map((muscle) =>
        muscle.isFirstCopy ? (
          <g
            key={muscle.key}
            className={muscleClass(highlightOf(muscle.bodyPart))}
            data-muscle={muscle.bodyPart}
            role="checkbox"
            aria-checked={highlightOf(muscle.bodyPart) !== undefined}
            aria-describedby={describedBy(roleOf(muscle.bodyPart))}
            aria-busy={pending.includes(muscle.bodyPart) || undefined}
            aria-label={nameOf(muscle.bodyPart)}
            tabIndex={0}
            onClick={() => onToggle(muscle.bodyPart)}
            onKeyDown={toggleOnKey(muscle.bodyPart)}
          >
            {muscle.paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        ) : (
          <g
            key={muscle.key}
            className={muscleClass(highlightOf(muscle.bodyPart))}
            data-muscle={muscle.bodyPart}
            aria-hidden
            onClick={() => onToggle(muscle.bodyPart)}
          >
            {muscle.paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        ),
      )}
    </svg>,
    legend,
  );
}
