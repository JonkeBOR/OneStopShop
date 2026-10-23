'use client';

import type { LucideIcon } from 'lucide-react';
import { ConfirmDialog, type TriggerVariant } from './ConfirmDialog';
import { InlineError } from './InlineError';
import styles from './ConfirmActionButton.module.css';
import { useFitnessAction } from './useFitnessAction';

type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type ConfirmActionButtonProps = {
  triggerLabel: string;
  triggerIcon?: LucideIcon;
  triggerVariant?: TriggerVariant;
  message: string;
  confirmLabel: string;
  method: Method;
  url: string;
  body?: unknown;
  onSuccess?: (value: unknown) => void;
  disabled?: boolean;
};

export function ConfirmActionButton({
  triggerLabel,
  triggerIcon,
  triggerVariant,
  message,
  confirmLabel,
  method,
  url,
  body,
  onSuccess,
  disabled = false,
}: ConfirmActionButtonProps) {
  const action = useFitnessAction();

  return (
    <span className={styles.wrapper}>
      <ConfirmDialog
        triggerLabel={triggerLabel}
        triggerIcon={triggerIcon}
        triggerVariant={triggerVariant}
        message={message}
        confirmLabel={confirmLabel}
        disabled={disabled || action.pending}
        onConfirm={() => void action.run(method, url, body, onSuccess)}
      />
      <InlineError message={action.errorMessage} />
    </span>
  );
}
