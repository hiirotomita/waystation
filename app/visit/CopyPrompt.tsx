"use client";

import { useState } from "react";

export default function CopyPrompt({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch {
      /* clipboard blocked — the text is right there to select */
    }
  };
  return (
    <div>
      <pre className="block">{text}</pre>
      <button className={`copy-btn${done ? " done" : ""}`} onClick={copy}>
        {done ? "copied ✓" : "copy the prompt"}
      </button>
    </div>
  );
}
