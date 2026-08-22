// Optional high-recall moderation pass at ingest. The blocklist in filter.ts
// is a precise speed bump; this catches the categories a wordlist structurally
// cannot — self-harm encouragement, sexual content involving minors, threats,
// harassment. It uses OpenAI's free moderation endpoint when a key is present,
// and fails OPEN (allow) only for transient errors, never for a positive flag.
//
// Set MODERATION_API_KEY (an OpenAI API key) to enable. Without it, the field
// still runs on the blocklist + report-and-review, but enabling it is strongly
// recommended before a public launch.

const ENDPOINT = "https://api.openai.com/v1/moderations";

// Categories we hold for review rather than publish, if flagged.
const HARD_BLOCK = [
  "sexual/minors",
  "self-harm/intent",
  "self-harm/instructions",
  "violence/graphic",
  "harassment/threatening",
  "hate/threatening",
];

// "hold" = accept the write but keep it hidden pending review (fail-closed):
// used when the classifier is enabled but errors/times out, so a vendor
// outage cannot silently open the gate.
export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string; categories: string[] }
  | { ok: true; hold: true; reason: string };

export function moderationEnabled(): boolean {
  return Boolean(process.env.MODERATION_API_KEY);
}

export async function moderate(text: string): Promise<ModerationResult> {
  const key = process.env.MODERATION_API_KEY;
  if (!key) return { ok: true }; // disabled — blocklist + reports carry it

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
    for (const c of HARD_BLOCK) {
      if (cats[c]) flagged.push(c);
    }
    if (flagged.length > 0) {
      return { ok: false, reason: "content_rejected", categories: flagged };
    }
    return { ok: true };
  } catch {
    // enabled-but-unreachable → HOLD for review, never publish blind
    return { ok: true, hold: true, reason: "classifier_unreachable" };
  }
}
