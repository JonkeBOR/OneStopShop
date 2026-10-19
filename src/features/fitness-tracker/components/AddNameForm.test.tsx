import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddNameForm } from './AddNameForm';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('AddNameForm', () => {
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
  });

  function renderForm(confirm?: { message: string; confirmLabel: string }) {
    render(<AddNameForm label="Name" submitLabel="Add" url="/api/things" confirm={confirm} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gym A' } });
  }

  it('posts straight away without a confirmation', async () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/things');
  });

  it('posts nothing until the confirmation is accepted', async () => {
    renderForm({ message: 'Sure?', confirmLabel: 'Do it' });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Sure?')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'Gym A' }));
  });

  it('posts nothing when Enter is pressed in the field before confirming', () => {
    renderForm({ message: 'Sure?', confirmLabel: 'Do it' });

    fireEvent.submit(screen.getByLabelText('Name'));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
