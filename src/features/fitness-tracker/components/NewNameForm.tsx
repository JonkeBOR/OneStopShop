'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import { InlineError } from './InlineError';
import styles from './NewNameForm.module.css';
import { readId } from './read-id';
import { useFitnessAction } from './useFitnessAction';

type NewNameFormProps = { label: string; url: string; createdHrefPrefix: string };

export function NewNameForm({ label, url, createdHrefPrefix }: NewNameFormProps) {
  const inputId = useId();
  const router = useRouter();
  const [name, setName] = useState('');
  const action = useFitnessAction();

  function openCreated(body: unknown) {
    const id = readId(body);
    if (id !== null) {
      router.replace(`${createdHrefPrefix}/${id}`);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run('POST', url, { name }, openCreated);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.fields}>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className={styles.submit}
          disabled={action.pending || name.trim() === ''}
        >
          {fitnessStrings.common.submit}
        </button>
      </div>
      <InlineError message={action.errorMessage} />
    </form>
  );
}
