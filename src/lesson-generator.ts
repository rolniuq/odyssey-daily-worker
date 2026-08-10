/**
 * Generates a single Odyssey lesson (Markdown, Feynman style) from a
 * curriculum item, using the configured language model.
 *
 * The model returns structured JSON that must match the OdysseyDB content
 * schema (src/content.config.ts): order, title, coreConcept, docSource,
 * docTitle, difficulty, objectives, quiz[].
 */

import { chatComplete, type ChatMessage } from './model.ts';
import type { CurriculumItem } from './curriculum.ts';

export interface LessonQuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface LessonContent {
  order: number;
  title: string;
  coreConcept: string;
  docSource: string;
  docTitle: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  objectives: string[];
  quiz: LessonQuizQuestion[];
  /** Markdown/MDX body: Feynman explainer, What-this-is-NOT, Why-this-matters. */
  body: string;
}

const SYSTEM_PROMPT = `You are a patient, precise teacher of PostgreSQL. You teach exactly ONE concept per lesson using the Feynman technique.

Rules you MUST follow:
1. Teach ONE concept (the coreConcept). Never cram a second idea into one page.
2. Plain language first; the precise term only after an analogy. Aim it at a smart newcomer, but never be vague — every analogy must be followed by the exact PostgreSQL terminology.
3. Order the body exactly as:
   a) Analogy (3-8 sentences building ONE strong mental model)
   b) "## The precise version" — the exact definition in correct PostgreSQL terms (server process, roles, connection string, data types, MVCC, catalog, etc.), written crisply
   c) A hands-on walkthrough: real commands AND their expected output, in triple-backtick sql / bash blocks
   d) "## What this is NOT" — common misconceptions, ideally as a table
   e) "## The diagram matters" — why the concept matters and what it unlocks next
   f) A final "## Read the official docs" line that links to the official documentation
4. Body length between 4,000 and 7,500 characters (a focused 10-minute read). Never under 3,000 — a page that thin means you skipped an explanation.
5. Precision over gloss. Use the exact technical term and define it (say "the postgres server process manages one or more databases inside a single cluster" — never "carves out space on your hard drive"). Check spelling and grammar; no typos.
6. Small, honest diagrams only. Where a visual belongs, drop a marker like: {/* DIAGRAM: <what to animate> */}. Never claim you drew one.
7. Quiz: exactly 6 questions, exactly ONE per body section, in the same order the sections appear in the body:
   1) the opening analogy,
   2) "## The precise version",
   3) the hands-on walkthrough,
   4) "## What this is NOT",
   5) "## The diagram matters",
   6) the "## Read the official docs" section.
   Each question must check understanding of ITS OWN section only, so it cannot be answered without having read that section. Each has exactly 4 options and exactly one correct answerIndex. The explanation must teach WHY the answer is right, and where useful why a wrong pick fails.
8. Always include the official doc title and URL (from the "item" you are given) inside the body's final section.

Reply ONLY with a single JSON object. No markdown fences around it, no extra prose. Shape:
{
  "title": "string",
  "coreConcept": "one sentence, the single concept",
  "objectives": ["string", "string"],
  "difficulty": "beginner|intermediate|advanced",
  "quiz": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answerIndex": 0,
      "explanation": "string"
    }
  ],
  "body": "MDX markdown"
}`;

const BODY_REQUIREMENTS = `The "body" is raw MDX markdown and must contain, in this order:
1. The analogy (no heading needed — start the body with it).
2. "## The precise version"
3. The hands-on walkthrough with real commands and their expected output.
4. "## What this is NOT" (a table is best)
5. "## The diagram matters"
6. "## Read the official docs" with a real markdown link to the official documentation URL you were given.
Insert {/* DIAGRAM: ... */} markers where an animated illustration would help. Do not include the frontmatter in the body. Write 4,000-7,500 characters. Be precise and grammatically clean.

The "quiz" array MUST contain exactly 6 questions, one per body section, in body order (analogy, precise version, walkthrough, what-this-is-NOT, diagram matters, official docs). The page is meant to be studied slowly — each question forces the reader to re-read one section, so never skip a section in the quiz.`;

export interface GenerateOptions {
  token?: string;
  url?: string;
  model?: string;
  /** How many times to retry the model when it returns unparseable output. */
  maxAttempts?: number;
  /** Don't call the model; return a canned lesson (for local dry-runs/tests). */
  mock?: boolean;
}

export async function generateLesson(
  item: CurriculumItem,
  opts: GenerateOptions = {}
): Promise<LessonContent> {
  if (opts.mock) return mockLesson(item);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Create a lesson from this item:`,
        `- order: ${item.order}`,
        `- working title: ${item.title}`,
        `- official doc title: ${item.docTitle}`,
        `- official doc URL: ${item.docSource}`,
        `- planned difficulty: ${item.difficulty}`,
        '',
        BODY_REQUIREMENTS,
      ].join('\n'),
    },
  ] satisfies ChatMessage[];

  // Models occasionally mishandle one structured response; retry a few times
  // before giving up for the day.
  const attempts = opts.maxAttempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const out = await chatComplete(messages, {
        token: opts.token,
        url: opts.url,
        model: opts.model,
      });
      return parseLesson(out, item);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function parseLesson(raw: string, item: CurriculumItem): LessonContent {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Could not parse model JSON: ${(err as Error).message}. Raw start: ${raw.slice(0, 300)}`
    );
  }

  const objectives = toArray(parsed.objectives);
  const quiz = parseQuiz(parsed.quiz);
  if (quiz.length < 6) {
    throw new Error(
      `Model returned ${quiz.length}/6 quiz questions (need one per body section) — retrying.`
    );
  }

  return {
    order: item.order,
    title: str(parsed.title) || item.title,
    coreConcept: str(parsed.coreConcept) || item.title,
    docSource: item.docSource,
    docTitle: item.docTitle,
    difficulty: normDifficulty(parsed.difficulty, item.difficulty),
    objectives: objectives.length ? objectives : [`Explain ${item.title} in your own words`],
    quiz,
    body: toStr(parsed.body),
  };
}

function parseQuiz(v: unknown): LessonQuizQuestion[] {
  if (!Array.isArray(v)) return [];
  const out: LessonQuizQuestion[] = [];
  for (const raw of v.slice(0, 6)) {
    const q = raw as Record<string, unknown>;
    if (typeof q?.question !== 'string' || !Array.isArray(q.options)) continue;
    const options = toArray(q.options);
    if (options.length < 2) continue;
    const idx = Number(q.answerIndex);
    const answerIndex = Number.isFinite(idx) ? Math.max(0, Math.min(options.length - 1, idx)) : 0;
    out.push({
      question: q.question,
      options,
      answerIndex,
      explanation: toStr(q.explanation),
    });
  }
  return out;
}

/**
 * Extract a JSON payload from the model's reply. The lesson body legitimately
 * contains code fences (```sql), so first try the raw text as-is — only strip
 * an outer markdown fence when the raw text isn't already valid JSON.
 */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Not raw JSON — maybe wrapped in a fence.
  }

  const open = trimmed.indexOf('```');
  if (open === -1) return trimmed;

  const rest = trimmed.slice(open + 3);
  const newline = rest.indexOf('\n');
  const start = newline === -1 ? open + 3 : open + 3 + newline + 1;

  let body = trimmed.slice(start);
  // The lesson body may contain its own fences, so the outer fence is the LAST one.
  const lastClose = trimmed.lastIndexOf('```');
  if (lastClose !== -1 && lastClose - open > 3) body = body.slice(0, lastClose - start);

  // Content on the opener line starts with a language tag (```bash {...}).
  if (newline === -1) body = body.replace(/^[A-Za-z0-9_-]+\s*/, '');
  return body.trim();
}

/** Render a LessonContent as an `.mdx` file. Frontmatter is valid YAML. */
export function renderLesson(c: LessonContent): string {
  const block = (v: unknown) => JSON.stringify(v);
  const quizBlock = c.quiz
    .map(
      (q) =>
        `  { "question": ${block(q.question)},\n    "options": ${block(q.options)},\n    "answerIndex": ${q.answerIndex},\n    "explanation": ${block(q.explanation)} }`
    )
    .join(',\n');

  const frontmatter = `{
  "order": ${c.order},
  "title": ${block(c.title)},
  "coreConcept": ${block(c.coreConcept)},
  "docSource": ${block(c.docSource)},
  "docTitle": ${block(c.docTitle)},
  "difficulty": ${block(c.difficulty)},
  "objectives": ${block(c.objectives)},
  "quiz": [
${quizBlock}
  ]
}`;

  return `---\n${frontmatter}\n---\n\n${c.body.trimEnd()}\n`;
}

// ——— small helpers ———

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

function normDifficulty(
  v: unknown,
  fallback: CurriculumItem['difficulty']
): LessonContent['difficulty'] {
  const s = toStr(v).toLowerCase();
  return s === 'beginner' || s === 'intermediate' || s === 'advanced' ? s : fallback;
}

function mockLesson(item: CurriculumItem): LessonContent {
  return {
    order: item.order,
    title: item.title,
    coreConcept: `${item.title}, taught with one analogy and one precise definition.`,
    docSource: item.docSource,
    docTitle: item.docTitle,
    difficulty: item.difficulty,
    objectives: [`Explain ${item.title} in your own words`],
    quiz: [
      {
        question: `Which best describes how "${item.title}" is taught on this page?`,
        options: [
          'One concept, via analogy -> precision -> what-it-is-NOT',
          'A list of every PostgreSQL feature',
          'A speed-run to finish fast',
          'Copy-pasted reference text',
        ],
        answerIndex: 0,
        explanation:
          'Every OdysseyDB page teaches exactly one concept, deep (Feynman style). The other options violate the one-logic-per-page rule.',
      },
    ],
    body: `{/* DIAGRAM: animate the mechanism behind ${item.title} */}

## ${item.title}

This is the mock lesson body, produced when the worker runs without a live model (dry-run).

## What this is NOT

- This is not every PostgreSQL feature at once.
- This is not a speed lesson.

## The diagram matters

A real run with model credentials replaces this body with the full Feynman lesson. See
[${item.docTitle}](${item.docSource}) for the official source.
`,
  };
}
