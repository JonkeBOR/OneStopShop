import { fitnessRoute } from '@/features/fitness-tracker/server/fitness-route';
import {
  handleRemoveVariant,
  handleRenameVariant,
} from '@/features/fitness-tracker/server/handlers/variants';

export const PATCH = fitnessRoute(handleRenameVariant);
export const DELETE = fitnessRoute(handleRemoveVariant);
