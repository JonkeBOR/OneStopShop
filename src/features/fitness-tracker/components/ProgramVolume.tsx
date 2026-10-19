'use client';

import { useId, useState } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import { type BodyPart, bodyPartIds } from '../domain/body-part';
import type { BlockView, BodyPartView } from '../domain/types';
import { type VolumeLevel, volumeLevel, volumeLevels } from '../domain/volume';
import { type AnatomyLegendEntry, AnatomyChart, type Highlight } from './AnatomyChart';
import styles from './ProgramVolume.module.css';

export type BlockVolume = { block: BlockView; sets: Record<BodyPart, number> };

type ProgramVolumeProps = {
  volumes: readonly BlockVolume[];
  bodyParts: readonly BodyPartView[];
  currentBlockId: string;
};

const strings = fitnessStrings.programVolume;

function highlightOf(level: VolumeLevel): Highlight | null {
  return level === 'none' ? null : level;
}

const legend: readonly AnatomyLegendEntry[] = volumeLevels.map((level) => ({
  highlight: highlightOf(level),
  label: strings.levels[level],
}));

function blockTitle(block: BlockView): string {
  return fitnessStrings.block.title(block.number, block.label);
}

export function ProgramVolume({ volumes, bodyParts, currentBlockId }: ProgramVolumeProps) {
  const selectId = useId();
  const [blockId, setBlockId] = useState(currentBlockId);
  const volume = volumes.find((candidate) => candidate.block.id === blockId) ?? volumes[0];
  if (volume === undefined) {
    return null;
  }

  const highlights: Partial<Record<BodyPart, Highlight>> = Object.fromEntries(
    bodyPartIds.flatMap((part) => {
      const highlight = highlightOf(volumeLevel(volume.sets[part]));
      return highlight === null ? [] : [[part, highlight]];
    }),
  );
  const rows = bodyParts.toSorted(
    (left, right) =>
      volume.sets[right.id] - volume.sets[left.id] ||
      bodyPartIds.indexOf(left.id) - bodyPartIds.indexOf(right.id),
  );

  return (
    <div className={styles.volume}>
      {volumes.length > 1 ? (
        <div className={styles.picker}>
          <label className={styles.label} htmlFor={selectId}>
            {strings.blockLabel}
          </label>
          <select
            id={selectId}
            className={styles.select}
            value={volume.block.id}
            onChange={(event) => setBlockId(event.target.value)}
          >
            {volumes.map(({ block }) => (
              <option key={block.id} value={block.id}>
                {blockTitle(block)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <AnatomyChart
        bodyParts={bodyParts}
        highlights={highlights}
        legend={legend}
        label={strings.chartLabel(blockTitle(volume.block))}
        readOnly
      />
      <ul className={styles.rows} aria-label={strings.listLabel}>
        {rows.map((bodyPart) => {
          const sets = volume.sets[bodyPart.id];
          return (
            <li key={bodyPart.id}>
              {strings.row(bodyPart.name, sets, strings.levels[volumeLevel(sets)])}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
