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

    expect(screen.getByRole('textbox', { name: copy.renameLabel('Gym A') })).toBeTruthy();
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

  it('warns that removing a variant deletes its last weights', () => {
    render(<VariantEditor exerciseId="e1" variants={variants} />);

    expect(screen.getAllByText(copy.removeConfirm)).toHaveLength(2);
  });

  it('lists a lone variant with a rename form and no remove button', () => {
    render(<VariantEditor exerciseId="e1" variants={[{ id: 'v1', name: 'Default' }]} />);

    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: copy.renameLabel('Default'),
    });
    expect(input.value).toBe('Default');
    expect(screen.queryByRole('button', { name: copy.remove('Default') })).toBeNull();
  });

  it('renames a variant', async () => {
    render(<VariantEditor exerciseId="e1" variants={[{ id: 'v1', name: 'Default' }]} />);

    const input = screen.getByRole('textbox', { name: copy.renameLabel('Default') });
    fireEvent.change(input, { target: { value: 'Gym A' } });
    fireEvent.submit(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/exercises/e1/variants/v1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'Gym A' }));
  });

  it('adds a variant without asking first', async () => {
    render(<VariantEditor exerciseId="e1" variants={variants} />);

    fireEvent.change(screen.getByLabelText(copy.nameLabel), { target: { value: 'Gym C' } });
    fireEvent.click(screen.getByRole('button', { name: copy.add }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/fitness/exercises/e1/variants');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});
