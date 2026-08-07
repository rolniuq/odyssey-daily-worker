# Odyssey Daily Worker

A small daily GitHub worker that **creates the next OdysseyDB lesson** (Feynman-style, sourced from
the official PostgreSQL docs) and **pushes it to the Odyssey site repo** — automatically, one
concept per day, by design (learn deep, not fast).

## What it does

1. Reads the curriculum index from `progress.json` (next lesson number).
2. Calls a language model to write that lesson as an `.mdx` file — Feynman explainer (analogy →
   precision → "what it is NOT") plus a teaching quiz.
3. Writes it into the Odyssey content folder: `src/content/lessons/<NN>-<slug>.mdx`
4. Advances `progress.json` so tomorrow teaches the next concept.
5. (In CI) runs the Odyssey quality gates and pushes to the site repo.

The curriculum lives in `src/curriculum.ts` — one ordered PostgreSQL doc per lesson, exactly
matching the "one logic per page" rule.

## Layout

```text
src/
  curriculum.ts        # ordered list of docs → lessons (the roadmap)
  lesson-generator.ts  # builds the Feynman lesson via the model (JSON → .mdx)
  model.ts             # OpenAI-compatible chat client (GitHub Models default)
  worker.ts            # main: pick next → generate → write → advance progress
progress.json          # pointer to the next lesson to teach
.github/workflows/daily.yml  # nightly CI job
```

## Run locally

```sh
bun install

# 1) Safe dry-run — prints the lesson, writes nothing, no API key needed
bun run worker --mock --dry-run

# 2) Write the next lesson as real content, using a canned (mock) lesson
bun run worker --mock

# 3) Force a specific lesson
bun run worker --order 5 --mock

# 4) Real AI-generated lesson (needs a model token)
bun run worker                    # uses GITHUB_TOKEN / GH_TOKEN (GitHub Models)
# or
OPENAI_API_KEY=sk-... bun run worker --order 3
```

Set `ODYSSEY_LESSONS_DIR` to point at the live site if it isn't the sibling
`../odyssey/src/content/lessons`.

## Model credentials

- **GitHub AI Models (recommended, no extra key):** set `GH_TOKEN` or `GITHUB_TOKEN`.
- **OpenAI:** set `OPENAI_API_KEY`. Uses `gpt-4o-mini` by default.
- Override endpoint/model with `MODEL_URL` / `MODEL`.

## Nightly automation (GitHub Actions)

`.github/workflows/daily.yml` runs on a cron (default 01:00 UTC) and on `workflow_dispatch`:

1. Checks out this worker repo, installs deps with Bun.
2. Uses `GH_TOKEN: ${{ github.token }}` to call the model.
3. Clones the site (`rolniuq/odyssey`), generates the lesson there.
4. Runs the site gates (`bun run check` + `bun run build`); **only pushes if they pass**.
5. Commits the new lesson and pushes to `main`.

To enable pushing to the site repo from a different workflow, add a repository **secret** named
`ODYSSEY_PUSH_TOKEN` on **this** worker repo — a PAT or GitHub App token with `Contents: write` on
the site repo. Without it, the job can generate but not push.

## Idempotence & safety

- `progress.json` is the single source of truth for the next lesson.
- `--order` lets you re-run or skip without touching progress.
- Gates run before pushing; a failing lesson does **not** ship.

## House style

TypeScript + Bun. Format with Prettier (`bun run format`), check with `bun run check`
(`tsc --noEmit`). The generated `.mdx` uses JSON-as-YAML frontmatter so the site's schema validation
always sees clean, parseable content.
