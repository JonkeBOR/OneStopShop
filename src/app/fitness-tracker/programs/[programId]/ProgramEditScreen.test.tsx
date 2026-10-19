import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { programFixture } from '@/features/fitness-tracker/components/test-fixtures';
import { bodyPartIds } from '@/features/fitness-tracker/domain/body-part';
import type { BodyPartView } from '@/features/fitness-tracker/domain/types';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { ProgramEditScreen } from './ProgramEditScreen';

const bodyParts: BodyPartView[] = bodyPartIds.map((id) => ({
  id,
  name: id === 'chest' ? 'Chest' : `Name of ${id}`,
}));

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('ProgramEditScreen', () => {
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

  type Props = Parameters<typeof ProgramEditScreen>[0];

  function renderScreen(overrides: Partial<Props> = {}) {
    return render(
      <ProgramEditScreen
        program={programFixture()}
        otherActiveProgramName={null}
        inProgressWorkoutIds={[]}
        bodyPartLinks={new Map()}
        bodyParts={bodyParts}
        {...overrides}
      />,
    );
  }

  describe('weekly volume', () => {
    function volumeRegion() {
      return screen.getByRole('region', { name: 'Weekly volume' });
    }

    function highlightOf(part: string) {
      return (
        volumeRegion().querySelector(`[data-muscle="${part}"]`)?.getAttribute('data-highlight') ??
        null
      );
    }

    it('sits between blocks and workouts and colours the current block without optional slots', () => {
      renderScreen({
        bodyPartLinks: new Map([
          ['e1', [{ bodyPart: 'chest', role: 'primary' }]],
          ['e2', [{ bodyPart: 'biceps', role: 'primary' }]],
        ]),
      });

      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual([
        fitnessStrings.programEdit.blocksTitle,
        'Weekly volume',
        fitnessStrings.programEdit.workoutsTitle,
      ]);
      expect(highlightOf('chest')).toBe('low');
      expect(highlightOf('biceps')).toBeNull();
    });

    it('shows the chart and its legend without a list of sets', () => {
      renderScreen({ bodyPartLinks: new Map([['e1', [{ bodyPart: 'chest', role: 'primary' }]]]) });

      expect(within(volumeRegion()).getAllByRole('list')).toHaveLength(1);
      expect(within(volumeRegion()).queryByText(/sets/)).toBeNull();
    });

    it('leaves every muscle plain when no exercise is linked', () => {
      renderScreen();

      expect(volumeRegion().querySelectorAll('[data-highlight]')).toHaveLength(0);
    });

    it('is left out when the program has no workouts', () => {
      renderScreen({ program: programFixture({ workouts: [] }) });

      expect(screen.queryByRole('region', { name: 'Weekly volume' })).toBeNull();
    });
  });

  it('shows the program name as the heading with a rename form, and links back to Programs', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: 'Strength' })).toBeDefined();
    expect(
      screen.getByRole('textbox', { name: fitnessStrings.programEdit.nameLabel }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: fitnessStrings.navigation.toPrograms }).getAttribute('href'),
    ).toBe('/fitness-tracker/programs');
  });

  describe('blocks', () => {
    function blockList() {
      return screen.getByRole('list', { name: fitnessStrings.programEdit.blocksTitle });
    }

    it('FR-026: lists the blocks with an editable label each', () => {
      renderScreen();

      const rows = within(blockList()).getAllByRole('listitem');
      expect(rows).toHaveLength(3);
      const second = within(rows[1] as HTMLElement).getByRole('textbox', {
        name: fitnessStrings.programEdit.blockLabelLabel(2),
      });
      expect(second instanceof HTMLInputElement && second.value).toBe('Deload');
    });

    it('saves a changed label when the field is left', async () => {
      renderScreen();

      const input = screen.getByRole('textbox', {
        name: fitnessStrings.programEdit.blockLabelLabel(1),
      });
      fireEvent.change(input, { target: { value: 'Volume' } });
      fireEvent.blur(input);

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/blocks/b1');
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ label: 'Volume' }));
    });

    it('does not save an unchanged label', () => {
      renderScreen();

      const input = screen.getByRole('textbox', {
        name: fitnessStrings.programEdit.blockLabelLabel(2),
      });
      fireEvent.blur(input);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('US3 scenario 7: adds a block at the end', async () => {
      renderScreen();

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.programEdit.addBlock }));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/programs/p1/blocks');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    });

    it('FR-026: removes a block after confirming', async () => {
      renderScreen();

      fireEvent.click(
        screen.getByRole('button', { name: fitnessStrings.programEdit.removeBlockFor(3) }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: fitnessStrings.programEdit.removeBlockConfirmLabel }),
      );

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/blocks/b3');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    });

    it('FR-026: offers no removal when only one block is left', () => {
      renderScreen({
        program: programFixture({
          blocks: [{ id: 'b1', number: 1, label: null }],
          cycle: { id: 'c1', currentBlockId: 'b1', pass: 1 },
        }),
      });

      expect(screen.queryByRole('button', { name: new RegExp('Remove block') })).toBeNull();
    });

    it('FR-034: says that removing the current block moves on to the next one', () => {
      renderScreen();

      expect(
        screen.getByText(fitnessStrings.programEdit.removeCurrentBlockMovesOn(2, 3)),
      ).toBeDefined();
      expect(screen.getByText(fitnessStrings.programEdit.removeBlockPlain(1))).toBeDefined();
    });

    it('FR-034, FR-043: says that removing the current last block starts the program again', () => {
      renderScreen({
        program: programFixture({ cycle: { id: 'c1', currentBlockId: 'b3', pass: 1 } }),
      });

      expect(
        screen.getByText(fitnessStrings.programEdit.removeCurrentBlockStartsAgain(3)),
      ).toBeDefined();
    });
  });

  describe('workouts', () => {
    function workoutList() {
      return screen.getByRole('list', { name: fitnessStrings.programEdit.workoutsTitle });
    }

    it('US3 scenario 2: lists the workouts, each linking to its edit page', () => {
      renderScreen();

      const rows = within(workoutList()).getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      expect(
        within(rows[0] as HTMLElement)
          .getByRole('link', { name: 'Upper A' })
          .getAttribute('href'),
      ).toBe('/fitness-tracker/programs/p1/workouts/w1');
    });

    it('gives every workout a reorder handle that can be picked up with the keyboard', () => {
      renderScreen();

      const rows = within(workoutList()).getAllByRole('listitem');
      const handle = within(rows[0] as HTMLElement).getByRole('button', {
        name: fitnessStrings.reorder.handleFor('Upper A'),
      });
      expect(handle.getAttribute('aria-roledescription')).toBe(
        fitnessStrings.reorder.roleDescription,
      );
      expect(handle.getAttribute('tabindex')).toBe('0');
      expect(
        within(rows[1] as HTMLElement).getByRole('button', {
          name: fitnessStrings.reorder.handleFor('Lower A'),
        }),
      ).toBeDefined();
    });

    it('keeps a workout row to its name, a trash can and a reorder handle', () => {
      renderScreen();
      const row = within(workoutList()).getAllByRole('listitem')[0] as HTMLElement;

      expect(
        within(row)
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label')),
      ).toEqual([
        fitnessStrings.programEdit.removeWorkoutFor('Upper A'),
        fitnessStrings.reorder.handleFor('Upper A'),
      ]);
      expect(within(row).queryByRole('textbox')).toBeNull();
    });

    it('FR-026: removes a workout from its trash can only after confirming', async () => {
      renderScreen();
      const row = within(workoutList()).getAllByRole('listitem')[0] as HTMLElement;

      fireEvent.click(
        within(row).getByRole('button', {
          name: fitnessStrings.programEdit.removeWorkoutFor('Upper A'),
        }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(
        within(row).getByRole('button', {
          name: fitnessStrings.programEdit.removeWorkoutConfirmLabel,
        }),
      );

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/workouts/w1');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    });

    it('adds a workout from a plus link beside the heading, which opens a new workout', () => {
      renderScreen();

      const add = screen.getByRole('link', { name: fitnessStrings.programEdit.addWorkout });
      expect(add.getAttribute('href')).toBe('/fitness-tracker/programs/p1/workouts/new');
      expect(add.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('FR-005: explains what to do when there are no workouts', () => {
      renderScreen({ program: programFixture({ workouts: [] }) });

      expect(screen.getByText(fitnessStrings.programEdit.noWorkouts)).toBeDefined();
    });

    it('FR-034: says what removal does to the current block of an active program', () => {
      renderScreen();

      expect(
        screen.getAllByText(
          new RegExp(fitnessStrings.programEdit.removeWorkoutMovesOn.slice(0, 20)),
        ).length,
      ).toBeGreaterThan(0);
    });

    it('FR-034: mentions an open workout that will be finished', () => {
      renderScreen({ inProgressWorkoutIds: ['w2'] });

      expect(
        screen.getByText(
          new RegExp(fitnessStrings.programEdit.removeWorkoutInProgress.slice(0, 20)),
        ),
      ).toBeDefined();
    });
  });

  describe('status and activation', () => {
    it('US4 scenario 1: an inactive program offers Activate and no Active badge', () => {
      renderScreen({ program: programFixture({ isActive: false }) });

      expect(
        screen.getByRole('button', { name: fitnessStrings.programEdit.activate }),
      ).toBeDefined();
      expect(screen.queryByText(fitnessStrings.programEdit.active)).toBeNull();
      expect(screen.queryByRole('button', { name: fitnessStrings.programEdit.pause })).toBeNull();
    });

    it('activates straight away when no other program is active', async () => {
      renderScreen({ program: programFixture({ isActive: false }), otherActiveProgramName: null });

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.programEdit.activate }));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/programs/p1/activation');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    });

    it('FR-038: asks before activating while another program is active, naming it', async () => {
      renderScreen({
        program: programFixture({ isActive: false }),
        otherActiveProgramName: 'Hypertrophy',
      });

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.programEdit.activate }));
      expect(
        screen.getByText(fitnessStrings.programEdit.activateWillPause('Hypertrophy')),
      ).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: fitnessStrings.programEdit.activateConfirmLabel }),
      );

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/programs/p1/activation');
    });

    it('FR-013: shows program-incomplete inline', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'program-incomplete' }, { status: 409 }));
      renderScreen({ program: programFixture({ isActive: false }) });

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.programEdit.activate }));

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(
          fitnessErrorStrings['program-incomplete'],
        ),
      );
    });

    it('FR-032: an active program shows the badge, Pause and a link to the active program', () => {
      renderScreen({ program: programFixture({ isActive: true }) });

      expect(screen.getByText(fitnessStrings.programEdit.active)).toBeDefined();
      expect(screen.getByRole('button', { name: fitnessStrings.programEdit.pause })).toBeDefined();
      expect(
        screen
          .getByRole('link', { name: fitnessStrings.programEdit.openActiveProgram })
          .getAttribute('href'),
      ).toBe('/fitness-tracker/active');
      expect(
        screen.queryByRole('button', { name: fitnessStrings.programEdit.activate }),
      ).toBeNull();
    });

    it('FR-038: pausing asks first and then refreshes the page', async () => {
      renderScreen({ program: programFixture({ isActive: true }) });

      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.programEdit.pause }));
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: fitnessStrings.activeProgram.pauseConfirmLabel }),
      );

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/active-program');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    });
  });

  describe('deleting', () => {
    it('FR-033: offers delete for an inactive program, saying logged sets are kept', async () => {
      renderScreen({ program: programFixture({ isActive: false }) });

      expect(screen.getByText(fitnessStrings.programEdit.deleteConfirm)).toBeDefined();
      fireEvent.click(
        screen.getByRole('button', { name: fitnessStrings.programEdit.deleteProgram }),
      );
      fireEvent.click(screen.getByRole('button', { name: fitnessStrings.common.delete }));

      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/fitness-tracker/programs'));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/programs/p1');
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    });

    it('FR-033: offers no delete while the program is active', () => {
      renderScreen({ program: programFixture({ isActive: true }) });

      expect(
        screen.queryByRole('button', { name: fitnessStrings.programEdit.deleteProgram }),
      ).toBeNull();
    });
  });

  it('FR-032: tells the user that edits apply to future workouts while the program is active', () => {
    renderScreen({ program: programFixture({ isActive: true }) });

    expect(screen.getByText(fitnessStrings.programEdit.futureOnlyNote)).toBeDefined();
  });
});
