import { describe, expect, it } from 'vitest';
import { affirmationCategories } from './affirmation';

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
