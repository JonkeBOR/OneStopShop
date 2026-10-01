import { parseBodyweightInput } from '@/features/fitness-tracker/bodyweight';
import {
  appendBodyweightMeasurement,
  bodyweightStoreErrorMessage,
  listBodyweightMeasurements,
} from '@/features/fitness-tracker/bodyweight-store';
import { StoreMisconfiguredError, StoreUnavailableError } from '@/lib/server/collection';
import {
  ForbiddenAccessError,
  UnauthenticatedError,
  requireOwnerFromRequest,
} from '@/lib/server/current-user';
import { today } from '@/lib/server/today';
import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';

type ErrorBody = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly fields?: Readonly<Record<string, string>>;
  };
};

function errorResponse(
  status: number,
  code: string,
  message: string,
  fields?: Readonly<Record<string, string>>,
): Response {
  const body: ErrorBody = fields
    ? { error: { code, message, fields } }
    : { error: { code, message } };
  return Response.json(body, { status });
}

async function requireOwnerOrErrorResponse(request: Request): Promise<string | Response> {
  try {
    return await requireOwnerFromRequest(request);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }
    if (error instanceof ForbiddenAccessError) {
      return errorResponse(403, 'FORBIDDEN', 'This account is not allowed to use this app.');
    }
    throw error;
  }
}

function storeErrorResponse(error: unknown): Response {
  if (error instanceof StoreUnavailableError) {
    return errorResponse(502, 'STORE_UNAVAILABLE', bodyweightStoreErrorMessage(error));
  }
  if (error instanceof StoreMisconfiguredError) {
    return errorResponse(500, 'STORE_MISCONFIGURED', bodyweightStoreErrorMessage(error));
  }
  throw error;
}

export async function GET(request: Request): Promise<Response> {
  const owner = await requireOwnerOrErrorResponse(request);
  if (owner instanceof Response) {
    return owner;
  }

  try {
    const measurements = await listBodyweightMeasurements();
    return Response.json({ measurements }, { status: 200 });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwnerOrErrorResponse(request);
  if (owner instanceof Response) {
    return owner;
  }

  const body: unknown = await request.json().catch(() => null);
  const validation = parseBodyweightInput(body, today());
  if (!validation.ok) {
    return errorResponse(
      400,
      'INVALID_MEASUREMENT',
      fitnessTrackerStrings.errors.invalidMeasurement,
      validation.problems,
    );
  }

  try {
    const measurement = await appendBodyweightMeasurement(validation.value);
    return Response.json({ measurement }, { status: 201 });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
