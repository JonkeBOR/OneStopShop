import { notFound, redirect } from 'next/navigation';
import { requireFitnessContext } from '@/features/fitness-tracker/server/page-context';
import { getSessionSlotSettings } from '@/features/fitness-tracker/server/training';
import { SlotSectionEdit } from './SlotSectionEdit';

type SlotSectionEditPageProps = { params: Promise<{ sessionId: string; slotId: string }> };

export default async function SlotSectionEditPage({ params }: SlotSectionEditPageProps) {
  const { sessionId, slotId } = await params;
  const { db, profileId } = await requireFitnessContext(
    `/fitness-tracker/active/sessions/${sessionId}/slots/${slotId}`,
  );
  const settings = await getSessionSlotSettings(db, profileId, sessionId, slotId);
  if (!settings.ok || settings.value.variants.length < 2) {
    notFound();
  }
  if (settings.value.status === 'finished') {
    redirect('/fitness-tracker/active/block');
  }
  return <SlotSectionEdit slotId={slotId} settings={settings.value} />;
}
