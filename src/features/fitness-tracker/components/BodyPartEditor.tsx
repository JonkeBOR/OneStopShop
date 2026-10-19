'use client';

import type { BodyPartLink } from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import { AnatomyChart } from './AnatomyChart';
import { InlineError } from './InlineError';
import { useBodyPartLinks } from './useBodyPartLinks';

type BodyPartEditorProps = {
  exerciseId: string;
  bodyParts: readonly BodyPartView[];
  links: readonly BodyPartLink[];
};

export function BodyPartEditor({ exerciseId, bodyParts, links }: BodyPartEditorProps) {
  const bodyPartLinks = useBodyPartLinks(exerciseId, links);

  return (
    <>
      <AnatomyChart
        bodyParts={bodyParts}
        highlights={bodyPartLinks.roles}
        pending={bodyPartLinks.pending}
        onToggle={bodyPartLinks.tap}
      />
      <InlineError message={bodyPartLinks.errorMessage} />
    </>
  );
}
