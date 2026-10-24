import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import { generateJson, readGeminiConfig, type GeminiSchema } from './client';

const endpoint =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

const config = { apiKey: 'test-key' };

const responseSchema: GeminiSchema = {
  type: 'OBJECT',
  properties: { affirmation: { type: 'STRING' } },
  required: ['affirmation'],
};

const request = {
  systemInstruction: 'Be brief.',
  userMessage: '{"sets":3}',
  responseSchema,
  timeoutMilliseconds: 4000,
  maxOutputTokens: 256,
};

function geminiResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function answer(text: string, finishReason = 'STOP'): unknown {
  return { candidates: [{ content: { parts: [{ text }] }, finishReason }] };
}

type Call = { url: string; init: RequestInit };

function recordingFetch(response: Response): {
  fetchFn: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = (url, init) => {
    calls.push({
      url: url instanceof Request ? url.url : url.toString(),
      init: init ?? {},
    });
    return Promise.resolve(response);
  };
  return { fetchFn, calls };
}

function onlyCall(calls: Call[]): Call {
  const [call] = calls;
  if (!call) {
    throw new Error('fetch was not called');
  }
  return call;
}

function requestBody(call: Call): string {
  return typeof call.init.body === 'string' ? call.init.body : '';
}

function resolvingTo(response: Response): typeof fetch {
  return recordingFetch(response).fetchFn;
}

function rejectingWith(error: Error): typeof fetch {
  return () => Promise.reject(error);
}

let warn: MockInstance<(...data: unknown[]) => void>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('generateJson', () => {
  test('posts to the generateContent endpoint with the key only in the header', async () => {
    const { fetchFn, calls } = recordingFetch(geminiResponse(answer('{"a":1}')));

    await generateJson(config, request, fetchFn);

    const { url, init } = onlyCall(calls);
    expect(url).toBe(endpoint);
    expect(url).not.toContain('test-key');
    expect(url).not.toContain('key=');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('test-key');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test('sends the prompt, the schema and the fixed generation settings', async () => {
    const { fetchFn, calls } = recordingFetch(geminiResponse(answer('{"a":1}')));

    await generateJson(config, request, fetchFn);

    const body = JSON.parse(requestBody(onlyCall(calls))) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: 'Be brief.' }] },
      contents: [{ role: 'user', parts: [{ text: '{"sets":3}' }] }],
      generationConfig: {
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
        responseSchema,
        thinkingConfig: { thinkingLevel: 'low' },
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
      ],
    });
    expect(body.generationConfig).not.toHaveProperty('temperature');
  });

  test('returns the parsed JSON of the answer', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse(answer('{"affirmation":"Huge."}'))),
    );

    expect(result).toEqual({ ok: true, value: { affirmation: 'Huge.' } });
  });

  test('joins text parts and skips thought parts', async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [{ text: 'x', thought: true }, { text: '{"a":' }, { text: '1}' }],
          },
          finishReason: 'STOP',
        },
      ],
    };

    const result = await generateJson(config, request, resolvingTo(geminiResponse(body)));

    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  test('marks a quota error as retryable and logs only the status', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse({ error: { message: 'quota' } }, 429)),
    );

    expect(result).toEqual({ ok: false, reason: 'status 429', retryable: true });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = (warn.mock.calls[0] ?? []).map((argument) => String(argument));
    expect(logged.some((text) => text.includes('429'))).toBe(true);
    for (const text of logged) {
      expect(text).not.toContain('test-key');
      expect(text).not.toContain('generativelanguage');
    }
  });

  test('cancels the body of an error response', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const response = new Response(body, { status: 429 });

    await generateJson(config, request, resolvingTo(response));

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('marks a server error as retryable', async () => {
    const result = await generateJson(config, request, resolvingTo(geminiResponse({}, 503)));

    expect(result).toEqual({ ok: false, reason: 'status 503', retryable: true });
  });

  test('marks a blocked prompt as not retryable', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse({ promptFeedback: { blockReason: 'SAFETY' } })),
    );

    expect(result).toEqual({ ok: false, reason: 'blocked', retryable: false });
  });

  test('marks an answer cut off at MAX_TOKENS as retryable', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse(answer('{"a":1}', 'MAX_TOKENS'))),
    );

    expect(result).toEqual({ ok: false, reason: 'finish MAX_TOKENS', retryable: true });
  });

  test('marks an answer that is not JSON as retryable', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse(answer('Great job!'))),
    );

    expect(result).toEqual({ ok: false, reason: 'invalid response', retryable: true });
  });

  test('marks a body that is not JSON as retryable', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(new Response('<html>', { status: 200 })),
    );

    expect(result).toEqual({ ok: false, reason: 'invalid response', retryable: true });
  });

  test('marks an answer without candidates as retryable', async () => {
    const result = await generateJson(config, request, resolvingTo(geminiResponse({})));

    expect(result).toEqual({ ok: false, reason: 'no candidates', retryable: true });
  });

  test('marks a timeout as retryable', async () => {
    const result = await generateJson(
      config,
      request,
      rejectingWith(new DOMException('timed out', 'TimeoutError')),
    );

    expect(result).toEqual({ ok: false, reason: 'timeout', retryable: true });
    const logged = warn.mock.calls.flat().map((argument) => String(argument));
    expect(logged.some((text) => text.includes('timeout'))).toBe(true);
  });

  test('marks a network failure as retryable', async () => {
    const result = await generateJson(
      config,
      request,
      rejectingWith(new TypeError('fetch failed')),
    );

    expect(result).toEqual({ ok: false, reason: 'network', retryable: true });
  });
  test("sends the request's maxOutputTokens", async () => {
    const { fetchFn, calls } = recordingFetch(geminiResponse(answer('{"a":1}')));

    await generateJson(config, { ...request, maxOutputTokens: 4096 }, fetchFn);

    const body = JSON.parse(requestBody(onlyCall(calls))) as {
      generationConfig: { maxOutputTokens: number };
    };
    expect(body.generationConfig.maxOutputTokens).toBe(4096);
  });

  test("aborts after the request's timeout", async () => {
    const waitForAbort: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });

    const result = await generateJson(
      config,
      { ...request, timeoutMilliseconds: 10 },
      waitForAbort,
    );

    expect(result).toEqual({ ok: false, reason: 'timeout', retryable: true });
  });

  test.each([400, 401, 403, 404])('marks status %i as not retryable', async (status) => {
    const result = await generateJson(config, request, resolvingTo(geminiResponse({}, status)));

    expect(result).toEqual({ ok: false, reason: `status ${status}`, retryable: false });
  });

  test.each(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'])(
    'marks a %s finish as not retryable',
    async (finishReason) => {
      const result = await generateJson(
        config,
        request,
        resolvingTo(geminiResponse(answer('{"a":1}', finishReason))),
      );

      expect(result).toEqual({ ok: false, reason: `finish ${finishReason}`, retryable: false });
    },
  );
});

describe('readGeminiConfig', () => {
  test('reads the Gemini key, trimmed, when Gemini is enabled', () => {
    expect(
      readGeminiConfig({ GEMINI_API_KEY: '  gemini-key  ', GEMINI_ENABLED: ' true ' }),
    ).toEqual({
      apiKey: 'gemini-key',
    });
  });

  test('has no Gemini config when the key is missing or blank', () => {
    expect(readGeminiConfig({ GEMINI_ENABLED: 'true' })).toBeNull();
    expect(readGeminiConfig({ GEMINI_API_KEY: '   ', GEMINI_ENABLED: 'true' })).toBeNull();
  });

  test('has no Gemini config unless Gemini is explicitly enabled', () => {
    expect(readGeminiConfig({ GEMINI_API_KEY: 'gemini-key' })).toBeNull();
    expect(readGeminiConfig({ GEMINI_API_KEY: 'gemini-key', GEMINI_ENABLED: '' })).toBeNull();
    expect(readGeminiConfig({ GEMINI_API_KEY: 'gemini-key', GEMINI_ENABLED: 'false' })).toBeNull();
    expect(readGeminiConfig({ GEMINI_API_KEY: 'gemini-key', GEMINI_ENABLED: '1' })).toBeNull();
  });
});
