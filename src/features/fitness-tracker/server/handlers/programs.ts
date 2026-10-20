import 'server-only';
import { fail, succeed } from '../../domain/result';
import type { FitnessRequestContext } from '../fitness-route';
import {
  hasKey,
  readJson,
  readNullableString,
  readNumber,
  readString,
  respond,
  respondEmpty,
  respondWith,
} from '../http';
import {
  addTrainingBlock,
  addWorkout,
  createProgram,
  deleteProgram,
  getProgram,
  labelTrainingBlock,
  moveWorkout,
  removeTrainingBlock,
  removeWorkout,
  renameProgram,
  renameWorkout,
} from '../programs';

const defaultBlockCount = 1;

function idParam(context: FitnessRequestContext): string {
  return context.params.id ?? '';
}

export async function handleCreateProgram({
  db,
  profileId,
  now,
  request,
}: FitnessRequestContext): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) {
    return respond(body);
  }
  const name = readString(body.value, 'name');
  const blockCount = hasKey(body.value, 'blockCount')
    ? readNumber(body.value, 'blockCount')
    : succeed(defaultBlockCount);
  if (!name.ok) {
    return respond(name);
  }
  if (!blockCount.ok) {
    return respond(blockCount);
  }
  return respondWith(
    await createProgram(db, profileId, { name: name.value, blockCount: blockCount.value }, now),
    (program) => ({ id: program.id }),
  );
}

export async function handleRenameProgram(context: FitnessRequestContext): Promise<Response> {
  const body = await readJson(context.request);
  if (!body.ok) {
    return respond(body);
  }
  const name = readString(body.value, 'name');
  if (!name.ok) {
    return respond(name);
  }
  return respondEmpty(
    await renameProgram(context.db, context.profileId, idParam(context), { name: name.value }),
  );
}

export async function handleDeleteProgram(context: FitnessRequestContext): Promise<Response> {
  const { db, profileId, now } = context;
  const program = await getProgram(db, profileId, idParam(context));
  if (!program.ok) {
    return respond(program);
  }
  if (program.value.isActive) {
    return respond(fail('program-active'));
  }
  return respondEmpty(await deleteProgram(db, profileId, program.value.id, now));
}

export async function handleAddBlock(context: FitnessRequestContext): Promise<Response> {
  return respondEmpty(await addTrainingBlock(context.db, context.profileId, idParam(context), {}));
}

export async function handleLabelBlock(context: FitnessRequestContext): Promise<Response> {
  const body = await readJson(context.request);
  if (!body.ok) {
    return respond(body);
  }
  const label = readNullableString(body.value, 'label');
  if (!label.ok) {
    return respond(label);
  }
  return respondEmpty(
    await labelTrainingBlock(context.db, context.profileId, idParam(context), {
      label: label.value,
    }),
  );
}

export async function handleRemoveBlock(context: FitnessRequestContext): Promise<Response> {
  return respondEmpty(
    await removeTrainingBlock(context.db, context.profileId, idParam(context), context.now),
  );
}

export async function handleAddWorkout(context: FitnessRequestContext): Promise<Response> {
  const body = await readJson(context.request);
  if (!body.ok) {
    return respond(body);
  }
  const name = readString(body.value, 'name');
  if (!name.ok) {
    return respond(name);
  }
  return respondWith(
    await addWorkout(context.db, context.profileId, idParam(context), { name: name.value }),
    (program) => ({ id: program.workouts[program.workouts.length - 1]?.id ?? '' }),
  );
}

export async function handleUpdateWorkout(context: FitnessRequestContext): Promise<Response> {
  const body = await readJson(context.request);
  if (!body.ok) {
    return respond(body);
  }
  const { db, profileId } = context;
  if (hasKey(body.value, 'name')) {
    const name = readString(body.value, 'name');
    return name.ok
      ? respondEmpty(await renameWorkout(db, profileId, idParam(context), { name: name.value }))
      : respond(name);
  }
  if (hasKey(body.value, 'toPosition')) {
    const toPosition = readNumber(body.value, 'toPosition');
    return toPosition.ok
      ? respondEmpty(
          await moveWorkout(db, profileId, idParam(context), { toPosition: toPosition.value }),
        )
      : respond(toPosition);
  }
  return respond(fail('invalid-body'));
}

export async function handleRemoveWorkout(context: FitnessRequestContext): Promise<Response> {
  return respondEmpty(
    await removeWorkout(context.db, context.profileId, idParam(context), context.now),
  );
}
