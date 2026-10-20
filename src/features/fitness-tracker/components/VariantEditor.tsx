import type { ExerciseVariant } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import { AddNameForm } from './AddNameForm';
import { ConfirmActionButton } from './ConfirmActionButton';
import styles from './VariantEditor.module.css';

type VariantEditorProps = { exerciseId: string; variants: readonly ExerciseVariant[] };

const copy = fitnessStrings.exerciseEdit.variants;

export function VariantEditor({ exerciseId, variants }: VariantEditorProps) {
  const url = `/api/fitness/exercises/${exerciseId}/variants`;

  return (
    <div className={styles.editor}>
      {variants.length === 0 ? (
        <p className={styles.empty}>{copy.empty}</p>
      ) : (
        <ul className={styles.list}>
          {variants.map((variant) => (
            <li key={variant.id} className={styles.item}>
              <span className={styles.name}>{variant.name}</span>
              <ConfirmActionButton
                triggerLabel={copy.remove(variant.name)}
                message={variants.length === 1 ? copy.removeLastConfirm : copy.removeConfirm}
                confirmLabel={copy.removeConfirmLabel}
                method="DELETE"
                url={`${url}/${variant.id}`}
              />
            </li>
          ))}
        </ul>
      )}
      <AddNameForm
        label={copy.nameLabel}
        submitLabel={copy.add}
        url={url}
        confirm={
          variants.length === 0
            ? { message: copy.firstConfirm, confirmLabel: copy.firstConfirmLabel }
            : undefined
        }
      />
    </div>
  );
}
