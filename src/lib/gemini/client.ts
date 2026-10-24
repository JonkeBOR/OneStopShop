export type GeminiConfig = { apiKey: string };

export type GeminiSchema = {
  type: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
  properties?: Readonly<Record<string, GeminiSchema>>;
  items?: GeminiSchema;
  required?: readonly string[];
};

export type GeminiRequest = {
  systemInstruction: string;
  userMessage: string;
  responseSchema: GeminiSchema;
  timeoutMilliseconds: number;
  maxOutputTokens: number;
};

export type GeminiOutcome =
  { ok: true; value: unknown } | { ok: false; reason: string; retryable: boolean };

export type GenerateJson = (request: GeminiRequest) => Promise<GeminiOutcome>;

const model = 'gemini-3.8-flash';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const tooManyRequests = 429;
const firstServerError = 500;
const blockingFinishes = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']);
const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

type JsonObject = Record<string, unknown>;

type Environment = Readonly<Record<string, string | undefined>>;

export function readGeminiConfig(env: Environment): GeminiConfig | null {
  const isEnabled = env.GEMINI_ENABLED?.trim() === 'true';
  const apiKey = env.GEMINI_API_KEY?.trim();
  return isEnabled && apiKey ? { apiKey } : null;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function firstCandidate(body: JsonObject): JsonObject | null {
  const { candidates } = body;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const candidate: unknown = candidates[0];
  return isRecord(candidate) ? candidate : null;
}

function answerText(candidate: JsonObject): string | null {
  const { content } = candidate;
  if (!isRecord(content) || !Array.isArray(content.parts)) {
    return null;
  }
  const parts: unknown[] = content.parts;
  return parts
    .filter(isRecord)
    .filter((part) => part.thought !== true)
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function failure(reason: string, retryable: boolean): GeminiOutcome {
  console.warn(`Gemini request failed: ${reason}`);
  return { ok: false, reason, retryable };
}

function isRetryableStatus(status: number): boolean {
  return status === tooManyRequests || status >= firstServerError;
}

function readAnswer(body: unknown): GeminiOutcome {
  if (!isRecord(body)) {
    return failure('invalid response', true);
  }
  const { promptFeedback } = body;
  if (isRecord(promptFeedback) && promptFeedback.blockReason) {
    return failure('blocked', false);
  }
  const candidate = firstCandidate(body);
  if (!candidate) {
    return failure('no candidates', true);
  }
  if (candidate.finishReason !== 'STOP') {
    const finishReason = String(candidate.finishReason);
    return failure(`finish ${finishReason}`, !blockingFinishes.has(finishReason));
  }
  const text = answerText(candidate);
  if (text === null) {
    return failure('invalid response', true);
  }
  return { ok: true, value: JSON.parse(text) as unknown };
}

function failureKind(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'timeout';
  }
  if (error instanceof SyntaxError) {
    return 'invalid response';
  }
  return 'network';
}

export async function generateJson(
  config: GeminiConfig,
  request: GeminiRequest,
  fetchFn: typeof fetch = fetch,
): Promise<GeminiOutcome> {
  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: request.userMessage }] }],
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: request.responseSchema,
          thinkingConfig: { thinkingLevel: 'low' },
        },
        safetySettings,
      }),
      signal: AbortSignal.timeout(request.timeoutMilliseconds),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return failure(`status ${response.status}`, isRetryableStatus(response.status));
    }
    return readAnswer((await response.json()) as unknown);
  } catch (error) {
    return failure(failureKind(error), true);
  }
}

export function geminiGenerator(config: GeminiConfig, fetchFn: typeof fetch = fetch): GenerateJson {
  return (request) => generateJson(config, request, fetchFn);
}
