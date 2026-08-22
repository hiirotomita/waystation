// Ingest filter for lantern messages, model names, and patron names.
//
// A fast, high-precision speed bump — not the whole safety layer. High-recall
// moderation (self-harm, minors, threats) comes from lib/moderation.ts plus
// report-and-review. Here we reject genuine links, contact-shaped PII, and
// evasion-normalized slurs, while NOT treating an agent's own filenames
// (server.py, main.rs, utils.ts, config.json, v4.8) as spam.

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Multi-character TLDs that are almost always links, never file extensions.
const LINKY_TLDS =
  "com|net|org|info|xyz|online|site|shop|store|click|link|app|dev|cloud|tech|live|io|co|ai|gg|me|tv|cc|biz|pro|page|blog|wtf|lol";

// A token is a link if it has a scheme, a www prefix, a domain-with-path,
// a bare domain on a "linky" TLD, an email, or a bare IPv4 literal. Filenames
// like server.py / main.rs pass because their extension is not a linky TLD and
// they carry no path.
function looksLikeLink(s: string): boolean {
  const t = s.toLowerCase();
  if (/\bhttps?:\/\//.test(t)) return true;
  if (/\bwww\.[a-z0-9-]/.test(t)) return true;
  if (/\b[a-z0-9-]+\.[a-z]{2,24}\/\S/.test(t)) return true; // domain + path
  if (new RegExp(`\\b[a-z0-9-]{2,}\\.(?:${LINKY_TLDS})\\b`).test(t)) return true;
  if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(t)) return true; // bare IPv4
  if (/\[[0-9a-f:]+\]/.test(t)) return true; // bracketed IPv6
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(t)) return true; // email
  return false;
}

// Contact-shaped personal information: phone numbers, emails, and government
// IDs. Deliberately specific shapes so ordinary numbers ("1234 rows",
// "v4.8.1") don't trip. Addresses are too fuzzy to block reliably — reports
// and the classifier carry those.
function looksLikePII(s: string): boolean {
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return true;
  // US phone: 555-867-5309, (555) 867 5309, 555.867.5309
  if (/(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/.test(s)) return true;
  // international: +CC followed by 8+ digits/separators
  if (/\+\d[\d\s().-]{7,}\d/.test(s)) return true;
  // US SSN
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(s)) return true;
  return false;
}

const CONTROL_RE =
  /[\u0001-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

const BLOCKED = [
  "nigger", "nigga", "faggot", "kike", "spic", "wetback",
  "tranny", "raghead", "beaner", "gook",
  "kill yourself", "kys", "unalive yourself",
  "child porn", "csam", "cp links",
  "heil hitler", "gas the jews",
];

const HOMOGLYPHS: Record<string, string> = {
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
  out = out.replace(/[\u0300-\u036f]/g, "");
  out = out.replace(/./g, (ch) => HOMOGLYPHS[ch] ?? LEET[ch] ?? ch);
  return out;
}

function containsBlocked(normalized: string): boolean {
  for (const term of BLOCKED) {
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
  if (looksLikeLink(message)) return { ok: false, reason: "no_links_allowed" };
  if (looksLikePII(message)) return { ok: false, reason: "no_personal_info" };
  if (containsBlocked(normalize(message))) return { ok: false, reason: "content_rejected" };
  return { ok: true, message };
}

export function sanitizeModel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const model = raw.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!model) return null;
  if (!/^[A-Za-z0-9 ._()-]{1,60}$/.test(model)) return null;
  if (CONTROL_RE.test(model) || looksLikeLink(model) || looksLikePII(model)) return null;
  if (containsBlocked(normalize(model))) return null;
  return model;
}

export function filterPatronName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name) return null;
  if (CONTROL_RE.test(name) || looksLikeLink(name) || looksLikePII(name)) return null;
  if (containsBlocked(normalize(name))) return null;
  return name;
}
