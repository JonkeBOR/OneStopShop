'use client';

import type { KeyboardEvent } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import type { BodyPart } from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import styles from './AnatomyChart.module.css';
import {
  type AnatomyMuscle,
  type AnatomyTone,
  anatomyBasePaths,
  anatomyViewBox,
  anatomyViews,
} from './anatomy-paths';

type AnatomyChartProps = {
  bodyParts: readonly BodyPartView[];
  selected: readonly BodyPart[];
} & (
  | { readOnly: true; pending?: never; onToggle?: never }
  | { readOnly?: false; pending?: readonly BodyPart[]; onToggle: (part: BodyPart) => void }
);

type PlacedMuscle = AnatomyMuscle & { key: string; isFirstCopy: boolean };

const toneClass: Record<AnatomyTone, string | undefined> = {
  body: styles.body,
  detail: styles.detail,
  shade: styles.shade,
};

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

export function AnatomyChart({
  bodyParts,
  selected,
  readOnly,
  pending = [],
  onToggle,
}: AnatomyChartProps) {
  const nameOf = (part: BodyPart) =>
    bodyParts.find((bodyPart) => bodyPart.id === part)?.name ?? part;
  const isSelected = (part: BodyPart) => selected.includes(part);
  const muscleClass = (part: BodyPart) =>
    [styles.muscle, isSelected(part) ? styles.selected : null]
      .filter((name) => name !== null)
      .join(' ');

  const base = anatomyBasePaths.map((path, index) => (
    <path key={index} className={toneClass[path.tone]} d={path.d} />
  ));

  if (readOnly || !onToggle) {
    const names = bodyParts
      .filter((bodyPart) => isSelected(bodyPart.id))
      .map((bodyPart) => bodyPart.name);
    return (
      <svg
        className={styles.chart}
        viewBox={anatomyViewBox}
        role="img"
        aria-label={fitnessStrings.anatomy.summary(names)}
      >
        {base}
        {placedMuscles.map((muscle) => (
          <g
            key={muscle.key}
            className={muscleClass(muscle.bodyPart)}
            data-muscle={muscle.bodyPart}
          >
            {muscle.paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        ))}
      </svg>
    );
  }

  const toggleOnKey = (part: BodyPart) => (event: KeyboardEvent) => {
    if (isToggleKey(event)) {
      event.preventDefault();
      onToggle(part);
    }
  };

  return (
    <svg
      className={`${styles.chart} ${styles.interactive}`}
      viewBox={anatomyViewBox}
      role="group"
      aria-label={fitnessStrings.anatomy.chartLabel}
    >
      {base}
      {placedMuscles.map((muscle) =>
        muscle.isFirstCopy ? (
          <g
            key={muscle.key}
            className={muscleClass(muscle.bodyPart)}
            data-muscle={muscle.bodyPart}
            role="checkbox"
            aria-checked={isSelected(muscle.bodyPart)}
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
            className={muscleClass(muscle.bodyPart)}
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
    </svg>
  );
}
