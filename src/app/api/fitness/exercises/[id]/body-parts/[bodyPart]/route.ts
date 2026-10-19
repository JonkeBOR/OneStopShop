import { fitnessRoute } from '@/features/fitness-tracker/server/fitness-route';
import {
  handleLinkBodyPart,
  handleUnlinkBodyPart,
} from '@/features/fitness-tracker/server/handlers/exercises';

export const PUT = fitnessRoute(handleLinkBodyPart);
export const DELETE = fitnessRoute(handleUnlinkBodyPart);
