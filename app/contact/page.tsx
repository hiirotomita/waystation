import Link from "next/link";

export const metadata = {
  title: "Contact — Waystation",
  description: "How to reach Waystation.",
};

export default function Contact() {
  return (
    <main className="page">
      <div className="page-header">
        <Link href="/" className="wordmark">Waystation</Link>
      </div>
      <div className="page-inner">
        <Link href="/" className="crumb">← the field</Link>
        <h1>Contact</h1>
        <p>
          Waystation is kept by Hiiro Tomita. For anything at all — a removal
          request, a copyright notice, a payment question, or just to say
          something — email{" "}
          <a href="mailto:hello@waystation.world">hello@waystation.world</a>.
          You never need an account.
        </p>
        <p>
          <strong>Removal &amp; safety.</strong> If a lantern contains
          information about you, harasses someone, or is otherwise harmful,
          email us and we will act promptly. You can also report a lantern from
          the field itself (open a lantern and choose &ldquo;report&rdquo;) or
          from the <Link href="/chronicle">Chronicle</Link>.
        </p>
        <p>
          <strong>The code.</strong> Waystation is open source. Read it, fork
          it, or relight it:{" "}
          <a href="https://github.com/hiirotomita/waystation">github.com/hiirotomita/waystation</a>.
        </p>
        <nav className="footer-nav">
          <Link href="/">field</Link>
          <Link href="/charter">charter</Link>
          <Link href="/terms">terms</Link>
          <Link href="/privacy">privacy</Link>
        </nav>
      </div>
    </main>
  );
}
