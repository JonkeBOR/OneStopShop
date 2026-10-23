import 'server-only';
import { getGeminiConfig, type GeminiConfig } from './config';

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
};

export type GenerateJson = (request: GeminiRequest) => Promise<unknown>;

const model = 'gemini-3.8-flash';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const timeoutMilliseconds = 4000;
const maxOutputTokens = 256;
const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

type JsonObject = Record<string, unknown>;

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

function warn(kind: string): null {
  console.warn(`Gemini request failed: ${kind}`);
  return null;
}

function readAnswer(body: unknown): unknown {
  if (!isRecord(body)) {
    return warn('invalid response');
  }
  const { promptFeedback } = body;
  if (isRecord(promptFeedback) && promptFeedback.blockReason) {
    return warn('blocked');
  }
  const candidate = firstCandidate(body);
  if (!candidate) {
    return warn('no candidates');
  }
  if (candidate.finishReason !== 'STOP') {
    return warn(`finish ${String(candidate.finishReason)}`);
  }
  const text = answerText(candidate);
  if (text === null) {
    return warn('invalid response');
  }
  return JSON.parse(text) as unknown;
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
): Promise<unknown> {
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
          maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: request.responseSchema,
          thinkingConfig: { thinkingLevel: 'low' },
        },
        safetySettings,
      }),
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return warn(`status ${response.status}`);
    }
    return readAnswer((await response.json()) as unknown);
  } catch (error) {
    return warn(failureKind(error));
  }
}

export function getGeminiGenerator(): GenerateJson | null {
  const config = getGeminiConfig();
  if (!config) {
    return null;
  }
  return (request) => generateJson(config, request);
}
