import { appStrings } from './strings/app';

export type Feature = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly href: string;
};

export const features: readonly Feature[] = [
  {
    id: 'fitness-tracker',
    name: appStrings.fitnessTrackerFeature.name,
    description: appStrings.fitnessTrackerFeature.description,
    href: '/fitness-tracker',
  },
];
