// Fire-and-forget operator alerts. Set ALERT_WEBHOOK_URL to a Discord/Slack
// incoming webhook (or any endpoint accepting {content}) to be notified when
// something needs a human — a first report on a lantern, an auto-hide, or an
// orphaned payment. Without it, alerts are a no-op (and logged server-side).
export async function alertOperator(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  console.error("[waystation alert]", message);
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🏮 Waystation: ${message}` }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* best effort */
  }
}
