import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import { VariantEditor } from './VariantEditor';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const copy = fitnessStrings.exerciseEdit.variants;

describe('VariantEditor', () => {
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

  const variants = [
    { id: 'v1', name: 'Gym A' },
    { id: 'v2', name: 'Gym B' },
  ];

  it('lists each variant with a remove button', () => {
    render(<VariantEditor exerciseId="e1" variants={variants} />);

    expect(screen.getByText('Gym A')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.remove('Gym B') })).toBeTruthy();
  });

  it('deletes a variant after confirming', async () => {
    render(<VariantEditor exerciseId="e1" variants={variants} />);

    fireEvent.click(screen.getByRole('button', { name: copy.remove('Gym B') }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.removeConfirmLabel }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/exercises/e1/variants/v2');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('shows the empty text and asks before adding the first variant', async () => {
    render(<VariantEditor exerciseId="e1" variants={[]} />);
    expect(screen.getByText(copy.empty)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(copy.nameLabel), { target: { value: 'Gym A' } });
    fireEvent.click(screen.getByRole('button', { name: copy.add }));

    expect(screen.getByText(copy.firstConfirm)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.firstConfirmLabel }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/exercises/e1/variants');
  });

  it('adds further variants without a confirmation', async () => {
    render(<VariantEditor exerciseId="e1" variants={variants} />);

    fireEvent.change(screen.getByLabelText(copy.nameLabel), { target: { value: 'Gym C' } });
    fireEvent.click(screen.getByRole('button', { name: copy.add }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(copy.firstConfirm)).toBeNull();
  });
});
