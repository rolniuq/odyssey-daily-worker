/**
 * Generates a single Odyssey lesson (Markdown, Feynman style) from a
 * curriculum item, using the configured language model.
 *
 * The model returns structured JSON that must match the OdysseyDB content
 * schema (src/content.config.ts): order, title, coreConcept, docSource,
 * docTitle, difficulty, objectives, quiz[].
 */

import { chatComplete } from './model.ts';
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
2. Plain language first; the precise term only after an analogy. Aim it at a smart newcomer.
3. Order: analogy -> precise explanation -> "What this is NOT" (common misconceptions) -> "Why this matters".
4. Keep the page under ~8000 characters (a 10-minute read).
5. Small, honest diagrams only. Where a visual belongs, drop a marker like: {/* DIAGRAM: <what to animate> */}. Never claim you drew one.
6. Quiz: exactly 3-4 questions, each with exactly 4 options and exactly one correct answerIndex. The explanation field must teach WHY the answer is right, and where useful why a wrong pick fails.

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

const BODY_REQUIREMENTS = `The "body" is raw MDX markdown. It MUST end with these two sections, in order:
## What this is NOT
(common misconceptions — a short table or bullets)
## The diagram matters
(why the concept matters and what it unlocks next)
Insert {/* DIAGRAM: ... */} markers where an animated illustration would help.
Do not include the frontmatter in the body.`;

export interface GenerateOptions {
  token?: string;
  url?: string;
  model?: string;
  /** Don't call the model; return a canned lesson (for local dry-runs/tests). */
  mock?: boolean;
}

export async function generateLesson(
  item: CurriculumItem,
  opts: GenerateOptions = {}
): Promise<LessonContent> {
  if (opts.mock) return mockLesson(item);

  const out = await chatComplete(
    [
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
    ],
    { token: opts.token, url: opts.url, model: opts.model }
  );

  return parseLesson(out, item);
}

function parseLesson(raw: string, item: CurriculumItem): LessonContent {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Could not parse model JSON: ${(err as Error).message}`);
  }

  const objectives = toArray(parsed.objectives);
  const quiz = parseQuiz(parsed.quiz);

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
  for (const raw of v.slice(0, 4)) {
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

/** Strip a markdown fence if the model wrapped the JSON anyway. */
function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return raw.trim();
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
