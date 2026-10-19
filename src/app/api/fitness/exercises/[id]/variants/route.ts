import { fitnessRoute } from '@/features/fitness-tracker/server/fitness-route';
import { handleAddVariant } from '@/features/fitness-tracker/server/handlers/variants';

export const POST = fitnessRoute(handleAddVariant);
