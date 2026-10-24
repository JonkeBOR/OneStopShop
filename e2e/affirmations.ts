import { execFileSync } from 'node:child_process';

type Category =
  | 'skipped-whole-workout'
  | 'skipped-whole-exercise'
  | 'skipped-sets'
  | 'fully-completed'
  | 'fully-completed-with-improvements'
  | 'fully-completed-with-improvements-on-every-exercise';

type SeededSet = Readonly<Record<Category, readonly string[]>>;

function seededLines(category: Category): string[] {
  return Array.from({ length: 7 }, (_, position) => `Seeded ${category} ${position}`);
}

export const seededSet: SeededSet = {
  'skipped-whole-workout': seededLines('skipped-whole-workout'),
  'skipped-whole-exercise': seededLines('skipped-whole-exercise'),
  'skipped-sets': seededLines('skipped-sets'),
  'fully-completed': seededLines('fully-completed'),
  'fully-completed-with-improvements': seededLines('fully-completed-with-improvements'),
  'fully-completed-with-improvements-on-every-exercise': seededLines(
    'fully-completed-with-improvements-on-every-exercise',
  ),
};

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
