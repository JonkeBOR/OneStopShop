import { runWeeklyAffirmations } from '@/features/fitness-tracker/jobs/weekly-affirmations';
import { geminiGenerator, readGeminiConfig } from '@/lib/gemini/client';
import { createDatabase } from '@/lib/server/create-database';

export type JobsEnv = { DB: unknown; GEMINI_API_KEY?: string; GEMINI_ENABLED?: string };

export type ScheduledJob = (env: JobsEnv, now: Date) => Promise<void>;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const weeklyAffirmationsJob: ScheduledJob = async (env, now) => {
  const config = readGeminiConfig(env);
  const outcome = await runWeeklyAffirmations(
    createDatabase(env.DB),
    config === null ? null : geminiGenerator(config),
    now,
    sleep,
  );
  console.info(`Weekly affirmations: ${outcome}`);
};

export const jobsBySchedule: Readonly<Record<string, readonly ScheduledJob[]>> = {
  '0 3 * * *': [weeklyAffirmationsJob],
};

export function jobsFor(cron: string): readonly ScheduledJob[] {
  const jobs = jobsBySchedule[cron];
  if (jobs === undefined) {
    console.warn(`Unknown cron: ${cron}`);
    return [];
  }
  return jobs;
}

export async function runAll(
  jobs: readonly ScheduledJob[],
  env: JobsEnv,
  now: Date,
): Promise<void> {
  for (const job of jobs) {
    try {
      await job(env, now);
    } catch {
      console.error(`Scheduled job failed: ${job.name}`);
    }
  }
}
