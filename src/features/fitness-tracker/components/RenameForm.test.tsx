import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { RenameForm } from './RenameForm';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('RenameForm', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    router.refresh.mockReset();
  });

  function renderForm() {
    render(
      <RenameForm label="Program name" currentName="Strength" url="/api/fitness/programs/p1" />,
    );
  }

  it('shows the current name in a labelled textbox', () => {
    renderForm();

    const input = screen.getByRole('textbox', { name: 'Program name' });
    expect(input instanceof HTMLInputElement && input.value).toBe('Strength');
  });

  it('keeps a hidden label naming the textbox', () => {
    render(
      <RenameForm
        label="Variant name, Gym A"
        currentName="Gym A"
        url="/api/fitness/exercises/e1/variants/v1"
        isLabelHidden
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Variant name, Gym A' })).toBeTruthy();
    expect(screen.getByText('Variant name, Gym A').className).toMatch(/visuallyHidden/);
  });

  describe('saving on blur', () => {
    function renderBlurForm() {
      render(
        <RenameForm
          label="Variant name, Gym A"
          currentName="Gym A"
          url="/api/fitness/exercises/e1/variants/v1"
          submitsOnBlur
        />,
      );
      return screen.getByRole('textbox', { name: 'Variant name, Gym A' });
    }

    it('shows no Rename button', () => {
      renderBlurForm();

      expect(screen.queryByRole('button', { name: fitnessStrings.common.rename })).toBeNull();
    });

    it('sends the new name when the field loses focus', async () => {
      fetchMock.mockResolvedValue(Response.json({}));
      const input = renderBlurForm();

      fireEvent.change(input, { target: { value: 'Gym B' } });
      fireEvent.blur(input);

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledWith('/api/fitness/exercises/e1/variants/v1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Gym B' }),
      });
    });

    it('sends nothing when the name is unchanged', () => {
      const input = renderBlurForm();

      fireEvent.blur(input);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('sends the new name and refreshes', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    renderForm();

    fireEvent.change(screen.getByRole('textbox', { name: 'Program name' }), {
      target: { value: 'Hypertrophy' },
    });
    fireEvent.click(screen.getByRole('button', { name: fitnessStrings.common.rename }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/fitness/programs/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hypertrophy' }),
    });
  });

  it('FR-013: shows a refusal inline', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'name-taken' }, { status: 409 }));
    renderForm();

    fireEvent.change(screen.getByRole('textbox', { name: 'Program name' }), {
      target: { value: 'Chins' },
    });
    fireEvent.click(screen.getByRole('button', { name: fitnessStrings.common.rename }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['name-taken']),
    );
  });

  it('does nothing when the name is unchanged', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: fitnessStrings.common.rename }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
