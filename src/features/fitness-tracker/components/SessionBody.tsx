'use client';

import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import type { SessionSlot, SessionView, SetLog } from '../domain/types';
import { SetRow } from './SetRow';
import styles from './SessionBody.module.css';
import { useSetDrafts } from './useSetDrafts';
import type { SetLogging } from './useSetLogging';

type SessionBodyProps = { session: SessionView; logging: SetLogging };

function loggedFor(slot: SessionSlot, setNumber: number): SetLog | null {
  const matches = slot.loggedSets.filter((logged) => logged.setNumber === setNumber);
  return matches[matches.length - 1] ?? null;
}

function SlotSection({
  session,
  slot,
  drafts,
  setDraft,
  clearDraft,
  logging,
}: {
  session: SessionView;
  slot: SessionSlot;
  drafts: ReturnType<typeof useSetDrafts>['drafts'];
  setDraft: ReturnType<typeof useSetDrafts>['setDraft'];
  clearDraft: ReturnType<typeof useSetDrafts>['clearDraft'];
  logging: SetLogging;
}) {
  const headingId = useId();
  return (
    <section
      className={slot.isOptional ? styles.optionalSlot : styles.slot}
      aria-labelledby={headingId}
    >
      <div className={styles.header}>
        <div className={styles.title}>
          <h2 id={headingId} className={styles.exercise}>
            {slot.exercise.name}
          </h2>
          {slot.hasVariantChoice && slot.variant ? (
            <span className={styles.variant}>{slot.variant.name}</span>
          ) : null}
          {slot.isOptional ? (
            <span className={styles.tag}>{fitnessStrings.common.optional}</span>
          ) : null}
        </div>
        {slot.hasVariantChoice && slot.variant ? (
          <Link
            className={styles.options}
            href={`/fitness-tracker/active/sessions/${session.id}/slots/${slot.id}`}
            aria-label={fitnessStrings.session.slotOptionsLabel(slot.exercise.name)}
          >
            <Ellipsis className={styles.optionsIcon} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <table className={styles.sets} aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col" className={styles.setColumn}>
              {fitnessStrings.session.columns.set}
            </th>
            <th scope="col" className={styles.column}>
              {fitnessStrings.session.columns.weight}
            </th>
            <th scope="col" className={styles.column}>
              {fitnessStrings.session.columns.reps}
            </th>
            <th scope="col" className={styles.logColumn}>
              <span className={styles.visuallyHidden}>{fitnessStrings.session.columns.log}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {slot.plannedSets.map((plannedSet) => (
            <SetRow
              key={plannedSet.id}
              sessionId={session.id}
              exerciseName={slot.exercise.name}
              variantId={slot.variant?.id ?? null}
              plannedSet={plannedSet}
              logged={loggedFor(slot, plannedSet.setNumber)}
              optimistic={logging.optimistic[plannedSet.id]}
              draft={drafts[plannedSet.id]}
              onDraftChange={(patch) => setDraft(plannedSet.id, patch)}
              onLogStarted={(values) => logging.begin(plannedSet.id, values)}
              onLogSettled={(succeeded) => {
                logging.settle(plannedSet.id, succeeded);
                if (succeeded) {
                  clearDraft(plannedSet.id);
                }
              }}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SessionBody({ session, logging }: SessionBodyProps) {
  const { drafts, setDraft, clearDraft } = useSetDrafts(session.id);

  return (
    <>
      {session.slots.length === 0 ? (
        <p className={styles.empty}>{fitnessStrings.session.nothingToLog}</p>
      ) : (
        session.slots.map((slot) => (
          <SlotSection
            key={slot.id}
            session={session}
            slot={slot}
            drafts={drafts}
            setDraft={setDraft}
            clearDraft={clearDraft}
            logging={logging}
          />
        ))
      )}
    </>
  );
}
