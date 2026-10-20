import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { programFixture } from '@/features/fitness-tracker/components/test-fixtures';
import type { WorkoutView } from '@/features/fitness-tracker/domain/types';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { WorkoutEditScreen } from './WorkoutEditScreen';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

function fixtureWorkout(): WorkoutView {
  const found = programFixture().workouts[0];
  if (!found) {
    throw new Error('The fixture has no workout');
  }
  return found;
}

describe('WorkoutEditScreen', () => {
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
    router.replace.mockReset();
  });

  function renderScreen(overrides: Partial<Parameters<typeof WorkoutEditScreen>[0]> = {}) {
    return render(<WorkoutEditScreen programId="p1" workout={fixtureWorkout()} {...overrides} />);
  }

  function slotList() {
    return screen.getByRole('list', { name: fitnessStrings.workoutEdit.slotsTitle });
  }

  it('shows the workout name, a rename form and a link back to the program', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: 'Upper A' })).toBeDefined();
    expect(
      screen.getByRole('textbox', { name: fitnessStrings.workoutEdit.nameLabel }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: fitnessStrings.navigation.toProgram }).getAttribute('href'),
    ).toBe('/fitness-tracker/programs/p1');
  });

  it('FR-027: lists the slots in order with their sets × reps per block', () => {
    renderScreen();

    const rows = within(slotList()).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('Incline bench press')).toBeDefined();
    expect(within(rows[0] as HTMLElement).getByText('3×12 · 3×10 · 2×8')).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText('1×12')).toBeDefined();
  });

  it('FR-027: each slot links to its edit page', () => {
    renderScreen();

    const link = within(slotList()).getByRole('link', { name: new RegExp('Incline bench press') });
    expect(link.getAttribute('href')).toBe('/fitness-tracker/programs/p1/workouts/w1/slots/s1');
  });

  it('FR-024: marks an optional slot with a tag and a muted style, and no other slot', () => {
    renderScreen();

    const rows = within(slotList()).getAllByRole('listitem');
    expect(within(rows[0] as HTMLElement).queryByText(fitnessStrings.common.optional)).toBeNull();
    expect(within(rows[1] as HTMLElement).getByText(fitnessStrings.common.optional)).toBeDefined();
    const optionalCard = within(rows[1] as HTMLElement).getByRole('link').parentElement;
    const regularCard = within(rows[0] as HTMLElement).getByRole('link').parentElement;
    expect(optionalCard?.className).toMatch(/optional/);
    expect(regularCard?.className).not.toMatch(/optional/);
  });

  it('gives every slot a reorder handle', () => {
    renderScreen();

    const rows = within(slotList()).getAllByRole('listitem');
    expect(
      within(rows[0] as HTMLElement).getByRole('button', {
        name: fitnessStrings.reorder.handleFor('Incline bench press'),
      }),
    ).toBeDefined();
  });

  it('FR-038: removes a slot only after confirming', async () => {
    renderScreen();

    fireEvent.click(
      screen.getByRole('button', {
        name: fitnessStrings.workoutEdit.removeSlotFor('Curl'),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: fitnessStrings.workoutEdit.removeSlotConfirmLabel }),
    );

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/slots/s2');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('FR-005: explains what to do when the workout has no exercises', () => {
    renderScreen({ workout: { id: 'w2', name: 'Lower A', slots: [] } });

    expect(screen.getByText(fitnessStrings.workoutEdit.noSlots)).toBeDefined();
  });

  it('FR-028: adds an exercise from a plus link beside the heading, not an inline form', () => {
    renderScreen();

    const add = screen.getByRole('link', { name: fitnessStrings.workoutEdit.addExercise });
    expect(add.getAttribute('href')).toBe('/fitness-tracker/programs/p1/workouts/w1/slots/new');
    expect(screen.queryByLabelText(fitnessStrings.workoutEdit.exerciseLabel)).toBeNull();
  });

  it('keeps the trash can and the reorder handle inside the slot card', () => {
    renderScreen();

    const row = within(slotList()).getAllByRole('listitem')[0] as HTMLElement;
    const card = within(row).getByRole('link').parentElement as HTMLElement;
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      fitnessStrings.workoutEdit.removeSlotFor('Incline bench press'),
      fitnessStrings.reorder.handleFor('Incline bench press'),
    ]);
  });

  describe('a new workout', () => {
    it('asks for a name first and offers no exercises until the workout exists', () => {
      renderScreen({ workout: null });

      expect(
        screen.getByRole('heading', { level: 1, name: fitnessStrings.workoutEdit.newTitle }),
      ).toBeDefined();
      const name = screen.getByRole('textbox', { name: fitnessStrings.workoutEdit.nameLabel });
      expect(name instanceof HTMLInputElement && name.value).toBe('');
      expect(screen.getByText(fitnessStrings.workoutEdit.nameFirst)).toBeDefined();
      expect(screen.queryByLabelText(fitnessStrings.workoutEdit.exerciseLabel)).toBeNull();
      expect(
        screen.queryByRole('link', { name: fitnessStrings.workoutEdit.addExercise }),
      ).toBeNull();
      expect(
        screen
          .getByRole('link', { name: fitnessStrings.navigation.toProgram })
          .getAttribute('href'),
      ).toBe('/fitness-tracker/programs/p1');
    });

    it('creates the workout and replaces the page with its edit screen', async () => {
      fetchMock.mockResolvedValue(Response.json({ id: 'w9' }, { status: 201 }));
      renderScreen({ workout: null });

      fireEvent.change(
        screen.getByRole('textbox', { name: fitnessStrings.workoutEdit.nameLabel }),
        { target: { value: 'Day 3' } },
      );
      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.common.submit }));

      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith('/fitness-tracker/programs/p1/workouts/w9'),
      );
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/programs/p1/workouts');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'Day 3' }));
    });

    it('FR-013: shows a refusal inline and stays on the page', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'name-taken' }, { status: 409 }));
      renderScreen({ workout: null });

      fireEvent.change(
        screen.getByRole('textbox', { name: fitnessStrings.workoutEdit.nameLabel }),
        { target: { value: 'Upper A' } },
      );
      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.common.submit }));

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['name-taken']),
      );
      expect(router.replace).not.toHaveBeenCalled();
    });
  });
});
