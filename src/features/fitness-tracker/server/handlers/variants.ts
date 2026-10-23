import 'server-only';
import type { FitnessRequestContext } from '../fitness-route';
import { readJson, readString, respond, respondEmpty } from '../http';
import { addVariant, removeVariant, renameVariant, switchSlotVariant } from '../variants';

export async function handleAddVariant({
  db,
  profileId,
  now,
  request,
  params,
}: FitnessRequestContext): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) {
    return respond(body);
  }
  const name = readString(body.value, 'name');
  if (!name.ok) {
    return respond(name);
  }
  return respond(await addVariant(db, profileId, params.id ?? '', { name: name.value }, now));
}

export async function handleRenameVariant({
  db,
  profileId,
  request,
  params,
}: FitnessRequestContext): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) {
    return respond(body);
  }
  const name = readString(body.value, 'name');
  if (!name.ok) {
    return respond(name);
  }
  return respond(
    await renameVariant(db, profileId, params.id ?? '', params.variantId ?? '', {
      name: name.value,
    }),
  );
}

export async function handleRemoveVariant({
  db,
  profileId,
  now,
  params,
}: FitnessRequestContext): Promise<Response> {
  return respond(await removeVariant(db, profileId, params.id ?? '', params.variantId ?? '', now));
}

export async function handleSwitchVariant({
  db,
  profileId,
  request,
  params,
}: FitnessRequestContext): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) {
    return respond(body);
  }
  const variantId = readString(body.value, 'variantId');
  if (!variantId.ok) {
    return respond(variantId);
  }
  return respondEmpty(
    await switchSlotVariant(db, profileId, params.id ?? '', params.slotId ?? '', {
      variantId: variantId.value,
    }),
  );
}
