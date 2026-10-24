import { describe, expect, it, vi } from 'vitest';
import type { GenerateJson } from '@/lib/server/gemini';
import type { AffirmationFacts } from '../domain/affirmation';
import { affirmationSystemPrompt, writeAffirmation } from './affirmations';

const facts: AffirmationFacts = {
  workout: 'Push',
  block: 1,
  durationMinutes: 64,
  totalSets: 3,
  totalReps: 30,
  totalVolumeKg: 1200,
  exercises: [{ name: 'Bench press', sets: 3, topWeightKg: 40 }],
};

describe('writeAffirmation', () => {
  it('asks for one affirmation from the session facts', async () => {
    const generate = vi.fn<GenerateJson>().mockResolvedValue({ affirmation: 'Huge.' });

    expect(await writeAffirmation(generate, facts)).toBe('Huge.');

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith({
      systemInstruction: affirmationSystemPrompt,
      userMessage: JSON.stringify(facts),
      responseSchema: {
        type: 'OBJECT',
        properties: { affirmation: { type: 'STRING' } },
        required: ['affirmation'],
      },
    });
  });

  it('gives nothing when the answer is unusable', async () => {
    const generate = vi
      .fn<GenerateJson>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ affirmation: 'a\nb' });

    expect(await writeAffirmation(generate, facts)).toBeNull();
    expect(await writeAffirmation(generate, facts)).toBeNull();
  });
});
