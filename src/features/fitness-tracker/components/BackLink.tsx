import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import styles from './BackLink.module.css';

type BackLinkProps = { href: string; label: string };

export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link className={styles.back} href={href} aria-label={label}>
      <span className={styles.circle}>
        <ArrowLeft className={styles.icon} aria-hidden="true" />
      </span>
    </Link>
  );
}
