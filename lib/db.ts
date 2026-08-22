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
export function rateKey(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  // rightmost XFF token is the hop closest to our edge = most trustworthy
  const fwdTokens = fwd.split(",").map((s) => s.trim()).filter(Boolean);
  const rightmost = fwdTokens.length ? fwdTokens[fwdTokens.length - 1] : "";
  let ip = realIp || rightmost || "unknown";

  if (ip.includes(":") && ip !== "unknown") {
    // bucket IPv6 to /64 (first four hextets)
    const hextets = ip.split(":");
    ip = hextets.slice(0, 4).join(":") + "::/64";
  }

  const salt = process.env.IP_SALT;
  if (!salt) {
    // Refuse to run with a predictable salt; a known salt makes the hash
    // reversible to a plaintext IP. Fail loudly instead of degrading privacy.
    throw new Error("IP_SALT is not set");
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
