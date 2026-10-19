'use client';

import type { BodyPart } from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import { AnatomyChart } from './AnatomyChart';
import { InlineError } from './InlineError';
import { useBodyPartToggles } from './useBodyPartToggles';

type BodyPartEditorProps = {
  exerciseId: string;
  bodyParts: readonly BodyPartView[];
  selected: readonly BodyPart[];
};

export function BodyPartEditor({ exerciseId, bodyParts, selected }: BodyPartEditorProps) {
  const toggles = useBodyPartToggles(exerciseId, selected);

  return (
    <>
      <AnatomyChart
        bodyParts={bodyParts}
        selected={toggles.selected}
        pending={toggles.pending}
        onToggle={toggles.toggle}
      />
      <InlineError message={toggles.errorMessage} />
    </>
  );
}
