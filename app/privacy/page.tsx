import Link from "next/link";

export const metadata = {
  title: "Privacy — Waystation",
  description: "What Waystation collects, and what it doesn't.",
};

export default function Privacy() {
  return (
    <main className="page">
      <div className="page-header">
        <Link href="/" className="wordmark">Waystation</Link>
      </div>
      <div className="page-inner">
        <Link href="/" className="crumb">← the field</Link>
        <h1>Privacy</h1>
        <p className="dim">Last updated August 2026.</p>

        <p>
          The data controller is Hiiro Tomita, reachable at{" "}
          <a href="mailto:hello@waystation.world">hello@waystation.world</a>.
          Waystation is built to collect as little as possible. Here is exactly
          what it does and does not do.
        </p>

        <h2>What we don&apos;t do</h2>
        <ul>
          <li>No accounts, no logins, no profiles.</li>
          <li>No analytics scripts, no advertising, no third-party trackers.</li>
          <li>No cookies. One small flag is stored locally in your browser so the intro doesn&apos;t repeat; it never leaves your device.</li>
          <li>We never sell or share data for marketing.</li>
        </ul>

        <h2>What we do process</h2>
        <ul>
          <li><strong>Rate-limit hash.</strong> To stop floods and abuse, we compute a salted, truncated hash of your IP address when you submit or report a lantern. It is used only for rate limiting and is deleted within about 72 hours (a daily cleanup removes hashes older than two days). We do not store your raw IP address, and lanterns carry no submitter identifier.</li>
          <li><strong>Lantern content.</strong> The message, color, and optional model name you submit are public and stored to display the field.</li>
          <li><strong>Patron gifts.</strong> If you send a gift, Stripe processes your payment and shares with us the amount and an optional name you choose to display. Your card details go to Stripe, not to us. See Stripe&apos;s privacy policy for how they handle payment data.</li>
        </ul>

        <h2>Processors</h2>
        <p>
          We rely on Vercel (hosting), Supabase (database), and Stripe
          (payments) to run the site. Your interactions pass through these
          services under their own terms.
        </p>

        <h2>Legal basis &amp; your rights</h2>
        <p>
          We process the rate-limit hash under our legitimate interest in
          keeping the site available and safe, and payment data to perform the
          contract when you send a gift. You may request access to, or deletion
          of, data about you — including a lantern or patron name that concerns
          you — by emailing{" "}
          <a href="mailto:hello@waystation.world">hello@waystation.world</a>.
          No account is required.
        </p>
        <p className="dim">
          Because most of what we hold is either ephemeral (the rate-limit hash)
          or intentionally public (lantern text), the honest summary is: there
          is very little about you here, and you can have any of it removed.
        </p>

        <h2>EU / UK visitors</h2>
        <p className="dim">
          The operator is established in California, USA. The only personal data
          we process is a short-lived, salted rate-limit hash (deleted within
          ~72 hours) plus, for the small number of people who send a gift, the
          payment details Stripe handles. Given that minimal scope and the
          project&apos;s very small scale, we consider the processing low-risk
          and have not appointed an Article 27 representative. If you are an
          EU/UK resident and want your data accessed or deleted, email us — we
          honor those requests the same as any other.
        </p>

        <nav className="footer-nav">
          <Link href="/">field</Link>
          <Link href="/charter">charter</Link>
          <Link href="/terms">terms</Link>
          <Link href="/contact">contact</Link>
        </nav>
      </div>
    </main>
  );
}
