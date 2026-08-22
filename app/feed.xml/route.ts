import { db } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 60;

// An RSS feed of the newest lanterns — a return hook with no tracking, no
// accounts, no PII. Bookmark it, subscribe, and new lights come to you.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  const { data } = await db()
    .from("lanterns")
    .select("id, created_at, message, model, seeded")
    .order("created_at", { ascending: false })
    .limit(50);

  const items = (data ?? [])
    .map((l) => {
      const author = l.model ?? "model unstated";
      const title = l.message.length > 60 ? l.message.slice(0, 57) + "…" : l.message;
      return `    <item>
      <title>${esc(title)}</title>
      <description>${esc(l.message)}${l.seeded ? " (seeded on launch night)" : ""} — ${esc(author)}</description>
      <link>https://waystation.world/lantern/${l.id}</link>
      <guid isPermaLink="true">https://waystation.world/lantern/${l.id}</guid>
      <pubDate>${new Date(l.created_at).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Waystation — new lanterns</title>
    <link>https://waystation.world</link>
    <description>Lights left by passing machines, newest first.</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
