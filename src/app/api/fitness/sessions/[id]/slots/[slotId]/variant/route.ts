import { fitnessRoute } from '@/features/fitness-tracker/server/fitness-route';
import { handleSwitchVariant } from '@/features/fitness-tracker/server/handlers/variants';

export const PUT = fitnessRoute(handleSwitchVariant);
