import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddNameForm } from './AddNameForm';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('AddNameForm', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(Response.json({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    router.refresh.mockReset();
  });

  function renderForm() {
    render(<AddNameForm label="Name" submitLabel="Add" url="/api/things" />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gym A' } });
  }

  it('posts the name straight away', async () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/things');
  });
});
