import { FeatureCard } from '@/components/feature-card/FeatureCard';
import { features } from '@/lib/features';
import { appStrings } from '@/lib/strings/app';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{appStrings.name}</h1>
      <ul className={styles.features}>
        {features.map((feature) => (
          <li key={feature.id}>
            <FeatureCard feature={feature} />
          </li>
        ))}
      </ul>
    </main>
  );
}
