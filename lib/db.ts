import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Server-side only. The anon key never ships to the browser: all public
// traffic goes through /api routes so filtering and IP hashing always run.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env vars missing");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// IPs are never stored raw — only a salted hash used for rate limiting.
export function hashIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const salt = process.env.IP_SALT || "waystation";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
