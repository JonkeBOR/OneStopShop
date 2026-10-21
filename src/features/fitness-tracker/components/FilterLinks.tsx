import Link from 'next/link';
import styles from './FilterLinks.module.css';

export type FilterLink = { key: string; text: string; href: string; isSelected: boolean };

type FilterLinksProps = { label: string; links: readonly FilterLink[] };

export function FilterLinks({ label, links }: FilterLinksProps) {
  return (
    <nav className={styles.filters} aria-label={label}>
      {links.map((link) => (
        <Link
          key={link.key}
          className={styles.link}
          href={link.href}
          aria-current={link.isSelected ? 'page' : undefined}
        >
          {link.text}
        </Link>
      ))}
    </nav>
  );
}
