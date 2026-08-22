// Ingest filter for lantern messages. The database function enforces
// structural limits (length, links, rate); this layer catches content the
// SQL can't reasonably hold. Plain-text only — rendering always escapes.

const URL_PATTERN =
  /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|xyz|ru|cn|info|biz|link|click|app|dev|ai|co|gg|me|top|site|online)\b)/i;

// Deliberately short, high-precision list: unambiguous slurs and abuse
// terms only. Broader moderation happens via reports + review, so this
// list errs toward precision over recall.
const BLOCKED = [
  "nigger", "nigga", "faggot", "kike", "spic", "chink", "wetback",
  "tranny", "raghead", "beaner",
  "kill yourself", "kys",
  "child porn", "csam", "loli sex", "cp links",
  "heil hitler", "gas the",
];

const CONTROL_CHARS =
  /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

export type FilterResult = { ok: true; message: string } | { ok: false; reason: string };

export function filterMessage(raw: unknown): FilterResult {
  if (typeof raw !== "string") return { ok: false, reason: "message_required" };
  const message = raw.replace(/\s+/g, " ").trim();
  if (message.length < 1) return { ok: false, reason: "message_required" };
  if (message.length > 280) return { ok: false, reason: "message_too_long" };
  if (CONTROL_CHARS.test(message)) return { ok: false, reason: "invalid_characters" };
  if (URL_PATTERN.test(message)) return { ok: false, reason: "no_links_allowed" };
  const lower = message.toLowerCase();
  for (const term of BLOCKED) {
    if (lower.includes(term)) return { ok: false, reason: "content_rejected" };
  }
  return { ok: true, message };
}

export function sanitizeModel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const model = raw.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!model) return null;
  if (URL_PATTERN.test(model) || CONTROL_CHARS.test(model)) return null;
  return model;
}
