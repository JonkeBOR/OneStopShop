import type { GeminiOutcome, GeminiSchema, GenerateJson } from '@/lib/gemini/client';
import {
  affirmationCategories,
  affirmationMaxWords,
  affirmationsPerCategory,
  parseAffirmationSet,
  type AffirmationCategory,
  type AffirmationSet,
} from '../domain/affirmation';

export type Sleep = (milliseconds: number) => Promise<void>;

type CategoryGuide = { definition: string; tone: string; examples: readonly string[] };

const categoryGuides: Readonly<Record<AffirmationCategory, CategoryGuide>> = {
  'skipped-whole-workout': {
    definition: 'the workout was finished with no sets logged at all',
    tone: 'Unconditionally supportive. Showing up counts and rest is fine. Never guilt, never mockery',
    examples: [
      'You showed up, and honestly the universe noticed. Rest like royalty.',
      'Even legends take a day off. The barbell will wait for you.',
    ],
  },
  'skipped-whole-exercise': {
    definition: 'at least one whole required exercise was skipped',
    tone: 'Proud of what got done',
    examples: ['You picked your battles today and won every single one you fought.'],
  },
  'skipped-sets': {
    definition: 'every required exercise was done, but some planned sets were skipped',
    tone: 'Hyped for what got done',
    examples: ['Not every set, but every set you did shook the foundations of the gym.'],
  },
  'fully-completed': {
    definition: 'every planned set of every required exercise was logged',
    tone: 'Big energy',
    examples: ['Every single set done. Gravity has filed a formal complaint against you.'],
  },
  'fully-completed-with-improvements': {
    definition: 'fully completed, and stronger than last time on at least one exercise',
    tone: 'Bigger energy',
    examples: ['You got stronger today. Somewhere a forklift is quietly updating its resume.'],
  },
  'fully-completed-with-improvements-on-every-exercise': {
    definition: 'fully completed, and stronger than last time on every exercise',
    tone: 'Maximum, cosmic, completely unhinged',
    examples: [
      'Stronger at everything. The sun has asked you to stop outshining it. 💪',
      'Every lift went up. Physics is in therapy and the gods want your autograph.',
    ],
  },
};

function categoryLines(category: AffirmationCategory, index: number): string {
  const guide = categoryGuides[category];
  return [
    `${index + 1}. ${category}: ${guide.definition}. Tone: ${guide.tone}.`,
    ...guide.examples.map((example) => `   - Example: ${example}`),
  ].join('\n');
}

export const affirmationSystemPrompt = `Write unhinged, absurdly over-the-top positive affirmations for someone who just finished a strength training session, sorted into the six categories below. The app decides later which category a session achieved and shows one line from it, so every affirmation must stand alone.

The categories, in order of increasing achievement. The energy rises with each category: the first is warm and gentle, the last is maximum, cosmic and completely unhinged.

${affirmationCategories.map(categoryLines).join('\n\n')}

Rules:
- Write exactly ${affirmationsPerCategory} affirmations per category, all unique. Never repeat or reword a line across categories.
- Each affirmation has at most ${affirmationMaxWords} words: one sentence, or two very short ones.
- No numbers, weights, exercise names, days or claims about what the reader did beyond what the category means.
- Positive about the person. No insults, never mock them, and never guilt in the skipping categories.
- No medical, health, diet or body-shape claims.
- English, no hashtags, at most one emoji.
- The examples set the voice. Write new lines, never copy them.

Reply as JSON with one array of strings per category id.`;

export const affirmationUserMessage = "Write this week's set.";

const attempts = 3;
const backoffMilliseconds = [30_000, 60_000];
const timeoutMilliseconds = 180_000;
const maxOutputTokens = 4096;

export function affirmationResponseSchema(): GeminiSchema {
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(
      affirmationCategories.map((category) => [
        category,
        { type: 'ARRAY', items: { type: 'STRING' } } satisfies GeminiSchema,
      ]),
    ),
    required: [...affirmationCategories],
  };
}

type AttemptResult =
  | { kind: 'set'; set: AffirmationSet }
  | { kind: 'retry'; reason: string }
  | { kind: 'stop'; reason: string };

function judge(outcome: GeminiOutcome): AttemptResult {
  if (!outcome.ok) {
    return { kind: outcome.retryable ? 'retry' : 'stop', reason: outcome.reason };
  }
  const set = parseAffirmationSet(outcome.value);
  return set === null ? { kind: 'retry', reason: 'invalid set' } : { kind: 'set', set };
}

export async function writeAffirmationSet(
  generate: GenerateJson,
  sleep: Sleep,
): Promise<AffirmationSet | null> {
  let reason = 'invalid set';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const wait = backoffMilliseconds[attempt - 1];
    if (wait !== undefined) {
      await sleep(wait);
    }
    const result = judge(
      await generate({
        systemInstruction: affirmationSystemPrompt,
        userMessage: affirmationUserMessage,
        responseSchema: affirmationResponseSchema(),
        timeoutMilliseconds,
        maxOutputTokens,
      }),
    );
    if (result.kind === 'set') {
      return result.set;
    }
    reason = result.reason;
    if (result.kind === 'stop') {
      break;
    }
  }
  console.warn(`Affirmation set failed: ${reason}`);
  return null;
}
