import { fitnessRoute } from '@/features/fitness-tracker/server/fitness-route';
import { handleRemoveVariant } from '@/features/fitness-tracker/server/handlers/variants';

export const DELETE = fitnessRoute(handleRemoveVariant);
