import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db";
import { alertOperator } from "@/lib/alert";

export const runtime = "nodejs";

// Daily durable snapshot of the artwork (lanterns + gifts) to a private
// Supabase Storage bucket, so the field can be restored if a table is dropped
// or fat-fingered. Authorized by CRON_SECRET (Vercel Cron sends it).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = dbAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "no_admin" }, { status: 503 });

  const { data: lanterns, error: lErr } = await admin
    .from("lanterns")
    .select("*")
    .order("seq", { ascending: true });
  const { data: gifts } = await admin.from("gifts").select("*");
  if (lErr) {
    await alertOperator("backup failed: could not read lanterns.");
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }

  const snapshot = JSON.stringify({
    taken_at: new Date().toISOString(),
    count: lanterns?.length ?? 0,
    lanterns,
    gifts,
  });
  const day = new Date().toISOString().slice(0, 10);
  const { error: upErr } = await admin.storage
    .from("backups")
    .upload(`waystation-${day}.json`, snapshot, {
      contentType: "application/json",
      upsert: true,
    });
  if (upErr) {
    await alertOperator(`backup upload failed: ${upErr.message}`);
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: lanterns?.length ?? 0 });
}
