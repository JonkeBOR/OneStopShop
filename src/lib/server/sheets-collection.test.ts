import { afterEach, describe, expect, test, vi } from 'vitest';
import { StoreMisconfiguredError, StoreUnavailableError } from './collection';
import type { RowCodec } from './collection';

vi.mock('./store-access-token', () => ({
  getStoreAccessToken: vi.fn(() => Promise.resolve('the-access-token')),
}));

const { createSheetsCollection } = await import('./sheets-collection');

type Thing = { readonly value: string };

const thingCodec: RowCodec<Thing> = {
  header: ['value'],
  toRow: (thing) => [thing.value],
  fromRow: (row) => (row[0] !== undefined ? { value: row[0] } : null),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchOnce(status: number, body: string = ''): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status }))),
  );
}

describe('createSheetsCollection error mapping', () => {
  test('maps a 404 to StoreMisconfiguredError', async () => {
    stubFetchOnce(404);
    const collection = createSheetsCollection('Bodyweight', thingCodec);

    await expect(collection.readAll()).rejects.toBeInstanceOf(StoreMisconfiguredError);
  });

  test('maps a 401 to StoreMisconfiguredError', async () => {
    stubFetchOnce(401);
    const collection = createSheetsCollection('Bodyweight', thingCodec);

    await expect(collection.readAll()).rejects.toBeInstanceOf(StoreMisconfiguredError);
  });

  test('maps a 403 to StoreMisconfiguredError', async () => {
    stubFetchOnce(403);
    const collection = createSheetsCollection('Bodyweight', thingCodec);

    await expect(collection.readAll()).rejects.toBeInstanceOf(StoreMisconfiguredError);
  });

  test('maps a 429 to StoreUnavailableError', async () => {
    stubFetchOnce(429);
    const collection = createSheetsCollection('Bodyweight', thingCodec);

    await expect(collection.readAll()).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  test('maps a 503 to StoreUnavailableError', async () => {
    stubFetchOnce(503);
    const collection = createSheetsCollection('Bodyweight', thingCodec);

    await expect(collection.readAll()).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  test('no thrown error mentions the spreadsheet id or the access token', async () => {
    stubFetchOnce(404);
    const collection = createSheetsCollection('Bodyweight', thingCodec);
    expect.assertions(2);

    try {
      await collection.readAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('the-access-token');
      expect(message).not.toContain('test-sheet-id');
    }
  });
});

describe('createSheetsCollection append', () => {
  test('sends valueInputOption=RAW on the append request', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const collection = createSheetsCollection('Bodyweight', thingCodec);
    await collection.append({ value: 'hello' });

    const call = fetchMock.mock.calls[0];
    const url = call?.[0];
    expect(String(url)).toContain('valueInputOption=RAW');
  });
});

describe('createSheetsCollection readAll', () => {
  test('decodes rows through the codec and skips ones that fail to decode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ values: [['a'], [], ['b']] }), { status: 200 }),
        ),
      ),
    );

    const collection = createSheetsCollection('Bodyweight', thingCodec);
    const records = await collection.readAll();

    expect(records).toEqual([{ value: 'a' }, { value: 'b' }]);
  });
});
