import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import { generateJson, getGeminiGenerator, type GeminiSchema } from './gemini';

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
  vi.unstubAllEnvs();
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

    expect(result).toEqual({ affirmation: 'Huge.' });
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

    expect(result).toEqual({ a: 1 });
  });

  test('returns null on a quota error and logs only the status', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse({ error: { message: 'quota' } }, 429)),
    );

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = (warn.mock.calls[0] ?? []).map((argument) => String(argument));
    expect(logged.some((text) => text.includes('429'))).toBe(true);
    for (const text of logged) {
      expect(text).not.toContain('test-key');
      expect(text).not.toContain('generativelanguage');
    }
  });

  test('returns null on a server error', async () => {
    const result = await generateJson(config, request, resolvingTo(geminiResponse({}, 503)));

    expect(result).toBeNull();
  });

  test('returns null when the prompt is blocked', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse({ promptFeedback: { blockReason: 'SAFETY' } })),
    );

    expect(result).toBeNull();
  });

  test('returns null unless the answer finished with STOP', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse(answer('{"a":1}', 'MAX_TOKENS'))),
    );

    expect(result).toBeNull();
  });

  test('returns null for an answer that is not JSON', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(geminiResponse(answer('Great job!'))),
    );

    expect(result).toBeNull();
  });

  test('returns null for a body that is not JSON', async () => {
    const result = await generateJson(
      config,
      request,
      resolvingTo(new Response('<html>', { status: 200 })),
    );

    expect(result).toBeNull();
  });

  test('returns null when there are no candidates', async () => {
    const result = await generateJson(config, request, resolvingTo(geminiResponse({})));

    expect(result).toBeNull();
  });

  test('returns null when the request times out', async () => {
    const result = await generateJson(
      config,
      request,
      rejectingWith(new DOMException('timed out', 'TimeoutError')),
    );

    expect(result).toBeNull();
    const logged = warn.mock.calls.flat().map((argument) => String(argument));
    expect(logged.some((text) => text.includes('timeout'))).toBe(true);
  });

  test('returns null when the network fails', async () => {
    const result = await generateJson(
      config,
      request,
      rejectingWith(new TypeError('fetch failed')),
    );

    expect(result).toBeNull();
  });
});

describe('getGeminiGenerator', () => {
  test('has no generator without a key', () => {
    vi.stubEnv('GEMINI_API_KEY', '');

    expect(getGeminiGenerator()).toBeNull();
  });

  test('has a generator with a key', () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');

    expect(getGeminiGenerator()).toBeTypeOf('function');
  });
});
