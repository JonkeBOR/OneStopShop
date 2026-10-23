'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { fitnessErrorStrings } from '@/lib/strings/fitness';
import { type FitnessErrorCode, isFitnessErrorCode } from '../domain/errors';

type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const staleViewCodes: readonly FitnessErrorCode[] = [
  'set-already-logged',
  'session-not-in-progress',
  'variant-locked',
  'variant-changed',
  'last-variant',
];

export function errorCodeOf(body: unknown): FitnessErrorCode {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const code = body.error;
    if (isFitnessErrorCode(code)) {
      return code;
    }
  }
  return 'unexpected';
}

export type FitnessAction = {
  run: (
    method: Method,
    url: string,
    body?: unknown,
    onSuccess?: (value: unknown) => void,
  ) => Promise<boolean>;
  pending: boolean;
  errorMessage: string | null;
  clearError: () => void;
};

export function useFitnessAction(): FitnessAction {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback<FitnessAction['run']>(
    async (method, url, body, onSuccess) => {
      if (inFlight.current) {
        return false;
      }
      inFlight.current = true;
      setPending(true);
      setErrorMessage(null);
      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json: unknown = await response.json().catch(() => null);
        if (response.ok) {
          if (onSuccess) {
            onSuccess(json);
          } else {
            router.refresh();
          }
          return true;
        }
        const code = errorCodeOf(json);
        setErrorMessage(fitnessErrorStrings[code]);
        if (staleViewCodes.includes(code)) {
          router.refresh();
        }
        return false;
      } catch {
        setErrorMessage(fitnessErrorStrings.unexpected);
        return false;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [router],
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return { run, pending, errorMessage, clearError };
}
