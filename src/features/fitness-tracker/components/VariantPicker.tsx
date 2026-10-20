'use client';

import { useId, useState } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import type { ExerciseVariant } from '../domain/types';
import { InlineError } from './InlineError';
import { useFitnessAction } from './useFitnessAction';
import styles from './VariantPicker.module.css';

type VariantPickerProps = {
  sessionId: string;
  slotId: string;
  exerciseName: string;
  variants: readonly ExerciseVariant[];
  selectedVariantId: string | null;
  locked: boolean;
  onSwitchStart: () => void;
  onSwitched: () => void;
};

export function VariantPicker({
  sessionId,
  slotId,
  exerciseName,
  variants,
  selectedVariantId,
  locked,
  onSwitchStart,
  onSwitched,
}: VariantPickerProps) {
  const selectId = useId();
  const action = useFitnessAction();
  const [choice, setChoice] = useState(selectedVariantId ?? '');

  async function choose(variantId: string) {
    setChoice(variantId);
    onSwitchStart();
    const ok = await action.run(
      'PUT',
      `/api/fitness/sessions/${sessionId}/slots/${slotId}/variant`,
      { variantId },
      onSwitched,
    );
    if (!ok) {
      setChoice(selectedVariantId ?? '');
    }
  }

  return (
    <div className={styles.picker}>
      <label htmlFor={selectId} className={styles.visuallyHidden}>
        {fitnessStrings.session.variantLabel(exerciseName)}
      </label>
      <select
        id={selectId}
        className={styles.select}
        value={choice}
        disabled={locked || action.pending}
        onChange={(event) => void choose(event.target.value)}
      >
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.name}
          </option>
        ))}
      </select>
      <InlineError message={action.errorMessage} />
    </div>
  );
}
