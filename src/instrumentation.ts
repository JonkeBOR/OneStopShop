const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return input.toString();
}

function isValuesAppendBody(value: unknown): value is { values: readonly (readonly string[])[] } {
  if (typeof value !== 'object' || value === null || !('values' in value)) {
    return false;
  }
  return Array.isArray(value.values);
}

function createStubbedFetch(originalFetch: typeof fetch): typeof fetch {
  const rows: string[][] = [];

  return async function stubbedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = requestUrl(input);

    if (url === TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({ access_token: 'e2e-stub-token', expires_in: 3600 }), {
        status: 200,
      });
    }

    if (url.includes('sheets.googleapis.com') && url.includes(':append')) {
      const rawBody = init?.body;
      const body: unknown = typeof rawBody === 'string' ? JSON.parse(rawBody) : null;
      if (isValuesAppendBody(body)) {
        for (const row of body.values) {
          rows.push([...row]);
        }
      }
      return new Response('{}', { status: 200 });
    }

    if (url.includes('sheets.googleapis.com') && url.includes('/values/')) {
      return new Response(JSON.stringify({ values: rows }), { status: 200 });
    }

    return originalFetch(input, init);
  };
}

export function register(): void {
  if (process.env['E2E_STUB_GOOGLE_SHEETS'] !== '1') {
    return;
  }

  globalThis.fetch = createStubbedFetch(globalThis.fetch);
}
