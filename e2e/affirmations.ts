import { execFileSync } from 'node:child_process';
import {
  affirmationCategories,
  type AffirmationCategory,
} from '@/features/fitness-tracker/domain/affirmation';

type SeededSet = Readonly<Record<AffirmationCategory, readonly string[]>>;

export type StoredAffirmation = {
  id: string;
  category: string;
  position: number;
  text: string;
  generated_at: number;
};

export const seededSet: SeededSet = Object.fromEntries(
  affirmationCategories.map((category) => [
    category,
    Array.from({ length: 7 }, (_, position) => `Seeded ${category} ${position}`),
  ]),
) as Record<AffirmationCategory, string[]>;

function executeLocally(command: string): string {
  return execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'onestopshop',
      '--local',
      '--json',
      '--command',
      command,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' },
  );
}

function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

export function replaceAffirmations(rows: readonly StoredAffirmation[]): void {
  const values = rows.map(
    (row) =>
      `(${quoted(row.id)}, ${quoted(row.category)}, ${row.position}, ${quoted(row.text)}, ${row.generated_at})`,
  );
  const insert =
    values.length === 0
      ? ''
      : ` INSERT INTO affirmations (id, category, position, text, generated_at) VALUES ${values.join(', ')};`;
  executeLocally(`DELETE FROM affirmations;${insert}`);
}

export function storedAffirmations(): StoredAffirmation[] {
  const [result] = JSON.parse(
    executeLocally('SELECT id, category, position, text, generated_at FROM affirmations'),
  ) as [{ results: StoredAffirmation[] }];
  return result.results;
}

export function seedAffirmations(set: SeededSet): void {
  const generatedAt = Date.now();
  replaceAffirmations(
    Object.entries(set).flatMap(([category, texts]) =>
      texts.map((text, position) => ({
        id: crypto.randomUUID(),
        category,
        position,
        text,
        generated_at: generatedAt,
      })),
    ),
  );
}

export function clearAffirmations(): void {
  replaceAffirmations([]);
}
