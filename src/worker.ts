/**
 * OdysseyDB daily worker.
 *
 * Each (day | dispatch) it:
 *   1. reads the next curriculum index from progress.json
 *   2. generates that lesson (Feynman-style MDX) via the configured model
 *   3. writes the lesson into the OdysseyDB content folder
 *   4. advances progress.json so the next run teaches the following concept
 *
 * Run locally:
 *   bun run worker --mock            # dry-run, no model needed
 *   bun run worker --order 3          # force a specific lesson
 *   bun run worker                    # real run (needs GITHUB_TOKEN / OPENAI_API_KEY)
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curriculumFor } from './curriculum.ts';
import { generateLesson, renderLesson } from './lesson-generator.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

// Where the Odyssey lesson .mdx files live. Override with ODYSSEY_LESSONS_DIR.
const LESSONS_DIR = resolve(
  process.env.ODYSSEY_LESSONS_DIR || join(HERE, '..', '..', 'odyssey', 'src', 'content', 'lessons')
);

const PROGRESS_FILE = join(HERE, '..', 'progress.json');

interface ProgressState {
  nextOrder: number;
  updatedAt: string;
  history: Array<{ order: number; slug: string; at: string }>;
}

async function loadProgress(): Promise<ProgressState> {
  try {
    const raw = await readFile(PROGRESS_FILE, 'utf8');
    return JSON.parse(raw) as ProgressState;
  } catch {
    return { nextOrder: 2, updatedAt: '', history: [] };
  }
}

async function saveProgress(state: ProgressState): Promise<void> {
  await writeFile(PROGRESS_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function parseArgs(argv: string[]) {
  const args = { mock: false, order: null as number | null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mock') args.mock = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--order') args.order = Number(argv[i + 1]);
  }
  return args;
}

const Pad = (n: number) => String(n).padStart(2, '0');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const progress = await loadProgress();

  const order = args.order ?? progress.nextOrder;
  const item = curriculumFor(order);

  if (!item) {
    console.log(`No curriculum item for order ${order}. Curriculum complete.`);
    return;
  }

  console.log(`[odyssey-worker] teaching lesson ${order}: ${item.title}`);

  const lesson = await generateLesson(item, { mock: args.mock });
  const fileName = `${Pad(item.order)}-${item.slug}.mdx`;
  const filePath = join(LESSONS_DIR, fileName);

  if (args.dryRun) {
    console.log(`[dry-run] would write -> ${filePath}`);
    console.log(renderLesson(lesson));
    return;
  }

  await mkdir(LESSONS_DIR, { recursive: true });
  await writeFile(filePath, renderLesson(lesson), 'utf8');
  console.log(`[od] wrote ${filePath}`);

  if (args.order === null) {
    progress.nextOrder = order + 1;
    progress.updatedAt = new Date().toISOString();
    progress.history.push({ order, slug: item.slug, at: new Date().toISOString() });
    await saveProgress(progress);
    console.log(`[od] progress advanced to order ${progress.nextOrder}`);
  }
}

main().catch((err) => {
  console.error('[od] worker failed:', err);
  process.exitCode = 1;
});
