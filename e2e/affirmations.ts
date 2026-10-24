import { execFileSync } from 'node:child_process';
import {
  affirmationCategories,
  type AffirmationCategory,
} from '@/features/fitness-tracker/domain/affirmation';

type SeededSet = Readonly<Record<AffirmationCategory, readonly string[]>>;

export const seededSet: SeededSet = Object.fromEntries(
  affirmationCategories.map((category) => [
    category,
    Array.from({ length: 7 }, (_, position) => `Seeded ${category} ${position}`),
  ]),
) as Record<AffirmationCategory, string[]>;

function executeLocally(command: string): void {
  execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'onestopshop',
      '--local',
      '--command',
      command,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

export function seedAffirmations(set: SeededSet): void {
  const generatedAt = Date.now();
  const rows = Object.entries(set).flatMap(([category, texts]) =>
    texts.map(
      (text, position) =>
        `('${crypto.randomUUID()}', '${category}', ${position}, '${text}', ${generatedAt})`,
    ),
  );
  executeLocally(
    `DELETE FROM affirmations; INSERT INTO affirmations (id, category, position, text, generated_at) VALUES ${rows.join(', ')};`,
  );
}

export function clearAffirmations(): void {
  executeLocally('DELETE FROM affirmations;');
}
