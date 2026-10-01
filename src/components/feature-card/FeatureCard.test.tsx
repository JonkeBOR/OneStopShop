import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { FeatureCard } from './FeatureCard';

test('renders a real anchor to the feature href, with its name and description', () => {
  render(
    <FeatureCard
      feature={{
        id: 'fitness-tracker',
        name: 'Fitness Tracker',
        description: 'Log a bodyweight measurement and see your history.',
        href: '/fitness-tracker',
      }}
    />,
  );

  const link = screen.getByRole('link', { name: /Fitness Tracker/ });
  expect(link.tagName).toBe('A');
  expect(link.getAttribute('href')).toBe('/fitness-tracker');
  expect(screen.getByText('Log a bodyweight measurement and see your history.')).toBeDefined();
});
