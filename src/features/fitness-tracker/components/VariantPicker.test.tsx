import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { VariantPicker } from './VariantPicker';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const variants = [
  { id: 'v1', name: 'Barbell' },
  { id: 'v2', name: 'Dumbbell' },
];

describe('VariantPicker', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const onSwitchStart = vi.fn();
  const onSwitchSettled = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(Response.json({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    onSwitchStart.mockReset();
    onSwitchSettled.mockReset();
    router.refresh.mockReset();
  });

  function renderPicker(overrides: { selectedVariantId?: string | null; locked?: boolean } = {}) {
    return render(
      <VariantPicker
        sessionId="session-1"
        slotId="s1"
        exerciseName="Bench"
        variants={variants}
        selectedVariantId={overrides.selectedVariantId ?? 'v1'}
        locked={overrides.locked ?? false}
        onSwitchStart={onSwitchStart}
        onSwitchSettled={onSwitchSettled}
      />,
    );
  }

  function picker(): HTMLSelectElement {
    const element = screen.getByRole('combobox', {
      name: fitnessStrings.session.variantLabel('Bench'),
    });
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error('The picker is not a select');
    }
    return element;
  }

  it('offers one option per variant with the selected one chosen', () => {
    renderPicker({ selectedVariantId: 'v2' });

    expect(Array.from(picker().options).map((option) => option.text)).toEqual([
      'Barbell',
      'Dumbbell',
    ]);
    expect(picker().value).toBe('v2');
  });

  it('reports the switch as started before the server answers', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));
    renderPicker();

    fireEvent.change(picker(), { target: { value: 'v2' } });

    expect(onSwitchStart).toHaveBeenCalledTimes(1);
    expect(onSwitchSettled).not.toHaveBeenCalled();
  });

  it('sends the chosen variant, refreshes and reports the switch', async () => {
    renderPicker();

    fireEvent.change(picker(), { target: { value: 'v2' } });

    await waitFor(() => expect(onSwitchSettled).toHaveBeenCalledWith(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/sessions/session-1/slots/s1/variant');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ variantId: 'v2' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(picker().value).toBe('v2');
  });

  it('is disabled once a set is logged', () => {
    renderPicker({ locked: true });

    expect(picker().disabled).toBe(true);
  });

  it('shows the error and the original choice again when the switch fails', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'variant-locked' }, { status: 409 }));
    renderPicker();

    fireEvent.change(picker(), { target: { value: 'v2' } });

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['variant-locked']),
    );
    expect(picker().value).toBe('v1');
    expect(onSwitchSettled).toHaveBeenCalledWith(false);
  });
});
