'use client';

import { useId, useState } from 'react';
import { fitnessStrings } from '@/lib/strings/fitness';
import type { SessionSlot, SessionView, SetLog } from '../domain/types';
import { SetRow } from './SetRow';
import styles from './SessionBody.module.css';
import { useSetDrafts } from './useSetDrafts';
import type { SetLogging } from './useSetLogging';
import { VariantPicker } from './VariantPicker';

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
  clearWeightDrafts,
  logging,
}: {
  session: SessionView;
  slot: SessionSlot;
  drafts: ReturnType<typeof useSetDrafts>['drafts'];
  setDraft: ReturnType<typeof useSetDrafts>['setDraft'];
  clearDraft: ReturnType<typeof useSetDrafts>['clearDraft'];
  clearWeightDrafts: ReturnType<typeof useSetDrafts>['clearWeightDrafts'];
  logging: SetLogging;
}) {
  const headingId = useId();
  const [switching, setSwitching] = useState(false);
  return (
    <section
      className={slot.isOptional ? styles.optionalSlot : styles.slot}
      aria-labelledby={headingId}
    >
      <div className={styles.header}>
        <h2 id={headingId} className={styles.exercise}>
          {slot.exercise.name}
        </h2>
        {slot.isOptional ? (
          <span className={styles.tag}>{fitnessStrings.common.optional}</span>
        ) : null}
      </div>
      {slot.variants.length > 0 ? (
        <VariantPicker
          key={slot.selectedVariantId ?? ''}
          sessionId={session.id}
          slotId={slot.id}
          exerciseName={slot.exercise.name}
          variants={slot.variants}
          selectedVariantId={slot.selectedVariantId}
          locked={
            slot.loggedSets.length > 0 ||
            slot.plannedSets.some((set) => logging.optimistic[set.id] !== undefined)
          }
          onSwitchStart={() => {
            setSwitching(true);
            clearWeightDrafts(slot.plannedSets.map((set) => set.id));
          }}
          onSwitchSettled={() => setSwitching(false)}
        />
      ) : null}
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
              variantId={slot.selectedVariantId}
              plannedSet={plannedSet}
              logged={loggedFor(slot, plannedSet.setNumber)}
              optimistic={logging.optimistic[plannedSet.id]}
              draft={drafts[plannedSet.id]}
              disabled={switching}
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
  const { drafts, setDraft, clearDraft, clearWeightDrafts } = useSetDrafts(session.id);

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
            clearWeightDrafts={clearWeightDrafts}
            logging={logging}
          />
        ))
      )}
    </>
  );
}
