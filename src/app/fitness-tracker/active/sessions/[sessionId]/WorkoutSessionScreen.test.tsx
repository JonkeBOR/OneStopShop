import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionFixture } from '@/features/fitness-tracker/components/test-fixtures';
import type { SessionView, SetLog } from '@/features/fitness-tracker/domain/types';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { WorkoutSessionScreen } from './WorkoutSessionScreen';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

let sessionCounter = 0;

function freshSession(overrides: Partial<SessionView> = {}): SessionView {
  sessionCounter += 1;
  return sessionFixture({ id: `session-${sessionCounter}`, ...overrides });
}

function loggedSet(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: 'log-1',
    exerciseId: 'e1',
    performedAt: new Date('2026-10-03T08:05:00Z'),
    setNumber: 1,
    reps: 12,
    weightKg: 65,
    variantId: null,
    context: {
      programId: 'pr',
      cycleId: 'c1',
      pass: 1,
      trainingBlockId: 'b2',
      blockNumber: 2,
      workoutId: 'w1',
      exerciseSlotId: 's1',
      workoutSessionId: 'session-x',
    },
    ...overrides,
  };
}

function withFirstSetLogged(session: SessionView): SessionView {
  return {
    ...session,
    slots: session.slots.map((slot) =>
      slot.id === 's1' ? { ...slot, loggedSets: [loggedSet()] } : slot,
    ),
  };
}

describe('WorkoutSessionScreen', () => {
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
    window.localStorage.clear();
  });

  const bench = 'Incline bench press';

  function weightBox(setNumber: number, exerciseName = bench): HTMLInputElement {
    const element = screen.getByRole('textbox', {
      name: fitnessStrings.session.weightLabel(setNumber, exerciseName),
    });
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('The weight field is not an input');
    }
    return element;
  }

  function repsBox(setNumber: number, exerciseName = bench): HTMLInputElement {
    const element = screen.getByRole('textbox', {
      name: fitnessStrings.session.repsLabel(setNumber, exerciseName),
    });
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('The reps field is not an input');
    }
    return element;
  }

  function logButton(setNumber: number, exerciseName = bench) {
    return screen.getByRole('button', {
      name: fitnessStrings.session.logLabel(setNumber, exerciseName),
    });
  }

  function section(exerciseName: string): HTMLElement {
    return screen.getByRole('region', { name: new RegExp(exerciseName) });
  }

  function loggedRow(setNumber: number, exerciseName = bench): HTMLElement {
    const row = within(section(exerciseName))
      .getByText(fitnessStrings.session.loggedLabel(setNumber))
      .closest('tr');
    if (!row) {
      throw new Error('The logged set is not in a table row');
    }
    return row;
  }

  function loggedCells(setNumber: number, exerciseName = bench): (string | null)[] {
    return within(loggedRow(setNumber, exerciseName))
      .getAllByRole('cell')
      .slice(0, 3)
      .map((cell) => cell.textContent);
  }

  it('shows the workout name with the block name', () => {
    render(
      <WorkoutSessionScreen
        session={freshSession({ block: { id: 'b2', number: 2, label: 'Hypertrophy' } })}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Day 1 · Hypertrophy' })).toBeDefined();
  });

  it('shows the workout name with the block number when the block has no name', () => {
    render(<WorkoutSessionScreen session={freshSession()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Day 1 · Block 2' })).toBeDefined();
    expect(
      screen.getByRole('link', { name: fitnessStrings.navigation.toBlock }).getAttribute('href'),
    ).toBe('/fitness-tracker/active/block');
  });

  describe('the sets', () => {
    it('FR-017: shows each exercise as a table with set, weight and reps columns, one row per planned set', () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      const table = within(section('Incline bench press')).getByRole('table', { name: bench });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual([
        fitnessStrings.session.columns.set,
        fitnessStrings.session.columns.weight,
        fitnessStrings.session.columns.reps,
        fitnessStrings.session.columns.log,
      ]);
      const bodyRows = within(table).getAllByRole('row').slice(1);
      expect(bodyRows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
        '1',
        '2',
        '3',
      ]);
      expect(within(section('Curl')).getAllByRole('row')).toHaveLength(2);
      expect(screen.queryByText(fitnessStrings.slotEdit.setNumber(1))).toBeNull();
    });

    it('US1 scenario 2: suggests the last weight as a placeholder and prefills the reps from the target', () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      expect(weightBox(1).value).toBe('');
      expect(weightBox(1).placeholder).toBe('65');
      expect(weightBox(2).placeholder).toBe('62.5');
      expect(repsBox(1).value).toBe('12');
      expect(repsBox(3).value).toBe('10');
    });

    it('US1 scenario 5: leaves the weight empty for an exercise with no history', () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      expect(weightBox(3).value).toBe('');
      expect(weightBox(3).placeholder).toBe('');
    });

    it('FR-010: opens a decimal keypad for the weight and a numeric one for the reps', () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      expect(weightBox(1).getAttribute('inputmode')).toBe('decimal');
      expect(repsBox(1).getAttribute('inputmode')).toBe('numeric');
    });

    it('FR-024: marks an optional exercise with a tag and a muted style, and no other', () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      expect(within(section('Curl')).getByText(fitnessStrings.common.optional)).toBeDefined();
      expect(
        within(section('Incline bench press')).queryByText(fitnessStrings.common.optional),
      ).toBeNull();
      expect(section('Curl').className).toMatch(/optional/);
      expect(section('Incline bench press').className).not.toMatch(/optional/);
    });

    it('says there is nothing to log when the workout has no exercises', () => {
      render(<WorkoutSessionScreen session={freshSession({ slots: [] })} />);

      expect(screen.getByText(fitnessStrings.session.nothingToLog)).toBeDefined();
    });
  });

  describe('logging a set', () => {
    it('US1 scenario 3, FR-005: one tap sends the suggested weight and the target reps', async () => {
      const session = freshSession();
      render(<WorkoutSessionScreen session={session} />);

      fireEvent.click(logButton(1));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/fitness/sessions/${session.id}/sets`);
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
        JSON.stringify({ plannedSetId: 'p1', reps: 12, weightKg: 65, variantId: null }),
      );
    });

    it('US1 scenario 4: sends a changed weight, accepting a comma', async () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      fireEvent.change(weightBox(1), { target: { value: '67,5' } });
      fireEvent.click(logButton(1));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
        JSON.stringify({ plannedSetId: 'p1', reps: 12, weightKg: 67.5, variantId: null }),
      );
    });

    it('FR-018: sends no weight when the weight is left empty', async () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      fireEvent.click(logButton(3));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
        JSON.stringify({ plannedSetId: 'p3', reps: 10, weightKg: null, variantId: null }),
      );
    });

    it('sends changed reps', async () => {
      render(<WorkoutSessionScreen session={freshSession()} />);

      fireEvent.change(repsBox(2), { target: { value: '9' } });
      fireEvent.click(logButton(2));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
        JSON.stringify({ plannedSetId: 'p2', reps: 9, weightKg: 62.5, variantId: null }),
      );
    });

    it.each([['abc'], ['61.255'], ['0'], ['-3']])(
      'FR-039: refuses a weight of %j without a request',
      (text) => {
        render(<WorkoutSessionScreen session={freshSession()} />);

        fireEvent.change(weightBox(1), { target: { value: text } });
        fireEvent.click(logButton(1));

        expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['invalid-weight']);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it.each([[''], ['0'], ['1000'], ['x']])(
      'FR-039: refuses reps of %j without a request',
      (text) => {
        render(<WorkoutSessionScreen session={freshSession()} />);

        fireEvent.change(repsBox(1), { target: { value: text } });
        fireEvent.click(logButton(1));

        expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['invalid-reps']);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it('edge case: shows the message and refreshes when the set was already logged elsewhere', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'set-already-logged' }, { status: 409 }));
      render(<WorkoutSessionScreen session={freshSession()} />);

      fireEvent.click(logButton(1));

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(
          fitnessErrorStrings['set-already-logged'],
        ),
      );
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it('shows the set as logged at once, before the server answers', () => {
      fetchMock.mockReturnValue(new Promise<Response>(() => undefined));
      render(<WorkoutSessionScreen session={freshSession()} />);

      fireEvent.change(weightBox(1), { target: { value: '67,5' } });
      fireEvent.click(logButton(1));

      expect(loggedCells(1)).toEqual(['1', '67.5', '12']);
      expect(
        screen.queryByRole('button', { name: fitnessStrings.session.logLabel(1, bench) }),
      ).toBeNull();
    });

    it('puts the inputs back, with the typed values and the message, when logging fails', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'unexpected' }, { status: 500 }));
      render(<WorkoutSessionScreen session={freshSession()} />);

      fireEvent.change(weightBox(1), { target: { value: '70' } });
      fireEvent.click(logButton(1));

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings.unexpected),
      );
      expect(weightBox(1).value).toBe('70');
      expect(logButton(1)).toBeDefined();
    });
  });

  describe('the variant', () => {
    function withVariant(session: SessionView): SessionView {
      return {
        ...session,
        slots: session.slots.map((slot) =>
          slot.id === 's1'
            ? { ...slot, variant: { id: 'v1', name: 'Barbell' }, hasVariantChoice: true }
            : slot,
        ),
      };
    }

    function optionsLink(exerciseName: string) {
      return screen.queryByRole('link', {
        name: fitnessStrings.session.slotOptionsLabel(exerciseName),
      });
    }

    it('shows the selected variant, muted, next to the exercise name', () => {
      render(<WorkoutSessionScreen session={withVariant(freshSession())} />);

      const variant = within(section(bench)).getByText('Barbell');
      expect(variant.className).toMatch(/variant/);
      expect(screen.getByRole('heading', { level: 2, name: bench })).toBeDefined();
    });

    it('links to the slot’s settings from a slot with a variant', () => {
      const session = withVariant(freshSession());
      render(<WorkoutSessionScreen session={session} />);

      expect(optionsLink(bench)?.getAttribute('href')).toBe(
        `/fitness-tracker/active/sessions/${session.id}/slots/s1`,
      );
    });

    it('shows no variant and no settings link on a slot without a variant', () => {
      render(<WorkoutSessionScreen session={withVariant(freshSession())} />);

      expect(within(section('Curl')).queryByText('Barbell')).toBeNull();
      expect(optionsLink('Curl')).toBeNull();
    });

    it('shows the variant and the options link only when there is a choice', () => {
      const lone = withVariant(freshSession());
      const single: SessionView = {
        ...lone,
        slots: lone.slots.map((slot) =>
          slot.id === 's1'
            ? { ...slot, variant: { id: 'v1', name: 'Default' }, hasVariantChoice: false }
            : slot,
        ),
      };
      const { unmount } = render(<WorkoutSessionScreen session={single} />);

      expect(screen.queryByText('Default')).toBeNull();
      expect(optionsLink(bench)).toBeNull();
      unmount();

      render(
        <WorkoutSessionScreen
          session={{
            ...single,
            slots: single.slots.map((slot) =>
              slot.id === 's1' ? { ...slot, hasVariantChoice: true } : slot,
            ),
          }}
        />,
      );

      expect(screen.getByText('Default')).toBeDefined();
      expect(optionsLink(bench)).not.toBeNull();
    });

    it('offers no variant picker on the session', () => {
      render(<WorkoutSessionScreen session={withVariant(freshSession())} />);

      expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('sends the variant the slot shows with a logged set', async () => {
      render(<WorkoutSessionScreen session={withVariant(freshSession())} />);

      fireEvent.click(logButton(1));

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
        JSON.stringify({ plannedSetId: 'p1', reps: 12, weightKg: 65, variantId: 'v1' }),
      );
    });

    it('shows the message and refreshes when the slot was switched elsewhere', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'variant-changed' }, { status: 409 }));
      render(<WorkoutSessionScreen session={withVariant(freshSession())} />);

      fireEvent.click(logButton(1));

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['variant-changed']),
      );
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('a logged set', () => {
    it('FR-019: keeps the row, tinted, with the logged values as text, and no inputs or button', () => {
      render(<WorkoutSessionScreen session={withFirstSetLogged(freshSession())} />);

      expect(loggedCells(1)).toEqual(['1', '65', '12']);
      expect(loggedRow(1).className).toMatch(/logged/);
      expect(within(loggedRow(1)).getByText(fitnessStrings.session.loggedLabel(1))).toBeDefined();
      expect(
        within(section('Incline bench press'))
          .getAllByRole('row')
          .filter((row) => /logged/.test(row.className)),
      ).toHaveLength(1);
      expect(
        screen.queryByRole('textbox', { name: fitnessStrings.session.weightLabel(1, bench) }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: fitnessStrings.session.logLabel(1, bench) }),
      ).toBeNull();
    });

    it('FR-020: leaves the other sets open so they can be logged in any order', () => {
      render(<WorkoutSessionScreen session={withFirstSetLogged(freshSession())} />);

      expect(logButton(2)).toBeDefined();
      expect(logButton(3)).toBeDefined();
    });

    it('shows a set logged without a weight as reps only', () => {
      const session = freshSession();
      render(
        <WorkoutSessionScreen
          session={{
            ...session,
            slots: session.slots.map((slot) =>
              slot.id === 's1'
                ? { ...slot, loggedSets: [loggedSet({ reps: 8, weightKg: null })] }
                : slot,
            ),
          }}
        />,
      );

      expect(loggedCells(1)).toEqual(['1', fitnessStrings.common.noValue, '8']);
    });

    it('formats the logged weight without trailing zeros', () => {
      const session = freshSession();
      render(
        <WorkoutSessionScreen
          session={{
            ...session,
            slots: session.slots.map((slot) =>
              slot.id === 's1'
                ? { ...slot, loggedSets: [loggedSet({ reps: 10, weightKg: 62.5 })] }
                : slot,
            ),
          }}
        />,
      );

      expect(loggedCells(1)[1]).toBe('62.5');
    });
  });

  describe('typed values', () => {
    it('US1 scenario 8, FR-021: survive leaving the view and opening it again', () => {
      const session = freshSession();
      const first = render(<WorkoutSessionScreen session={session} />);
      fireEvent.change(weightBox(2), { target: { value: '70' } });
      fireEvent.change(repsBox(2), { target: { value: '8' } });
      first.unmount();

      render(<WorkoutSessionScreen session={session} />);

      expect(weightBox(2).value).toBe('70');
      expect(repsBox(2).value).toBe('8');
      expect(weightBox(1).value).toBe('');
      expect(weightBox(1).placeholder).toBe('65');
    });

    it('drops the typed values of a set once it is logged', async () => {
      const session = freshSession();
      const first = render(<WorkoutSessionScreen session={session} />);
      fireEvent.change(weightBox(1), { target: { value: '70' } });
      fireEvent.click(logButton(1));
      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      first.unmount();

      render(<WorkoutSessionScreen session={session} />);

      expect(weightBox(1).value).toBe('');
      expect(weightBox(1).placeholder).toBe('65');
    });
  });

  describe('finishing', () => {
    function finishButton() {
      return screen.getByRole('button', { name: fitnessStrings.session.finishWorkout });
    }

    it('FR-022: finishes at once, with no dialog, when a set is logged', async () => {
      fetchMock.mockResolvedValue(Response.json({ progression: 'none', completedBlockNumber: 2 }));
      const session = withFirstSetLogged(freshSession());
      render(<WorkoutSessionScreen session={session} />);

      fireEvent.click(finishButton());

      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith(
          `/fitness-tracker/active/sessions/${session.id}/finished`,
        ),
      );
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/fitness/sessions/${session.id}/finish`);
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    });

    it('FR-022: asks first when no set is logged, and sends nothing until confirmed', async () => {
      fetchMock.mockResolvedValue(Response.json({ progression: 'none', completedBlockNumber: 2 }));
      const session = freshSession();
      render(<WorkoutSessionScreen session={session} />);

      fireEvent.click(finishButton());
      expect(screen.getByText(fitnessStrings.session.finishEmptyConfirm)).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: fitnessStrings.session.finishEmptyConfirmLabel }),
      );

      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith(
          `/fitness-tracker/active/sessions/${session.id}/finished`,
        ),
      );
    });

    it('waits while a set is being logged, then finishes with no dialog before the page refreshes', async () => {
      let answerLog: (response: Response) => void = () => undefined;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          answerLog = resolve;
        }),
      );
      fetchMock.mockResolvedValue(Response.json({ progression: 'none', completedBlockNumber: 2 }));
      const session = freshSession();
      render(<WorkoutSessionScreen session={session} />);

      fireEvent.click(logButton(1));

      expect(finishButton().hasAttribute('disabled')).toBe(true);
      answerLog(Response.json({}));
      await waitFor(() => expect(finishButton().hasAttribute('disabled')).toBe(false));
      fireEvent.click(finishButton());

      expect(document.querySelector('dialog[open]')).toBeNull();
      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith(
          `/fitness-tracker/active/sessions/${session.id}/finished`,
        ),
      );
      expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/fitness/sessions/${session.id}/finish`);
    });

    it('asks first again when the only set logged fails to log', async () => {
      fetchMock.mockResolvedValue(Response.json({ error: 'unexpected' }, { status: 500 }));
      render(<WorkoutSessionScreen session={freshSession()} />);

      fireEvent.click(logButton(1));
      await waitFor(() => expect(logButton(1)).toBeDefined());
      await waitFor(() => expect(finishButton().hasAttribute('disabled')).toBe(false));
      fireEvent.click(finishButton());

      expect(
        screen.getByText(fitnessStrings.session.finishEmptyConfirm).closest('dialog[open]'),
      ).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('US1 scenario 7: goes to the finished view with the completed block when it advanced', async () => {
      fetchMock.mockResolvedValue(
        Response.json({ progression: 'block-advanced', completedBlockNumber: 2 }),
      );
      const session = withFirstSetLogged(freshSession());
      render(<WorkoutSessionScreen session={session} />);

      fireEvent.click(finishButton());

      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith(
          `/fitness-tracker/active/sessions/${session.id}/finished?completed=2`,
        ),
      );
    });

    it('US1 scenario 7: does the same when the program starts again', async () => {
      fetchMock.mockResolvedValue(
        Response.json({ progression: 'new-pass', completedBlockNumber: 4 }),
      );
      const session = withFirstSetLogged(freshSession());
      render(<WorkoutSessionScreen session={session} />);

      fireEvent.click(finishButton());

      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith(
          `/fitness-tracker/active/sessions/${session.id}/finished?completed=4`,
        ),
      );
    });

    it('forgets the typed values of the session when it is finished', async () => {
      fetchMock.mockResolvedValue(Response.json({ progression: 'none', completedBlockNumber: 2 }));
      const session = withFirstSetLogged(freshSession());
      render(<WorkoutSessionScreen session={session} />);
      fireEvent.change(weightBox(2), { target: { value: '70' } });
      expect(window.localStorage.getItem(`fitness:session:${session.id}`)).not.toBeNull();

      fireEvent.click(finishButton());

      await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
      expect(window.localStorage.getItem(`fitness:session:${session.id}`)).toBeNull();
    });

    it('edge case: shows the message when the workout is already finished elsewhere', async () => {
      fetchMock.mockResolvedValue(
        Response.json({ error: 'session-not-in-progress' }, { status: 409 }),
      );
      render(<WorkoutSessionScreen session={withFirstSetLogged(freshSession())} />);

      fireEvent.click(finishButton());

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(
          fitnessErrorStrings['session-not-in-progress'],
        ),
      );
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
  });
});
