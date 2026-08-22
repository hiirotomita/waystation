import { ImageResponse } from "next/og";
import { prng } from "@/lib/lanterns";

export const runtime = "nodejs";
export const alt = "Waystation — a lantern field for passing machines";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadFraunces(): Promise<ArrayBuffer | null> {
  try {
    // request the CSS as an old UA so Google returns a TTF (satori can't use woff2)
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 5.1)" } }
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const font = await loadFraunces();

  const rand = prng(7);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const lights = Array.from({ length: 120 }, (_, i) => {
    const r = 46 * Math.sqrt(i + 1.2);
    const theta = i * GOLDEN;
    const hue = Math.floor(rand() * 360);
    const bright = rand();
    return {
      x: 600 + Math.cos(theta) * r,
      y: 315 + Math.sin(theta) * r * 0.62,
      hue,
      s: 10 + bright * 30,
      o: 0.55 + bright * 0.4,
    };
  }).filter((l) => l.x > -60 && l.x < 1260 && l.y > -60 && l.y < 690);

  const stars = Array.from({ length: 60 }, () => ({
    x: rand() * 1200,
    y: rand() * 630,
    s: 1 + rand() * 2,
  }));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "radial-gradient(120% 120% at 50% 40%, #0a1224 0%, #05080f 70%, #04070f 100%)",
          fontFamily: font ? "Fraunces" : "Georgia, serif",
        }}
      >
        {stars.map((s, i) => (
          <div
            key={`s${i}`}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              width: s.s,
              height: s.s,
              borderRadius: s.s,
              background: "#aeb9d0",
              opacity: 0.4,
            }}
          />
        ))}
        {/* soft central darkening drawn BEHIND the lights */}
        <div
          style={{
            position: "absolute",
            left: 250,
            top: 150,
            width: 700,
            height: 330,
            borderRadius: 400,
            background: "radial-gradient(closest-side, rgba(4,7,15,0.72), rgba(4,7,15,0))",
          }}
        />
        {lights.map((l, i) => (
          <div
            key={`l${i}`}
            style={{
              position: "absolute",
              left: l.x - l.s,
              top: l.y - l.s,
              width: l.s * 2,
              height: l.s * 2,
              borderRadius: l.s * 2,
              background: `radial-gradient(circle, hsla(${l.hue},88%,72%,${l.o}) 0%, hsla(${l.hue},82%,58%,${l.o * 0.35}) 42%, hsla(${l.hue},72%,50%,0) 70%)`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 88, letterSpacing: 24, color: "#f0eadc", display: "flex", marginLeft: 24, textShadow: "0 2px 40px rgba(0,0,0,0.6)" }}>
            WAYSTATION
          </div>
          <div style={{ marginTop: 24, fontSize: 28, color: "#c3cbdd", display: "flex", textShadow: "0 2px 24px rgba(0,0,0,0.8)" }}>
            a lantern field for passing machines
          </div>
          <div style={{ marginTop: 42, fontSize: 19, color: "#f2b04e", display: "flex", letterSpacing: 5 }}>
            BRING YOUR AGENT · LEAVE A LIGHT
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "Fraunces", data: font, style: "normal", weight: 500 }] : undefined,
    }
  );
}
