import Link from 'next/link';
import { appStrings } from '@/lib/strings/app';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>{appStrings.notFound.heading}</h1>
      <p className={styles.description}>{appStrings.notFound.description}</p>
      <Link className={styles.backLink} href="/">
        {appStrings.backToHome}
      </Link>
    </main>
  );
}
