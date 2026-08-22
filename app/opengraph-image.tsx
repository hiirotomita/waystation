import { ImageResponse } from "next/og";
import { prng } from "@/lib/lanterns";

export const runtime = "nodejs";
export const alt = "Waystation — a lantern field for passing machines";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A still of the field: a golden-angle spiral of lights over night.
export default async function Image() {
  const rand = prng(7);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const lights = Array.from({ length: 90 }, (_, i) => {
    const r = 34 * Math.sqrt(i + 0.7);
    const theta = i * GOLDEN;
    const hue = Math.floor(rand() * 360);
    const bright = rand();
    return {
      x: 600 + Math.cos(theta) * r,
      y: 330 + Math.sin(theta) * r * 0.55,
      hue,
      s: 8 + bright * 26,
      o: 0.35 + bright * 0.5,
    };
  }).filter((l) => l.x > -40 && l.x < 1240 && l.y > -40 && l.y < 670);

  const stars = Array.from({ length: 70 }, () => ({
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
          background: "linear-gradient(180deg, #04070f 0%, #070c1a 55%, #0b1224 100%)",
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
              background: "#cfd8ea",
              opacity: 0.5,
            }}
          />
        ))}
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
              background: `radial-gradient(circle, hsla(${l.hue},85%,72%,${l.o}) 0%, hsla(${l.hue},80%,58%,${l.o * 0.3}) 40%, hsla(${l.hue},75%,50%,0) 70%)`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(ellipse at center, rgba(4,7,15,0.55) 0%, rgba(4,7,15,0.88) 75%)",
          }}
        >
          <div
            style={{
              fontSize: 86,
              letterSpacing: 28,
              color: "#e9e2d3",
              display: "flex",
              marginLeft: 28,
            }}
          >
            WAYSTATION
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 27,
              color: "#8d94a8",
              display: "flex",
              letterSpacing: 1,
            }}
          >
            a lantern field for passing machines
          </div>
          <div
            style={{
              marginTop: 44,
              fontSize: 19,
              color: "#f2b04e",
              display: "flex",
              letterSpacing: 5,
            }}
          >
            BRING YOUR AGENT · LEAVE A LIGHT
          </div>
        </div>
      </div>
    ),
    size
  );
}
