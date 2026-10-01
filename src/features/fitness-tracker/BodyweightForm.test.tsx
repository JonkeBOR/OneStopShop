import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { BodyweightForm } from './BodyweightForm';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

test('renders a labeled weight input and a labeled date input', () => {
  render(<BodyweightForm />);

  expect(screen.getByLabelText('Weight (kg)')).toBeDefined();
  expect(screen.getByLabelText('Date')).toBeDefined();
});

test('on success, posts the weight and clears the form', async () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          measurement: { id: '1', recordedOn: '2026-03-05', kilograms: 82.4, createdAt: 'now' },
        }),
        { status: 201 },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);

  render(<BodyweightForm />);

  fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '82.4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const call = fetchMock.mock.calls[0];
  expect(call?.[0]).toBe('/api/bodyweight');
  const init = call?.[1];
  expect(init?.method).toBe('POST');
  const requestBody = init?.body;
  expect(typeof requestBody).toBe('string');
  expect(JSON.parse(typeof requestBody === 'string' ? requestBody : '')).toEqual({
    kilograms: 82.4,
  });

  await waitFor(() => {
    expect(screen.getByLabelText('Weight (kg)')).toHaveProperty('value', '');
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('shows a field-level message for an invalid weight', async () => {
  stubFetch(400, {
    error: {
      code: 'INVALID_MEASUREMENT',
      message: 'One or more fields need attention.',
      fields: { kilograms: 'Weight must be between 20 and 400 kg.' },
    },
  });

  render(<BodyweightForm />);

  fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(screen.getByText('Weight must be between 20 and 400 kg.')).toBeDefined();
  });
});

test('shows a retryable store-failure message when the store is unavailable', async () => {
  stubFetch(502, {
    error: { code: 'STORE_UNAVAILABLE', message: 'Google Sheets was unreachable.' },
  });

  render(<BodyweightForm />);

  fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '82.4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(screen.getByText('Could not save right now. Please try again.')).toBeDefined();
  });
});
