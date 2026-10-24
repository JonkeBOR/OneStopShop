import { describe, expect, it } from 'vitest';
import {
  affirmationCategories,
  affirmationWeekStart,
  parseAffirmationSet,
  pickAffirmation,
  type AffirmationCategory,
} from './affirmation';

describe('affirmationCategories', () => {
  it('lists the six categories in order of increasing achievement', () => {
    expect(affirmationCategories).toEqual([
      'skipped-whole-workout',
      'skipped-whole-exercise',
      'skipped-sets',
      'fully-completed',
      'fully-completed-with-improvements',
      'fully-completed-with-improvements-on-every-exercise',
    ]);
  });
});

describe('affirmationWeekStart', () => {
  it('keeps Monday 00:00 UTC as the start of its own week', () => {
    expect(affirmationWeekStart(new Date('2026-10-26T00:00:00.000Z'))).toEqual(
      new Date('2026-10-26T00:00:00.000Z'),
    );
  });

  it('puts the last moment of Sunday in the week that began the Monday before', () => {
    expect(affirmationWeekStart(new Date('2026-10-25T23:59:59.999Z'))).toEqual(
      new Date('2026-10-19T00:00:00.000Z'),
    );
  });

  it('starts a Wednesday afternoon week on that Monday', () => {
    expect(affirmationWeekStart(new Date('2026-10-28T15:30:00.000Z'))).toEqual(
      new Date('2026-10-26T00:00:00.000Z'),
    );
  });
});

describe('pickAffirmation', () => {
  const texts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it("picks the line at the session's position in the week", () => {
    expect(pickAffirmation(texts, 2)).toBe('c');
  });

  it('wraps around after the last line', () => {
    expect(pickAffirmation(texts, 7)).toBe('a');
    expect(pickAffirmation(texts, 15)).toBe('b');
  });

  it('picks nothing from an empty list', () => {
    expect(pickAffirmation([], 0)).toBeNull();
  });
});

describe('parseAffirmationSet', () => {
  function lines(category: AffirmationCategory, count = 7): string[] {
    return Array.from({ length: count }, (_, index) => `You are ${category} legend ${index}`);
  }

  function fullSet(count = 7): Record<AffirmationCategory, string[]> {
    return {
      'skipped-whole-workout': lines('skipped-whole-workout', count),
      'skipped-whole-exercise': lines('skipped-whole-exercise', count),
      'skipped-sets': lines('skipped-sets', count),
      'fully-completed': lines('fully-completed', count),
      'fully-completed-with-improvements': lines('fully-completed-with-improvements', count),
      'fully-completed-with-improvements-on-every-exercise': lines(
        'fully-completed-with-improvements-on-every-exercise',
        count,
      ),
    };
  }

  function withCategory(category: AffirmationCategory, value: unknown): Record<string, unknown> {
    return { ...fullSet(), [category]: value };
  }

  const fifteenWords =
    'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';

  it('accepts a set with 7 valid lines in every category', () => {
    expect(parseAffirmationSet(fullSet())).toEqual(fullSet());
  });

  it('rejects a set with a category missing', () => {
    const withoutSkippedSets: Partial<Record<AffirmationCategory, string[]>> = fullSet();
    delete withoutSkippedSets['skipped-sets'];

    expect(parseAffirmationSet(withoutSkippedSets)).toBeNull();
  });

  it('rejects a set with a category that is not an array', () => {
    expect(parseAffirmationSet(withCategory('skipped-sets', 'You are great'))).toBeNull();
  });

  it('rejects a non-object answer', () => {
    expect(parseAffirmationSet(null)).toBeNull();
    expect(parseAffirmationSet('You are great')).toBeNull();
    expect(parseAffirmationSet([fullSet()])).toBeNull();
  });

  it('rejects a set where a category keeps only 6 valid lines', () => {
    const tooLong = [...lines('skipped-sets', 6), `${fifteenWords} sixteen`];

    expect(parseAffirmationSet(withCategory('skipped-sets', tooLong))).toBeNull();
  });

  it('keeps the first 7 of 8 lines', () => {
    const parsed = parseAffirmationSet(withCategory('skipped-sets', lines('skipped-sets', 8)));

    expect(parsed?.['skipped-sets']).toEqual(lines('skipped-sets', 7));
  });

  it('keeps a line of exactly 15 words and drops one of 16', () => {
    const parsed = parseAffirmationSet(
      withCategory('skipped-sets', [
        fifteenWords,
        `${fifteenWords} sixteen`,
        ...lines('skipped-sets', 6),
      ]),
    );

    expect(parsed?.['skipped-sets']).toEqual([fifteenWords, ...lines('skipped-sets', 6)]);
  });

  it('counts words by whitespace, so runs of spaces and an emoji do not miscount', () => {
    const spaced = 'You  are   cosmic 💪';
    const parsed = parseAffirmationSet(
      withCategory('skipped-sets', [spaced, ...lines('skipped-sets', 6)]),
    );

    expect(parsed?.['skipped-sets'][0]).toBe(spaced);
  });

  it('drops a line over 120 characters', () => {
    const long = `${'a'.repeat(60)} ${'b'.repeat(60)}`;
    const parsed = parseAffirmationSet(
      withCategory('skipped-sets', [long, ...lines('skipped-sets', 7)]),
    );

    expect(parsed?.['skipped-sets']).toEqual(lines('skipped-sets', 7));
  });

  it('drops a line with a line break', () => {
    const parsed = parseAffirmationSet(
      withCategory('skipped-sets', ['You are\nhuge', ...lines('skipped-sets', 7)]),
    );

    expect(parsed?.['skipped-sets']).toEqual(lines('skipped-sets', 7));
  });

  it('drops an empty line and a non-string item', () => {
    const parsed = parseAffirmationSet(
      withCategory('skipped-sets', ['   ', 42, null, ...lines('skipped-sets', 7)]),
    );

    expect(parsed?.['skipped-sets']).toEqual(lines('skipped-sets', 7));
  });

  it('drops a duplicate within a category', () => {
    const [first = '', ...others] = lines('skipped-sets', 7);
    const parsed = parseAffirmationSet(
      withCategory('skipped-sets', [first, ` ${first.toUpperCase()} `, ...others]),
    );

    expect(parsed?.['skipped-sets']).toEqual(lines('skipped-sets', 7));
  });

  it('drops a duplicate across categories, keeping the earlier category', () => {
    const borrowed = lines('skipped-whole-workout')[0] ?? '';
    const parsed = parseAffirmationSet(
      withCategory('fully-completed', [borrowed, ...lines('fully-completed', 7)]),
    );

    expect(parsed?.['skipped-whole-workout'][0]).toBe(borrowed);
    expect(parsed?.['fully-completed']).toEqual(lines('fully-completed', 7));
  });

  it('trims every line', () => {
    const parsed = parseAffirmationSet(
      withCategory(
        'skipped-sets',
        lines('skipped-sets').map((line) => `  ${line} `),
      ),
    );

    expect(parsed?.['skipped-sets']).toEqual(lines('skipped-sets'));
  });

  it('ignores extra keys', () => {
    expect(parseAffirmationSet({ ...fullSet(), bonus: ['You are great'] })).toEqual(fullSet());
  });
});
