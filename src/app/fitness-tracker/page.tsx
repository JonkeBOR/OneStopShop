import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BodyweightForm } from '@/features/fitness-tracker/BodyweightForm';
import { BodyweightHistory } from '@/features/fitness-tracker/BodyweightHistory';
import type { BodyweightMeasurement } from '@/features/fitness-tracker/bodyweight';
import {
  bodyweightStoreErrorMessage,
  listBodyweightMeasurements,
} from '@/features/fitness-tracker/bodyweight-store';
import { requireOwner } from '@/lib/server/current-user';
import { appStrings } from '@/lib/strings/app';
import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';
import styles from './page.module.css';

async function loadMeasurements(): Promise<{
  measurements: readonly BodyweightMeasurement[];
  storeErrorMessage: string | null;
}> {
  try {
    return { measurements: await listBodyweightMeasurements(), storeErrorMessage: null };
  } catch (error) {
    return { measurements: [], storeErrorMessage: bodyweightStoreErrorMessage(error) };
  }
}

export default async function FitnessTrackerPage() {
  try {
    await requireOwner();
  } catch {
    redirect('/sign-in');
  }

  const { measurements, storeErrorMessage } = await loadMeasurements();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>{appStrings.fitnessTrackerFeature.name}</h1>
      <BodyweightForm />
      <section className={styles.history}>
        <h2 className={styles.historyHeading}>{fitnessTrackerStrings.historyHeading}</h2>
        {storeErrorMessage !== null ? (
          <p className={styles.error}>{storeErrorMessage}</p>
        ) : (
          <BodyweightHistory measurements={measurements} />
        )}
      </section>
      <Link className={styles.backLink} href="/">
        {appStrings.backToHome}
      </Link>
    </main>
  );
}
