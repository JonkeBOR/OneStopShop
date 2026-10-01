'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';
import styles from './BodyweightForm.module.css';

type FieldErrors = Readonly<Record<string, string>>;

function isErrorBody(
  value: unknown,
): value is { error: { code: string; message: string; fields?: FieldErrors } } {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const { error } = value;
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function BodyweightForm() {
  const router = useRouter();
  const [kilograms, setKilograms] = useState('');
  const [recordedOn, setRecordedOn] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [storeErrorMessage, setStoreErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setStoreErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/bodyweight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kilograms: Number(kilograms),
          ...(recordedOn ? { recordedOn } : {}),
        }),
      });

      if (response.status === 201) {
        setKilograms('');
        setRecordedOn('');
        router.refresh();
        return;
      }

      const responseBody: unknown = await response.json();
      if (isErrorBody(responseBody) && responseBody.error.code === 'INVALID_MEASUREMENT') {
        setFieldErrors(responseBody.error.fields ?? {});
        return;
      }
      if (isErrorBody(responseBody) && responseBody.error.code === 'STORE_UNAVAILABLE') {
        setStoreErrorMessage(fitnessTrackerStrings.errors.storeUnavailable);
        return;
      }
      setStoreErrorMessage(fitnessTrackerStrings.errors.storeMisconfigured);
    } catch {
      setStoreErrorMessage(fitnessTrackerStrings.errors.storeUnavailable);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <h2 className={styles.heading}>{fitnessTrackerStrings.formHeading}</h2>

      <label className={styles.label} htmlFor="bodyweight-kilograms">
        {fitnessTrackerStrings.weightLabel}
      </label>
      <input
        className={styles.input}
        id="bodyweight-kilograms"
        inputMode="decimal"
        value={kilograms}
        onChange={(event) => {
          setKilograms(event.target.value);
        }}
      />
      {fieldErrors['kilograms'] !== undefined && (
        <p className={styles.error}>{fieldErrors['kilograms']}</p>
      )}

      <label className={styles.label} htmlFor="bodyweight-recorded-on">
        {fitnessTrackerStrings.dateLabel}
      </label>
      <input
        className={styles.input}
        id="bodyweight-recorded-on"
        type="date"
        value={recordedOn}
        onChange={(event) => {
          setRecordedOn(event.target.value);
        }}
      />
      {fieldErrors['recordedOn'] !== undefined && (
        <p className={styles.error}>{fieldErrors['recordedOn']}</p>
      )}

      {storeErrorMessage !== null && <p className={styles.error}>{storeErrorMessage}</p>}

      <button className={styles.submit} disabled={isSubmitting} type="submit">
        {fitnessTrackerStrings.submitAction}
      </button>
    </form>
  );
}
