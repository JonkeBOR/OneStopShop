import Link from 'next/link';
import type { Feature } from '@/lib/features';
import styles from './FeatureCard.module.css';

type FeatureCardProps = {
  feature: Feature;
};

export function FeatureCard({ feature }: FeatureCardProps) {
  return (
    <Link className={styles.card} href={feature.href}>
      <span className={styles.name}>{feature.name}</span>
      <span className={styles.description}>{feature.description}</span>
    </Link>
  );
}
