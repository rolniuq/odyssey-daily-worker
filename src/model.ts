/**
 * Tiny model client.
 *
 * Talks to any OpenAI-compatible `/chat/completions` endpoint:
 *  - Google Gemini (default): free tier, no credit card. Grab a free key from
 *    Google AI Studio and set `GEMINI_API_KEY`.
 *  - OpenAI: set `OPENAI_API_KEY` (or point `MODEL_URL` elsewhere).
 *
 * Model name overridable via `MODEL`.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelOptions {
  /** Override the endpoint. */
  url?: string;
  /** Override the token. Defaults to the provider's key. */
  token?: string;
  /** Override the model id. */
  model?: string;
}

export function resolveEndpoint(opts: ModelOptions = {}) {
  if (opts.url) return { url: opts.url, token: opts.token ?? '' };

  if (process.env.OPENAI_API_KEY) {
    return {
      url: process.env.MODEL_URL || 'https://api.openai.com/v1/chat/completions',
      token: process.env.OPENAI_API_KEY,
    };
  }

  return {
    url:
      process.env.MODEL_URL ||
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    token: opts.token || process.env.GEMINI_API_KEY || '',
  };
}

export function defaultModel(opts: ModelOptions = {}) {
  return opts.model || process.env.MODEL || 'gemini-3.5-flash';
}

/**
 * Call the chat-completions endpoint and return the assistant's reply text.
 * Throws a clear error if no credentials or a non-2xx response arrives.
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts: ModelOptions = {}
): Promise<string> {
  const { url, token } = resolveEndpoint(opts);
  if (!token) {
    throw new Error(
      'No model token available. Set GEMINI_API_KEY (Google AI Studio, free) or OPENAI_API_KEY (OpenAI).'
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: defaultModel(opts),
      messages,
      temperature: 0.4,
      // Lessons are long (MDX body + quiz); keep the ceiling high so the
      // response isn't truncated mid-JSON.
      max_tokens: 8192,
      // Request JSON so we can reliably parse the structured lesson.
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Model request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Model returned no content.');
  return content;
}
