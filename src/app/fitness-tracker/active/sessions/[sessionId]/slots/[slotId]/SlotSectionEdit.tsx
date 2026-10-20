'use client';

import { useRouter } from 'next/navigation';
import { Screen } from '@/features/fitness-tracker/components/Screen';
import { useSetDrafts } from '@/features/fitness-tracker/components/useSetDrafts';
import { VariantPicker } from '@/features/fitness-tracker/components/VariantPicker';
import type { SessionSlotSettings } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';

type SlotSectionEditProps = { slotId: string; settings: SessionSlotSettings };

export function SlotSectionEdit({ slotId, settings }: SlotSectionEditProps) {
  const router = useRouter();
  const { clearWeightDrafts } = useSetDrafts(settings.sessionId);
  const sessionUrl = `/fitness-tracker/active/sessions/${settings.sessionId}`;

  return (
    <Screen
      title={settings.exercise.name}
      back={{ href: sessionUrl, label: fitnessStrings.navigation.toSession }}
    >
      <VariantPicker
        key={settings.selectedVariantId ?? ''}
        sessionId={settings.sessionId}
        slotId={slotId}
        exerciseName={settings.exercise.name}
        variants={settings.variants}
        selectedVariantId={settings.selectedVariantId}
        locked={settings.isLocked}
        onSwitchStart={() => clearWeightDrafts(settings.plannedSetIds)}
        onSwitched={() => router.push(sessionUrl)}
      />
    </Screen>
  );
}
