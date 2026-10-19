'use client';

import { useCallback, useRef, useState } from 'react';
import { fitnessErrorStrings } from '@/lib/strings/fitness';
import type { BodyPart, BodyPartLink, BodyPartRole } from '../domain/body-part';
import { errorCodeOf } from './useFitnessAction';

type Roles = Partial<Record<BodyPart, BodyPartRole>>;

export type BodyPartLinks = {
  roles: Roles;
  pending: readonly BodyPart[];
  errorMessage: string | null;
  tap: (part: BodyPart) => void;
};

function nextRole(current: BodyPartRole | undefined): BodyPartRole | undefined {
  if (current === undefined) {
    return 'primary';
  }
  return current === 'primary' ? 'secondary' : undefined;
}

function withRole(roles: Roles, part: BodyPart, role: BodyPartRole | undefined): Roles {
  const others: Roles = Object.fromEntries(
    Object.entries(roles).filter(([other]) => other !== part),
  );
  return role === undefined ? others : { ...others, [part]: role };
}

function flipped(parts: readonly BodyPart[], part: BodyPart, include: boolean): BodyPart[] {
  const without = parts.filter((other) => other !== part);
  return include ? [...without, part] : without;
}

function rolesOf(links: readonly BodyPartLink[]): Roles {
  return Object.fromEntries(links.map((link) => [link.bodyPart, link.role]));
}

export function useBodyPartLinks(
  exerciseId: string,
  initial: readonly BodyPartLink[],
): BodyPartLinks {
  const [roles, setRoles] = useState<Roles>(() => rolesOf(initial));
  const [pending, setPending] = useState<readonly BodyPart[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(new Set<BodyPart>());

  const tap = useCallback(
    (part: BodyPart) => {
      if (inFlight.current.has(part)) {
        return;
      }
      inFlight.current.add(part);
      const previous = roles[part];
      const next = nextRole(previous);
      setRoles((current) => withRole(current, part, next));
      setPending((current) => flipped(current, part, true));
      setErrorMessage(null);

      const settle = (failure: string | null) => {
        inFlight.current.delete(part);
        setPending((current) => flipped(current, part, false));
        if (failure !== null) {
          setRoles((current) => withRole(current, part, previous));
          setErrorMessage(failure);
        }
      };

      fetch(
        `/api/fitness/exercises/${exerciseId}/body-parts/${part}`,
        next === undefined
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: next }),
            },
      )
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
    [exerciseId, roles],
  );

  return { roles, pending, errorMessage, tap };
}
