'use client';

import { type FormEvent, useId, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { InlineError } from './InlineError';
import styles from './AddNameForm.module.css';
import { useFitnessAction } from './useFitnessAction';

type AddNameFormProps = {
  label: string;
  submitLabel: string;
  url: string;
  confirm?: { message: string; confirmLabel: string };
};

export function AddNameForm({ label, submitLabel, url, confirm }: AddNameFormProps) {
  const inputId = useId();
  const [name, setName] = useState('');
  const action = useFitnessAction();

  async function post() {
    const succeeded = await action.run('POST', url, { name });
    if (succeeded) {
      setName('');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirm) {
      void post();
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor={inputId}>
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
        />
        {confirm ? (
          <ConfirmDialog
            triggerLabel={submitLabel}
            triggerClassName={styles.submit}
            message={confirm.message}
            confirmLabel={confirm.confirmLabel}
            disabled={action.pending || name.trim() === ''}
            onConfirm={() => void post()}
          />
        ) : (
          <button type="submit" className={styles.submit} disabled={action.pending}>
            {submitLabel}
          </button>
        )}
      </div>
      <InlineError message={action.errorMessage} />
    </form>
  );
}
