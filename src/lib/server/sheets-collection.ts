import 'server-only';
import type { Collection, CollectionFactory, RowCodec } from './collection';
import { StoreMisconfiguredError, StoreUnavailableError } from './collection';
import { env } from './env';
import { getStoreAccessToken } from './store-access-token';

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isValuesResponse(value: unknown): value is { values?: unknown[] } {
  return typeof value === 'object' && value !== null;
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getStoreAccessToken();

  let response: Response;
  try {
    response = await fetch(`${SHEETS_BASE_URL}/${env.googleSheetId}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new StoreUnavailableError('Could not reach Google Sheets');
  }

  if (response.status === 404) {
    throw new StoreMisconfiguredError('The spreadsheet or tab could not be found');
  }
  if (response.status === 401 || response.status === 403) {
    throw new StoreMisconfiguredError('Google Sheets refused the request');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new StoreUnavailableError('Google Sheets is currently unavailable');
  }
  if (!response.ok) {
    throw new StoreUnavailableError('Google Sheets returned an unexpected error');
  }

  return response;
}

export const createSheetsCollection: CollectionFactory = <T>(
  name: string,
  codec: RowCodec<T>,
): Collection<T> => ({
  readAll: async (): Promise<readonly T[]> => {
    const response = await sheetsFetch(`/values/${encodeURIComponent(`${name}!A2:Z`)}`);
    const body: unknown = await response.json();
    if (!isValuesResponse(body) || !Array.isArray(body.values)) {
      return [];
    }

    const records: T[] = [];
    for (const row of body.values) {
      if (!isStringArray(row)) {
        continue;
      }
      const record = codec.fromRow(row);
      if (record !== null) {
        records.push(record);
      }
    }
    return records;
  },
  append: async (record: T): Promise<void> => {
    const range = encodeURIComponent(`${name}!A:Z`);
    await sheetsFetch(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [codec.toRow(record)] }),
    });
  },
});
