import { describe, expect, it } from 'vitest';
import { affirmationCategories, affirmationWeekStart, pickAffirmation } from './affirmation';

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
