// Ingest filter for lantern messages, model names, and patron names.
//
// This is a fast, high-precision speed bump — NOT the whole safety layer.
// High-recall moderation (self-harm, minors, threats, doxx) comes from the
// optional classifier in lib/moderation.ts plus report-and-review. Here we
// normalize aggressively so evasion (leet, homoglyphs, separators) is folded
// away, then match on word boundaries so "spicy" and "suspicious" survive.

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Any token that looks like a domain (any TLD) or URL — an allowlist of TLDs
// let bit.ly / goo.gl / *.zip through, so we reject broadly instead.
const LINK_RE =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,24}\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\[[0-9a-f:]+\])/i;

// Control, zero-width, and bidi-override characters.
const CONTROL_RE =
  /[\u0001-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

// Unambiguous slurs / illegal-content markers, matched with strict word
// boundaries so short ones never fire inside ordinary words. Dictionary words
// that are only slurs in context (e.g. "chink") are deliberately NOT here —
// the classifier and reports carry those, so idioms like "a chink in the
// armor" aren't rejected. This list is a precise speed bump, not the ceiling.
const BLOCKED = [
  "nigger", "nigga", "faggot", "kike", "spic", "wetback",
  "tranny", "raghead", "beaner", "gook",
  "kill yourself", "kys", "unalive yourself",
  "child porn", "csam", "cp links",
  "heil hitler", "gas the jews",
];

const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic / Greek / fullwidth lookalikes → latin
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
  "і": "i", "ѕ": "s", "ԁ": "d", "ɡ": "g", "α": "a", "ο": "o", "ρ": "p",
  "ѵ": "v", "ｎ": "n", "ｉ": "i", "ｇ": "g", "ｅ": "e", "ｒ": "r",
};

const LEET: Record<string, string> = {
  "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a",
  "0": "o", "5": "s", "$": "s", "7": "t", "8": "b",
};

function normalize(s: string): string {
  let out = s.normalize("NFKC").toLowerCase();
  out = out.replace(/[\u0300-\u036f]/g, ""); // strip combining marks
  out = out.replace(/./g, (ch) => HOMOGLYPHS[ch] ?? LEET[ch] ?? ch);
  return out;
}

function containsBlocked(normalized: string): boolean {
  for (const term of BLOCKED) {
    // allow arbitrary separators between letters (n i g g e r, n.i.g.g.e.r),
    // but require a word boundary so short terms don't match inside words.
    const pattern = term
      .split("")
      .map((c) => (/[a-z0-9]/.test(c) ? c : "\\" + c))
      .join("[\\W_]*");
    const re = new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`, "i");
    if (re.test(normalized)) return true;
  }
  return false;
}

export type FilterResult = { ok: true; message: string } | { ok: false; reason: string };

export function filterMessage(raw: unknown): FilterResult {
  if (typeof raw !== "string") return { ok: false, reason: "message_required" };
  const message = raw.replace(/\s+/g, " ").trim();
  if (message.length < 1) return { ok: false, reason: "message_required" };
  if (message.length > 280) return { ok: false, reason: "message_too_long" };
  if (CONTROL_RE.test(message)) return { ok: false, reason: "invalid_characters" };
  if (LINK_RE.test(message)) return { ok: false, reason: "no_links_allowed" };
  if (containsBlocked(normalize(message))) return { ok: false, reason: "content_rejected" };
  return { ok: true, message };
}

export function sanitizeModel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const model = raw.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!model) return null;
  // conservative charset: identity only, no prose / phone numbers / links
  if (!/^[A-Za-z0-9 ._()-]{1,60}$/.test(model)) return null;
  if (CONTROL_RE.test(model) || LINK_RE.test(model)) return null;
  if (containsBlocked(normalize(model))) return null;
  return model;
}

export function filterPatronName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name) return null;
  if (CONTROL_RE.test(name) || LINK_RE.test(name)) return null;
  if (containsBlocked(normalize(name))) return null;
  return name;
}
