import { describe, expect, test } from 'vitest';
import { features } from './features';

describe('features', () => {
  test('holds exactly one entry whose href is /fitness-tracker', () => {
    expect(features).toHaveLength(1);
    expect(features[0]?.href).toBe('/fitness-tracker');
  });

  test('every entry has a non-empty id, name, description and a relative href', () => {
    for (const feature of features) {
      expect(feature.id.length).toBeGreaterThan(0);
      expect(feature.name.length).toBeGreaterThan(0);
      expect(feature.description.length).toBeGreaterThan(0);
      expect(feature.href.startsWith('/')).toBe(true);
    }
  });
});
