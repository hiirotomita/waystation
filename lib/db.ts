import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Server-side only. Reads use the publishable key (public by design — the
// database's row/column security is the real boundary). ALL writes go through
// SECURITY DEFINER functions that only the service_role key may execute, so
// the publishable key cannot mutate anything even if it leaks.
let client: SupabaseClient | null = null;

// Forkers point these at their own project via env. The published key is a
// read-only publishable key; it holds no write grants (see 0004_hardening.sql).
const DEFAULT_URL = "https://eoqhczwnhkoatjigqlcz.supabase.co";
const DEFAULT_KEY = "sb_publishable_9GgWMh9cddWp6GIL_xGDcA_mz19Rb-1";

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL || DEFAULT_URL;
    const key = process.env.SUPABASE_ANON_KEY || DEFAULT_KEY;
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// Service-role client — the ONLY path that can write (lanterns, reports,
// gifts). The key exists solely in server env; it never reaches the browser.
// If it is absent, writes are refused rather than silently failing open.
let adminClient: SupabaseClient | null = null;

export function dbAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return null;
  if (!adminClient) {
    const url = process.env.SUPABASE_URL || DEFAULT_URL;
    adminClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return adminClient;
}

// A trusted rate-limit identity, derived server-side from the platform's
// connecting-IP header — never from a client-supplied value, and never the
// leftmost X-Forwarded-For token (which the client controls). IPv6 clients
// are bucketed to their /64 so a single /64 cannot mint unlimited identities.
function connectingIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  // rightmost XFF token is the hop closest to our edge = most trustworthy
  const fwdTokens = fwd.split(",").map((s) => s.trim()).filter(Boolean);
  const rightmost = fwdTokens.length ? fwdTokens[fwdTokens.length - 1] : "";
  return realIp || rightmost || "unknown";
}

function salted(value: string): string {
  const salt = process.env.IP_SALT;
  if (!salt) {
    // Refuse to run with a predictable salt; a known salt makes the hash
    // reversible to a plaintext IP. Fail loudly instead of degrading privacy.
    throw new Error("IP_SALT is not set");
  }
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}

// Canonicalize an IPv6 address to a /N prefix hash bucket. Handles compressed
// forms (::) by expanding to 8 hextets first.
function ipv6Prefix(ip: string, groups: number): string {
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = Array(Math.max(0, 8 - h.length - t.length)).fill("0");
  const full = [...h, ...fill, ...t].slice(0, 8);
  return full.slice(0, groups).join(":") + `::/${groups * 16}`;
}

// Rate-limit identity: IPv6 bucketed to /64.
export function rateKey(req: Request): string {
  let ip = connectingIp(req);
  if (ip.includes(":") && ip !== "unknown") ip = ipv6Prefix(ip, 4);
  return salted(ip);
}

// Reporter identity for the distinct-reporter count. Bucketed hard — IPv6 to
// /48, IPv4 to /24 — so a small proxy pool or a single routed allocation
// cannot mint the distinct reporters needed to censor a lantern.
export function reporterKey(req: Request): string {
  let ip = connectingIp(req);
  if (ip.includes(":") && ip !== "unknown") {
    ip = ipv6Prefix(ip, 3);
  } else if (ip !== "unknown" && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    ip = ip.split(".").slice(0, 3).join(".") + ".0/24";
  }
  return salted(ip);
}
