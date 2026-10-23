import type { ExerciseVariant } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import { AddNameForm } from './AddNameForm';
import { ConfirmActionButton } from './ConfirmActionButton';
import { RenameForm } from './RenameForm';
import styles from './VariantEditor.module.css';

type VariantEditorProps = { exerciseId: string; variants: readonly ExerciseVariant[] };

const copy = fitnessStrings.exerciseEdit.variants;

export function VariantEditor({ exerciseId, variants }: VariantEditorProps) {
  const url = `/api/fitness/exercises/${exerciseId}/variants`;

  return (
    <div className={styles.editor}>
      <ul className={styles.list}>
        {variants.map((variant) => (
          <li key={variant.id} className={styles.item}>
            <div className={styles.rename}>
              <RenameForm
                label={copy.renameLabel(variant.name)}
                currentName={variant.name}
                url={`${url}/${variant.id}`}
                isLabelHidden
              />
            </div>
            {variants.length > 1 ? (
              <ConfirmActionButton
                triggerLabel={copy.remove(variant.name)}
                triggerVariant="deleteIcon"
                message={copy.removeConfirm}
                confirmLabel={copy.removeConfirmLabel}
                method="DELETE"
                url={`${url}/${variant.id}`}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <AddNameForm label={copy.nameLabel} submitLabel={copy.add} url={url} />
    </div>
  );
}
