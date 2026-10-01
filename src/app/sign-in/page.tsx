import { authStrings } from '@/lib/strings/auth';
import styles from './page.module.css';

type SignInPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

type CallbackErrorCode = 'invalid_state' | 'denied' | 'forbidden';

function isCallbackErrorCode(value: string | string[] | undefined): value is CallbackErrorCode {
  switch (value) {
    case 'invalid_state':
    case 'denied':
    case 'forbidden':
      return true;
    default:
      return false;
  }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error } = await searchParams;
  const message = isCallbackErrorCode(error) ? authStrings.errors[error] : null;

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>{authStrings.signInHeading}</h1>
      <p className={styles.description}>{authStrings.signInDescription}</p>
      {message !== null && <p className={styles.error}>{message}</p>}
      <a className={styles.action} href="/api/auth/google/start">
        {authStrings.signInAction}
      </a>
    </main>
  );
}
