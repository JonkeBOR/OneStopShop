import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createDatabase, type Database } from './create-database';

export { createDatabase, type Database };

export function getDatabase(): Database {
  return createDatabase(getCloudflareContext().env.DB);
}
