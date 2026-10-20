import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitnessErrorStrings, fitnessStrings } from '@/lib/strings/fitness';
import { NewNameForm } from './NewNameForm';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('NewNameForm', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    router.replace.mockReset();
  });

  function renderForm() {
    render(
      <NewNameForm
        label={fitnessStrings.programEdit.nameLabel}
        url="/api/fitness/programs"
        createdHrefPrefix="/fitness-tracker/programs"
      />,
    );
  }

  function nameField(): HTMLElement {
    return screen.getByRole('textbox', { name: fitnessStrings.programEdit.nameLabel });
  }

  function submitButton(): HTMLElement {
    return screen.getByRole('button', { name: fitnessStrings.common.submit });
  }

  it('offers only the name and a Submit button, disabled until a name is typed', () => {
    renderForm();

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(submitButton()).toHaveProperty('disabled', true);
    fireEvent.change(nameField(), { target: { value: '  ' } });
    expect(submitButton()).toHaveProperty('disabled', true);
    fireEvent.change(nameField(), { target: { value: 'Strength' } });
    expect(submitButton()).toHaveProperty('disabled', false);
  });

  it('posts only the name and replaces the page with the created entity', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'p9' }));
    renderForm();

    fireEvent.change(nameField(), { target: { value: 'Strength' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/fitness-tracker/programs/p9'),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/fitness/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Strength' }),
    });
  });

  it('shows a taken name inline and stays on the page', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'name-taken' }, { status: 409 }));
    renderForm();

    fireEvent.change(nameField(), { target: { value: 'Strength' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(fitnessErrorStrings['name-taken']),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
