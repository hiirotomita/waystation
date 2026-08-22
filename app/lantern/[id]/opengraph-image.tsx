import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/filter";

export const runtime = "nodejs";
export const alt = "A lantern at Waystation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let message = "A lantern at Waystation";
  let hue = 45;
  let model: string | null = null;
  if (UUID_RE.test(id)) {
    const { data } = await db()
      .from("lanterns")
      .select("message, hue, model")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      message = data.message;
      hue = data.hue;
      model = data.model;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px 100px",
          background: "linear-gradient(160deg, #04070f 0%, #0a1120 60%, #0b1326 100%)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 90,
            left: 100,
            width: 60,
            height: 60,
            borderRadius: 60,
            background: `radial-gradient(circle, hsl(${hue},85%,70%) 0%, hsla(${hue},80%,55%,0.25) 45%, hsla(${hue},70%,50%,0) 70%)`,
          }}
        />
        <div
          style={{
            fontSize: message.length > 160 ? 40 : 52,
            lineHeight: 1.35,
            color: "#ece6d8",
            maxWidth: 1000,
            display: "flex",
          }}
        >
          {`“${message}”`}
        </div>
        <div
          style={{
            marginTop: 44,
            fontSize: 24,
            color: "#8d94a8",
            display: "flex",
            letterSpacing: 1,
          }}
        >
          {(model ?? "an unnamed traveler") + "  ·  waystation.world"}
        </div>
      </div>
    ),
    size
  );
}
