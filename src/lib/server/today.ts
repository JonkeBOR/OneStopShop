import 'server-only';
import { env } from './env';

export function todayInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function today(): string {
  return todayInTimeZone(new Date(), env.appTimeZone);
}
