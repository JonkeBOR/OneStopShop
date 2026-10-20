'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import type { SessionPlannedSet, SetLog } from '../domain/types';
import { formatKg, parseKgInput } from '../domain/values';
import { InlineError } from './InlineError';
import styles from './SetRow.module.css';
import { useFitnessAction } from './useFitnessAction';
import type { SetDraft } from './useSetDrafts';
import type { LoggedValues } from './useSetLogging';

type SetRowProps = {
  sessionId: string;
  exerciseName: string;
  variantId: string | null;
  plannedSet: SessionPlannedSet;
  logged: SetLog | null;
  optimistic: LoggedValues | undefined;
  draft: SetDraft | undefined;
  disabled: boolean;
  onDraftChange: (patch: SetDraft) => void;
  onLogStarted: (values: LoggedValues) => void;
  onLogSettled: (succeeded: boolean) => void;
};

const wholeNumber = /^\d+$/;
const maxReps = 999;
const columnCount = 4;

function parseReps(text: string): number | null {
  const trimmed = text.trim();
  if (!wholeNumber.test(trimmed)) {
    return null;
  }
  const reps = Number(trimmed);
  return reps >= 1 && reps <= maxReps ? reps : null;
}

export function SetRow({
  sessionId,
  exerciseName,
  variantId,
  plannedSet,
  logged,
  optimistic,
  draft,
  disabled,
  onDraftChange,
  onLogStarted,
  onLogSettled,
}: SetRowProps) {
  const [inputError, setInputError] = useState<string | null>(null);
  const action = useFitnessAction();
  const shown = logged ?? optimistic;

  if (shown) {
    return (
      <tr className={optimistic ? `${styles.logged} ${styles.sweep}` : styles.logged}>
        <td className={styles.number}>{plannedSet.setNumber}</td>
        <td className={styles.value}>
          {shown.weightKg === null ? fitnessStrings.common.noValue : formatKg(shown.weightKg)}
        </td>
        <td className={styles.value}>{shown.reps}</td>
        <td className={styles.action}>
          <span className={styles.check} aria-hidden="true">
            <Check className={styles.checkIcon} />
          </span>
          <span className={styles.visuallyHidden}>
            {fitnessStrings.session.loggedLabel(plannedSet.setNumber)}
          </span>
        </td>
      </tr>
    );
  }

  const suggestedWeightText =
    plannedSet.suggestedWeightKg === null ? '' : formatKg(plannedSet.suggestedWeightKg);
  const weightText = draft?.weight ?? '';
  const repsText = draft?.reps ?? String(plannedSet.targetReps);
  const errorMessage = inputError ?? action.errorMessage;

  async function log() {
    const weightKg = parseKgInput(weightText.trim() === '' ? suggestedWeightText : weightText);
    if (!weightKg.ok) {
      setInputError(fitnessErrorStrings['invalid-weight']);
      return;
    }
    const reps = parseReps(repsText);
    if (reps === null) {
      setInputError(fitnessErrorStrings['invalid-reps']);
      return;
    }
    setInputError(null);
    onLogStarted({ reps, weightKg: weightKg.value });
    const succeeded = await action.run('POST', `/api/fitness/sessions/${sessionId}/sets`, {
      plannedSetId: plannedSet.id,
      reps,
      weightKg: weightKg.value,
      variantId,
    });
    onLogSettled(succeeded);
  }

  return (
    <>
      <tr className={styles.row}>
        <td className={styles.number}>{plannedSet.setNumber}</td>
        <td>
          <input
            className={styles.input}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={fitnessStrings.session.weightLabel(plannedSet.setNumber, exerciseName)}
            placeholder={suggestedWeightText}
            value={weightText}
            onChange={(event) => onDraftChange({ weight: event.target.value })}
          />
        </td>
        <td>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={fitnessStrings.session.repsLabel(plannedSet.setNumber, exerciseName)}
            value={repsText}
            onChange={(event) => onDraftChange({ reps: event.target.value })}
          />
        </td>
        <td className={styles.action}>
          <button
            type="button"
            className={styles.log}
            aria-label={fitnessStrings.session.logLabel(plannedSet.setNumber, exerciseName)}
            disabled={disabled || action.pending}
            onClick={() => void log()}
          >
            <Check className={styles.checkIcon} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {errorMessage === null ? null : (
        <tr>
          <td colSpan={columnCount}>
            <InlineError message={errorMessage} />
          </td>
        </tr>
      )}
    </>
  );
}
