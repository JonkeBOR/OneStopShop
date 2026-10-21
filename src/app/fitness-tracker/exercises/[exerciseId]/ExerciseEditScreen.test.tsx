import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyPartIds } from '@/features/fitness-tracker/domain/body-part';
import type { OneRepMaxChart } from '@/features/fitness-tracker/domain/progress-chart';
import type { BodyPartView, ExerciseUsage } from '@/features/fitness-tracker/domain/types';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { ExerciseEditScreen } from './ExerciseEditScreen';

function descriptionOf(element: Element): string | null {
  const ids = element.getAttribute('aria-describedby');
  return ids === null
    ? null
    : ids
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
}

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/features/fitness-tracker/components/ProgressLineChart', () => ({
  ProgressLineChart: ({ label }: { label: string }) => <figure aria-label={label} />,
}));

const emptyOneRepMax: OneRepMaxChart = {
  range: '3m',
  domain: [0, 1],
  chips: [],
  selectedParam: null,
  points: [],
  bands: [],
  legend: [],
};

function oneRepMax(overrides: Partial<OneRepMaxChart> = {}): OneRepMaxChart {
  return {
    range: '3m',
    domain: [0, 2],
    chips: [],
    selectedParam: 'none',
    points: [
      { time: 0, kg: 100 },
      { time: 1, kg: 102.5 },
    ],
    bands: [],
    legend: [],
    ...overrides,
  };
}

function renderScreen(
  usageOverrides: Partial<ExerciseUsage> = {},
  chart: OneRepMaxChart = emptyOneRepMax,
) {
  return render(
    <ExerciseEditScreen bodyParts={bodyParts} usage={usage(usageOverrides)} oneRepMax={chart} />,
  );
}

function usage(overrides: Partial<ExerciseUsage> = {}): ExerciseUsage {
  return {
    exercise: { id: 'e1', name: 'Press', isArchived: false },
    slots: [
      { programId: 'p1', programName: 'Strength', workoutId: 'w1', workoutName: 'Upper A' },
      { programId: 'p2', programName: 'Cut', workoutId: 'w9', workoutName: 'Full body' },
    ],
    hasSetLogs: true,
    bodyParts: [{ bodyPart: 'chest', role: 'primary' }],
    variants: [],
    ...overrides,
  };
}

const unused = { slots: [], hasSetLogs: false };

const bodyParts: BodyPartView[] = bodyPartIds.map((id) => ({ id, name: `Name of ${id}` }));

describe('ExerciseEditScreen', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(Response.json({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    router.refresh.mockReset();
    router.push.mockReset();
  });

  it('shows the exercise name and links back to Exercises', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: 'Press' })).toBeDefined();
    expect(
      screen
        .getByRole('link', { name: fitnessStrings.navigation.toExercises })
        .getAttribute('href'),
    ).toBe('/fitness-tracker/exercises');
  });

  it('has a Variants region listing the exercise variants', () => {
    renderScreen({ variants: [{ id: 'v1', name: 'Gym A' }] });

    const region = screen.getByRole('region', {
      name: fitnessStrings.exerciseEdit.variants.heading,
    });
    expect(within(region).getByText('Gym A')).toBeDefined();
  });

  it('FR-036: renames the exercise and shows a taken name inline', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'name-taken' }, { status: 409 }));
    renderScreen();

    fireEvent.change(screen.getByRole('textbox', { name: fitnessStrings.exerciseEdit.nameLabel }), {
      target: { value: 'Chins' },
    });
    fireEvent.click(screen.getByRole('button', { name: fitnessStrings.common.rename }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['name-taken']),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/exercises/e1');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'Chins' }));
  });

  describe('used in', () => {
    it('US5 scenario 5: lists each workout with its program, linking to Workout edit', () => {
      renderScreen();

      const list = screen.getByRole('list', { name: fitnessStrings.exerciseEdit.usedIn });
      const links = within(list).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual([
        fitnessStrings.exerciseEdit.usedItem('Strength', 'Upper A'),
        fitnessStrings.exerciseEdit.usedItem('Cut', 'Full body'),
      ]);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/fitness-tracker/programs/p1/workouts/w1',
        '/fitness-tracker/programs/p2/workouts/w9',
      ]);
    });

    it('says so when no workout uses the exercise', () => {
      renderScreen(unused);

      expect(screen.getByText(fitnessStrings.exerciseEdit.notUsed)).toBeDefined();
    });
  });

  describe('archiving', () => {
    it('US5 scenario 4: archives an active exercise', async () => {
      renderScreen();

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.exerciseEdit.archive }));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/exercises/e1');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ isArchived: true }));
    });

    it('unarchives an archived exercise', async () => {
      renderScreen({ exercise: { id: 'e1', name: 'Press', isArchived: true } });

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.exerciseEdit.unarchive }));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ isArchived: false }));
      expect(
        screen.queryByRole('button', { name: fitnessStrings.exerciseEdit.archive }),
      ).toBeNull();
    });
  });

  describe('deleting', () => {
    it('US5 scenario 3, FR-036: is not offered once the exercise has set logs', () => {
      renderScreen({ slots: [], hasSetLogs: true });

      expect(screen.queryByRole('button', { name: fitnessStrings.exerciseEdit.delete })).toBeNull();
    });

    it('FR-036: is not offered while a workout uses the exercise', () => {
      renderScreen({ hasSetLogs: false });

      expect(screen.queryByRole('button', { name: fitnessStrings.exerciseEdit.delete })).toBeNull();
    });

    it('FR-038: asks first, then deletes and returns to the list', async () => {
      renderScreen(unused);

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.exerciseEdit.delete }));
      expect(screen.getByText(fitnessStrings.exerciseEdit.deleteConfirm)).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: fitnessStrings.exerciseEdit.deleteConfirmLabel }),
      );

      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/fitness-tracker/exercises'));
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    });
  });

  describe('muscles worked', () => {
    function muscle(name: string) {
      return screen.getByRole('checkbox', { name });
    }

    it('shows the linked muscles as checked on the anatomy chart', () => {
      renderScreen();

      expect(
        screen.getByRole('heading', { level: 2, name: fitnessStrings.exerciseEdit.musclesHeading }),
      ).toBeDefined();
      expect(muscle('Name of chest').getAttribute('aria-checked')).toBe('true');
      expect(muscle('Name of triceps').getAttribute('aria-checked')).toBe('false');
    });

    it('cycles a muscle through primary, secondary and off, without a refresh', async () => {
      renderScreen();
      const url = '/api/fitness/exercises/e1/body-parts/triceps';
      const settled = () =>
        waitFor(() => expect(muscle('Name of triceps').getAttribute('aria-busy')).toBeNull());

      fireEvent.click(muscle('Name of triceps'));
      expect(muscle('Name of triceps').getAttribute('aria-checked')).toBe('true');
      expect(descriptionOf(muscle('Name of triceps'))).toBe(fitnessStrings.anatomy.roles.primary);
      await settled();

      fireEvent.click(muscle('Name of triceps'));
      expect(descriptionOf(muscle('Name of triceps'))).toBe(fitnessStrings.anatomy.roles.secondary);
      await settled();

      fireEvent.click(muscle('Name of triceps'));
      expect(muscle('Name of triceps').getAttribute('aria-checked')).toBe('false');
      expect(descriptionOf(muscle('Name of triceps'))).toBeNull();
      await settled();

      expect(
        fetchMock.mock.calls.map(([target, init]) => [target, init?.method, init?.body]),
      ).toEqual([
        [url, 'PUT', JSON.stringify({ role: 'primary' })],
        [url, 'PUT', JSON.stringify({ role: 'secondary' })],
        [url, 'DELETE', undefined],
      ]);
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it('saves different muscles at the same time but ignores a second tap on one still saving', async () => {
      let finish = (): void => undefined;
      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            const previous = finish;
            finish = () => {
              previous();
              resolve(Response.json({}));
            };
          }),
      );
      renderScreen();

      fireEvent.click(muscle('Name of lats'));
      fireEvent.click(muscle('Name of lats'));
      fireEvent.click(muscle('Name of biceps'));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(muscle('Name of lats').getAttribute('aria-checked')).toBe('true');
      expect(muscle('Name of biceps').getAttribute('aria-checked')).toBe('true');
      finish();
      await waitFor(() => expect(muscle('Name of lats').getAttribute('aria-busy')).toBeNull());
    });

    it('returns a muscle to primary and explains when saving secondary fails', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'not-found' }, { status: 404 }));
      renderScreen();

      fireEvent.click(muscle('Name of chest'));
      expect(descriptionOf(muscle('Name of chest'))).toBe(fitnessStrings.anatomy.roles.secondary);

      expect(await screen.findByText(fitnessErrorStrings['not-found'])).toBeDefined();
      expect(muscle('Name of chest').getAttribute('aria-checked')).toBe('true');
      expect(descriptionOf(muscle('Name of chest'))).toBe(fitnessStrings.anatomy.roles.primary);
    });

    it('puts a muscle back to off and explains when linking it fails', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'not-found' }, { status: 404 }));
      renderScreen();

      fireEvent.click(muscle('Name of lats'));
      expect(muscle('Name of lats').getAttribute('aria-checked')).toBe('true');

      expect(await screen.findByText(fitnessErrorStrings['not-found'])).toBeDefined();
      expect(muscle('Name of lats').getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('estimated 1RM chart', () => {
    const progress = fitnessStrings.progress;

    it('shows the estimated 1RM chart as the first section, above the muscles', () => {
      renderScreen({}, oneRepMax());

      const figure = screen.getByRole('figure', { name: progress.oneRepMax.chartLabel });
      const muscles = screen.getByRole('heading', {
        level: 2,
        name: fitnessStrings.exerciseEdit.musclesHeading,
      });
      expect(
        figure.compareDocumentPosition(muscles) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.getByRole('heading', { level: 2, name: progress.oneRepMax.heading }),
      ).toBeDefined();
      expect(screen.getByText(progress.oneRepMax.note)).toBeDefined();
    });

    it('links ranges and keeps the selected variant', () => {
      renderScreen({}, oneRepMax({ selectedParam: 'v1' }));

      const nav = screen.getByRole('navigation', { name: progress.rangeLabel });
      const threeMonths = within(nav).getByRole('link', { name: progress.ranges['3m'] });
      expect(threeMonths.getAttribute('aria-current')).toBe('page');
      expect(threeMonths.getAttribute('href')).toBe(
        '/fitness-tracker/exercises/e1?range=3m&variant=v1',
      );
      expect(
        within(nav).getByRole('link', { name: progress.ranges['1y'] }).getAttribute('href'),
      ).toBe('/fitness-tracker/exercises/e1?range=1y&variant=v1');
    });

    it('links ranges without a variant when no series is selected', () => {
      renderScreen({}, emptyOneRepMax);

      const nav = screen.getByRole('navigation', { name: progress.rangeLabel });
      expect(
        within(nav).getByRole('link', { name: progress.ranges.all }).getAttribute('href'),
      ).toBe('/fitness-tracker/exercises/e1?range=all');
    });

    it('shows variant chips only when there are several series, with "No variant" for the null series', () => {
      renderScreen(
        {},
        oneRepMax({
          selectedParam: 'v1',
          chips: [
            { param: 'v1', variantName: 'Gym A', isSelected: true },
            { param: 'none', variantName: null, isSelected: false },
          ],
        }),
      );

      const nav = screen.getByRole('navigation', { name: progress.variantLabel });
      const gymA = within(nav).getByRole('link', { name: 'Gym A' });
      expect(gymA.getAttribute('aria-current')).toBe('page');
      expect(gymA.getAttribute('href')).toBe('/fitness-tracker/exercises/e1?range=3m&variant=v1');
      expect(within(nav).getByRole('link', { name: progress.noVariant }).getAttribute('href')).toBe(
        '/fitness-tracker/exercises/e1?range=3m&variant=none',
      );
    });

    it('shows no variant chips for a single series', () => {
      renderScreen({}, oneRepMax());

      expect(screen.queryByRole('navigation', { name: progress.variantLabel })).toBeNull();
    });

    it('shows the program legend with deleted programs marked', () => {
      renderScreen(
        {},
        oneRepMax({
          legend: [
            { programId: 'p1', name: 'PPL', isDeleted: true, colorIndex: 0 },
            { programId: 'p2', name: 'Strength', isDeleted: false, colorIndex: 1 },
          ],
        }),
      );

      const legend = screen.getByRole('list', { name: progress.legendLabel });
      expect(
        within(legend)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([progress.deletedProgram('PPL'), 'Strength']);
    });

    it('shows the 1RM empty state when nothing qualifies', () => {
      renderScreen(
        {},
        oneRepMax({
          selectedParam: null,
          points: [],
          legend: [{ programId: 'p1', name: 'PPL', isDeleted: false, colorIndex: 0 }],
        }),
      );

      expect(screen.getByText(progress.oneRepMax.empty)).toBeDefined();
      expect(screen.queryByRole('figure')).toBeNull();
      expect(screen.queryByRole('list', { name: progress.legendLabel })).toBeNull();
    });
  });
});
