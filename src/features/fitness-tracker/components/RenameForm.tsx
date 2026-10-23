'use client';

import { type FormEvent, useId, useState } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import { InlineError } from './InlineError';
import styles from './RenameForm.module.css';
import { useFitnessAction } from './useFitnessAction';

type RenameFormProps = {
  label: string;
  currentName: string;
  url: string;
  isLabelHidden?: boolean;
  submitsOnBlur?: boolean;
};

export function RenameForm({
  label,
  currentName,
  url,
  isLabelHidden = false,
  submitsOnBlur = false,
}: RenameFormProps) {
  const inputId = useId();
  const [name, setName] = useState(currentName);
  const action = useFitnessAction();

  async function save() {
    if (name !== currentName) {
      await action.run('PATCH', url, { name });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await save();
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={isLabelHidden ? styles.visuallyHidden : styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.fields}>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={submitsOnBlur ? () => void save() : undefined}
        />
        {submitsOnBlur ? null : (
          <button type="submit" className={styles.submit} disabled={action.pending}>
            {fitnessStrings.common.rename}
          </button>
        )}
      </div>
      <InlineError message={action.errorMessage} />
    </form>
  );
}
