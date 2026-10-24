import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jobsBySchedule, jobsFor, runAll, weeklyAffirmationsJob, type JobsEnv } from './schedules';

const env: JobsEnv = { DB: null };
const now = new Date('2026-10-26T03:00:00Z');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('jobsBySchedule', () => {
  it('has a job list for exactly the crons in jobs/wrangler.jsonc', async () => {
    const text = await readFile('jobs/wrangler.jsonc', 'utf-8');
    const config = JSON.parse(text.replace(/,(\s*[}\]])/g, '$1')) as {
      triggers: { crons: string[] };
    };

    expect(Object.keys(jobsBySchedule).toSorted()).toEqual(config.triggers.crons.toSorted());
  });

  it('runs the weekly affirmations job daily at 03:00 UTC', () => {
    expect(jobsBySchedule['0 3 * * *']).toContain(weeklyAffirmationsJob);
  });
});

describe('jobsFor', () => {
  it('warns about an unknown cron and runs nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(jobsFor('*/5 * * * *')).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Unknown cron: */5 * * * *');
  });

  it('gives the jobs of a known cron', () => {
    expect(jobsFor('0 3 * * *')).toBe(jobsBySchedule['0 3 * * *']);
  });
});

describe('runAll', () => {
  it('keeps running jobs after one fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingJob = vi.fn(() => Promise.reject(new Error('boom')));
    const nextJob = vi.fn(() => Promise.resolve());

    await runAll([failingJob, nextJob], env, now);

    expect(nextJob).toHaveBeenCalledWith(env, now);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('runs jobs one after another', async () => {
    const order: string[] = [];
    const slow = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('slow');
    };
    const fast = () => {
      order.push('fast');
      return Promise.resolve();
    };

    await runAll([slow, fast], env, now);

    expect(order).toEqual(['slow', 'fast']);
  });
});
