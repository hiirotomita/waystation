import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Server-side only. The anon key never ships to the browser: all public
// traffic goes through /api routes so filtering and IP hashing always run.
let client: SupabaseClient | null = null;

// The publishable key is public-by-design (Supabase's security boundary is
// RLS + column grants, enforced in supabase/migrations). Env vars override
// these defaults so anyone forking the field can point it at their own sky.
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

// Service-role client for gift recording only. The key exists solely in
// Vercel env; without it, patron lights are disabled and nothing else breaks.
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

// IPs are never stored raw — only a salted hash used for rate limiting.
export function hashIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const salt = process.env.IP_SALT || "waystation";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
