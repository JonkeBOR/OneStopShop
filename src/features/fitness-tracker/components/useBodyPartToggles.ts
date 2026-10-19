'use client';

import { useCallback, useRef, useState } from 'react';
import { fitnessErrorStrings } from '@/lib/strings/fitness';
import type { BodyPart } from '../domain/body-part';
import { errorCodeOf } from './useFitnessAction';

export type BodyPartToggles = {
  selected: readonly BodyPart[];
  pending: readonly BodyPart[];
  errorMessage: string | null;
  toggle: (part: BodyPart) => void;
};

function flipped(parts: readonly BodyPart[], part: BodyPart, include: boolean): BodyPart[] {
  const without = parts.filter((other) => other !== part);
  return include ? [...without, part] : without;
}

export function useBodyPartToggles(
  exerciseId: string,
  initial: readonly BodyPart[],
): BodyPartToggles {
  const [selected, setSelected] = useState<readonly BodyPart[]>(initial);
  const [pending, setPending] = useState<readonly BodyPart[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(new Set<BodyPart>());

  const toggle = useCallback(
    (part: BodyPart) => {
      if (inFlight.current.has(part)) {
        return;
      }
      inFlight.current.add(part);
      const linking = !selected.includes(part);
      setSelected((current) => flipped(current, part, linking));
      setPending((current) => flipped(current, part, true));
      setErrorMessage(null);

      const settle = (failure: string | null) => {
        inFlight.current.delete(part);
        setPending((current) => flipped(current, part, false));
        if (failure !== null) {
          setSelected((current) => flipped(current, part, !linking));
          setErrorMessage(failure);
        }
      };

      fetch(`/api/fitness/exercises/${exerciseId}/body-parts/${part}`, {
        method: linking ? 'PUT' : 'DELETE',
      })
        .then(async (response) => {
          if (response.ok) {
            settle(null);
            return;
          }
          const json: unknown = await response.json().catch(() => null);
          settle(fitnessErrorStrings[errorCodeOf(json)]);
        })
        .catch(() => {
          settle(fitnessErrorStrings.unexpected);
        });
    },
    [exerciseId, selected],
  );

  return { selected, pending, errorMessage, toggle };
}
