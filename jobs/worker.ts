import { jobsFor, runAll, type JobsEnv } from './schedules';

type ScheduledController = { cron: string; scheduledTime: number };

type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  scheduled(controller: ScheduledController, env: JobsEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(runAll(jobsFor(controller.cron), env, new Date(controller.scheduledTime)));
  },
};
