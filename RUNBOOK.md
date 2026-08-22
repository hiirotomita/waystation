# Waystation runbook

One page for the 3am moments. Every command is copy-pasteable.

## Close / open the field (fastest, no deploy)

Go to `https://waystation.world/admin`, enter the admin token, and click
**close the field** (stops all new lanterns) or **open the field**.

If the admin page is down, run in the Supabase SQL editor:

```sql
-- close (stop new lanterns)
update settings set value = 'false'::jsonb where key = 'accepting';
-- open again
update settings set value = 'true'::jsonb where key = 'accepting';
```

## Suspected CSAM / child sexual abuse material — DO THIS, in order

Do NOT hit "purge" first — deleting first can destroy evidence you are legally
required to preserve.

1. **Hide** the lantern from `/admin` (removes it from public view, keeps the row).
2. **Report** to the NCMEC CyberTipline: https://report.cybertip.org (US legal
   obligation under 18 U.S.C. §2258A for providers with actual knowledge).
3. **Preserve** the row and its report/rate rows for at least 90 days — do not
   purge, and note the lantern id. (Text-only content lowers the imagery
   obligation, but preserve regardless.)
4. Only **purge** after you have reported and the preservation window has passed,
   or when instructed by NCMEC/law enforcement.

## Hide / unhide / remove a lantern (ordinary content)

From `/admin`: **hide** (reversible), **delete (soft)** (recoverable for 30
days), **purge** (permanent — for illegal content, and only after the CSAM
flow above where it applies). Un-hiding a lantern makes it report-immune so a
brigade can&apos;t immediately re-hide it.

By hand:

```sql
-- hide one
update lanterns set hidden = true where id = '<uuid>';
-- un-hide everything hidden by a report brigade
update lanterns set hidden = false, report_count = 0 where hidden = true and deleted_at is null;
delete from reports;   -- optional: clear the report tallies too
```

## A report brigade is wiping the field

Hidden is reversible. From `/admin` click **unhide** on each, or:

```sql
update lanterns set hidden = false, report_count = 0 where hidden = true and deleted_at is null;
delete from reports where lantern_id in (select id from lanterns where hidden = false);
```

Then consider closing the field for a while (above) and raising the hide
threshold in `report_lantern` if it recurs.

## Restore from backup

Daily JSON snapshots live in the private Supabase Storage bucket `backups`
(`waystation-YYYY-MM-DD.json`). To restore, download the latest and re-insert
its `lanterns` rows with the service key (they include `seq`, so positions are
preserved). Ask the admin API / a small script to upsert them.

## Supabase free-tier project got paused (7 days idle)

Open the Supabase dashboard → the project → **Resume**. The site 500s until
it's resumed. Traffic keeps it warm; this only bites after a quiet week.

## The classifier (OpenAI moderation)

The high-recall classifier is **fail-closed**: if `MODERATION_API_KEY` is unset
OR the OpenAI endpoint is unreachable, new lanterns are **held for review**
(accepted but hidden) and you get an alert per hold. Nothing publishes on the
wordlist alone. So until you set the key, every stranger's lantern waits on
`/admin` for you — safe, but the field won't grow on its own. Set
`MODERATION_API_KEY` (free OpenAI moderation) to publish clean lanterns
immediately. `/admin` shows the current classifier state.

## A gift was charged but the lantern didn't brighten

The Stripe webhook records gifts even if the buyer never returns, so this is
rare. If it happens: find the session in the Stripe dashboard, confirm it's
paid, and re-run `record_gift` with the service key, or refund it (30-day
no-questions policy). You'll have been alerted if the webhook failed.

## Secrets / env (Vercel → waystation → Settings → Environment Variables)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (read), `SUPABASE_SERVICE_KEY` (writes)
- `IP_SALT` (required — the app refuses to start without it)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `MODERATION_API_KEY` (OpenAI — strongly recommended before launch)
- `ADMIN_TOKEN`, `CRON_SECRET`, `ALERT_WEBHOOK_URL` (Discord/Slack)

Rotate a leaked key in its provider dashboard, update the Vercel env, redeploy.
