import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSlotSettings } from '@/features/fitness-tracker/domain/types';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { SlotSectionEdit } from './SlotSectionEdit';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

let sessionCounter = 0;

function settingsFixture(overrides: Partial<SessionSlotSettings> = {}): SessionSlotSettings {
  sessionCounter += 1;
  return {
    sessionId: `slot-session-${sessionCounter}`,
    status: 'in_progress',
    exercise: { id: 'e1', name: 'Incline bench press', isArchived: false },
    plannedSetIds: ['p1', 'p2'],
    variants: [
      { id: 'v1', name: 'Barbell' },
      { id: 'v2', name: 'Dumbbell' },
    ],
    selectedVariantId: 'v1',
    isLocked: false,
    ...overrides,
  };
}

describe('SlotSectionEdit', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
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

  function picker(): HTMLSelectElement {
    const element = screen.getByRole('combobox', {
      name: fitnessStrings.session.variantLabel('Incline bench press'),
    });
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error('The picker is not a select');
    }
    return element;
  }

  it('is titled with the exercise and goes back to the session', () => {
    const settings = settingsFixture();
    render(<SlotSectionEdit slotId="s1" settings={settings} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Incline bench press' })).toBeDefined();
    expect(
      screen.getByRole('link', { name: fitnessStrings.navigation.toSession }).getAttribute('href'),
    ).toBe(`/fitness-tracker/active/sessions/${settings.sessionId}`);
    expect(picker().value).toBe('v1');
  });

  it('puts the picker under an "Exercise variant" heading', () => {
    render(<SlotSectionEdit slotId="s1" settings={settingsFixture()} />);

    const section = screen.getByRole('region', {
      name: fitnessStrings.slotSectionEdit.variantHeading,
    });
    expect(
      within(section).getByRole('heading', {
        level: 2,
        name: fitnessStrings.slotSectionEdit.variantHeading,
      }),
    ).toBeDefined();
    expect(within(section).getByRole('combobox')).toBe(picker());
  });

  it('disables the picker once a set of the slot is logged', () => {
    render(<SlotSectionEdit slotId="s1" settings={settingsFixture({ isLocked: true })} />);

    expect(picker().disabled).toBe(true);
  });

  it('drops the slot’s typed weights and goes back to the session after a switch', async () => {
    const settings = settingsFixture();
    const draftsKey = `fitness:session:${settings.sessionId}`;
    window.localStorage.setItem(
      draftsKey,
      JSON.stringify({ p1: { weight: '70', reps: '8' }, p9: { weight: '50' } }),
    );
    render(<SlotSectionEdit slotId="s1" settings={settings} />);

    fireEvent.change(picker(), { target: { value: 'v2' } });

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        `/fitness-tracker/active/sessions/${settings.sessionId}`,
      ),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/fitness/sessions/${settings.sessionId}/slots/s1/variant`,
    );
    expect(JSON.parse(window.localStorage.getItem(draftsKey) ?? '')).toEqual({
      p1: { reps: '8' },
      p9: { weight: '50' },
    });
  });

  it('stays and shows the message when the switch fails', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'variant-locked' }, { status: 409 }));
    render(<SlotSectionEdit slotId="s1" settings={settingsFixture()} />);

    fireEvent.change(picker(), { target: { value: 'v2' } });

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['variant-locked']),
    );
    expect(picker().value).toBe('v1');
    expect(router.push).not.toHaveBeenCalled();
  });
});
