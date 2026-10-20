import { expect, test, type APIRequestContext } from '@playwright/test';
import { signIn } from './session';

const phoneWidth = 375;

type Seed = {
  programId: string;
  workoutId: string;
  slotId: string;
  exerciseId: string;
  sessionId: string;
};

async function post(request: APIRequestContext, url: string, data: unknown): Promise<unknown> {
  const response = await request.post(url, { data });
  expect(response.ok(), `${url} answered ${response.status()}`).toBe(true);
  const body: unknown = await response.json();
  return body;
}

function field(body: unknown, key: string): string {
  if (typeof body === 'object' && body !== null && key in body) {
    return String(Object.getOwnPropertyDescriptor(body, key)?.value);
  }
  throw new Error(`The response has no ${key}`);
}

async function seed(request: APIRequestContext, run: string): Promise<Seed> {
  const press = await post(request, '/api/fitness/exercises', {
    name: `Incline bench press ${run}`,
  });
  const curl = await post(request, '/api/fitness/exercises', { name: `Curl ${run}` });
  const program = await post(request, '/api/fitness/programs', {
    name: `Layout program with a fairly long name ${run}`,
    blockCount: 4,
  });
  const programId = field(program, 'id');
  const workout = await post(request, `/api/fitness/programs/${programId}/workouts`, {
    name: `Upper body day ${run}`,
  });
  const workoutId = field(workout, 'id');
  const slot = await post(request, `/api/fitness/workouts/${workoutId}/slots`, {
    exerciseId: field(press, 'id'),
    sets: 3,
    reps: 10,
  });
  const optionalSlot = await post(request, `/api/fitness/workouts/${workoutId}/slots`, {
    exerciseId: field(curl, 'id'),
    sets: 2,
    reps: 12,
  });
  const patch = await request.patch(`/api/fitness/slots/${field(optionalSlot, 'id')}`, {
    data: { isOptional: true },
  });
  expect(patch.ok()).toBe(true);
  await post(request, `/api/fitness/programs/${programId}/activation`, {});
  const session = await post(request, `/api/fitness/workouts/${workoutId}/session`, {});
  return {
    programId,
    workoutId,
    slotId: field(slot, 'id'),
    exerciseId: field(press, 'id'),
    sessionId: field(session, 'sessionId'),
  };
}

test.use({ viewport: { width: phoneWidth, height: 812 } });

test('SC-005: no view scrolls sideways at 375 px, in light or dark mode', async ({
  page,
  context,
}, testInfo) => {
  test.slow();
  await signIn(context);
  const run = Date.now().toString(36);
  const seeded = await seed(page.request, run);
  const views = {
    home: '/fitness-tracker',
    active: '/fitness-tracker/active',
    block: '/fitness-tracker/active/block',
    session: `/fitness-tracker/active/sessions/${seeded.sessionId}`,
    programs: '/fitness-tracker/programs',
    programEdit: `/fitness-tracker/programs/${seeded.programId}`,
    workoutEdit: `/fitness-tracker/programs/${seeded.programId}/workouts/${seeded.workoutId}`,
    slotEdit: `/fitness-tracker/programs/${seeded.programId}/workouts/${seeded.workoutId}/slots/${seeded.slotId}`,
    exercises: '/fitness-tracker/exercises',
    exerciseEdit: `/fitness-tracker/exercises/${seeded.exerciseId}`,
  };

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [name, path] of Object.entries(views)) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${name} overflows by ${overflow}px in ${colorScheme}`).toBeLessThanOrEqual(
        0,
      );
      await page.screenshot({
        path: testInfo.outputPath(`${colorScheme}-${name}.png`),
        fullPage: true,
      });
    }
  }
});
