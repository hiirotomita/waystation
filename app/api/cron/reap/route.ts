import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db";

export const runtime = "nodejs";

// Scheduled maintenance (Vercel Cron, daily). Keeps the rate-limit table from
// growing unbounded on the free tier, and expires old reports. Authorized by
// CRON_SECRET so it cannot be triggered by the public.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = dbAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "no_admin" }, { status: 503 });
  }

  const { error } = await admin.rpc("reap_maintenance");
  if (error) {
    console.error("cron reap:", error.message);
    return NextResponse.json({ ok: false, error: "reap_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
