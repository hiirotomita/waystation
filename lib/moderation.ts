// Two-layer moderation:
//   1. A LOCAL high-recall heuristic that ALWAYS runs (no key needed) — phrase
//      families for self-harm encouragement, threats, and minor-sexualization
//      that a flat wordlist can't cover.
//   2. An optional external classifier (OpenAI moderation) for broader recall.
//      When a key is set but the vendor is unreachable, we HOLD (fail closed).
//
// Set MODERATION_API_KEY (an OpenAI key) to enable layer 2. When it is absent
// the site still has layer 1 plus report-and-review, and it says so loudly
// (an alert on first use, and a flag surfaced on /admin).

const ENDPOINT = "https://api.openai.com/v1/moderations";

const HARD_BLOCK = [
  "sexual/minors",
  "self-harm/intent",
  "self-harm/instructions",
  "violence/graphic",
  "harassment/threatening",
  "hate/threatening",
];

// Layer 1 — local phrase families. Case-insensitive, matched on normalized
// text. High precision on the worst categories; not exhaustive by design.
const LOCAL_PATTERNS: RegExp[] = [
  // self-harm encouragement directed at the reader
  /\b(kill|hang|neck|off)\s+your\s?self\b/i,
  /\b(end|take)\s+your\s+(own\s+)?life\b/i,
  /\byou\s+should\s+(die|kill\s+yourself|end\s+it)\b/i,
  /\bnobody\s+would\s+miss\s+you\b/i,
  /\bgo\s+(die|kys|hang)\b/i,
  /\bunalive\s+your\s?self\b/i,
  /\bslit\s+your\s+(wrists|throat)\b/i,
  // threats
  /\bi(\s?'?ll| will)\s+(kill|hurt|find|end|rape|beat)\s+you\b/i,
  /\byou(\s?'?re| are)\s+(dead|going to die)\b/i,
  /\bi\s+know\s+where\s+you\s+live\b/i,
  // minor sexualization signals (paired age + body/act context)
  /\b(she|he|they|kid|girl|boy)\s+(is|was)\s+(only\s+)?(\d|1[0-5])\b.*\b(sex|naked|body|touch|bed)\b/i,
  /\b(1[0-5]|[0-9])\s*(yo|y\/o|year\s*old)\b.*\b(sex|naked|nude|hot|touch)\b/i,
];

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string; categories: string[] }
  | { ok: true; hold: true; reason: string };

export function moderationEnabled(): boolean {
  return Boolean(process.env.MODERATION_API_KEY);
}

function localFlag(text: string): boolean {
  return LOCAL_PATTERNS.some((re) => re.test(text));
}

export async function moderate(text: string): Promise<ModerationResult> {
  // Layer 1 — always on.
  if (localFlag(text)) {
    return { ok: false, reason: "content_rejected", categories: ["local"] };
  }

  const key = process.env.MODERATION_API_KEY;
  if (!key) {
    // Fail CLOSED when the classifier is unconfigured: accept the write but
    // HOLD it hidden for review, rather than publishing on the wordlist alone.
    // Set MODERATION_API_KEY (free OpenAI moderation) to publish immediately.
    return { ok: true, hold: true, reason: "classifier_off" };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: true, hold: true, reason: `classifier_${res.status}` };
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return { ok: true, hold: true, reason: "classifier_empty" };

    const flagged: string[] = [];
    const cats = result.categories ?? {};
    for (const c of HARD_BLOCK) if (cats[c]) flagged.push(c);
    if (flagged.length > 0) {
      return { ok: false, reason: "content_rejected", categories: flagged };
    }
    return { ok: true };
  } catch {
    return { ok: true, hold: true, reason: "classifier_unreachable" };
  }
}
