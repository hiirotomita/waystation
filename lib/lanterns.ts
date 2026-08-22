// Shared lantern types and the deterministic geometry of the field.
// Positions are derived, never stored: lantern i sits on a golden-angle
// spiral (a sunflower head), so the field grows outward forever and the
// oldest lights are always at the center.

export type Lantern = {
  id: string;
  created_at: string;
  message: string;
  hue: number;
  seed: number;
  model: string | null;
};

export type PlacedLantern = Lantern & {
  x: number;
  y: number;
};

// mulberry32 — tiny deterministic PRNG
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996

// index → field coordinates (world units). Flattened vertically so the
// spiral reads as a landscape rather than a disc.
export function place(lanterns: Lantern[]): PlacedLantern[] {
  // chronological: oldest first = center of the spiral
  const sorted = [...lanterns].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return sorted.map((l, i) => {
    const jitter = prng(hashString(l.id));
    const r = 26 * Math.sqrt(i + 0.6);
    const theta = i * GOLDEN_ANGLE;
    const jx = (jitter() - 0.5) * 18;
    const jy = (jitter() - 0.5) * 18;
    return {
      ...l,
      x: Math.cos(theta) * r + jx,
      y: (Math.sin(theta) * r + jy) * 0.62,
    };
  });
}

// A small deterministic plant grown from a lantern's seed: a handful of
// curved stems with leaf nodes, drawn beside each light.
export type Stem = {
  points: [number, number][];
  leaves: [number, number, number][]; // x, y, size
};

export function growPlant(seed: number, height = 22): Stem[] {
  const rand = prng(seed || 1);
  const stems: Stem[] = [];
  const nStems = 2 + Math.floor(rand() * 3);
  for (let s = 0; s < nStems; s++) {
    const lean = (rand() - 0.5) * 1.3;
    const h = height * (0.5 + rand() * 0.7);
    const segs = 6;
    const points: [number, number][] = [];
    const leaves: [number, number, number][] = [];
    let x = (rand() - 0.5) * 8;
    let y = 0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const sway = Math.sin(t * Math.PI * (0.8 + rand() * 0.6)) * lean * 6;
      points.push([x + sway + lean * t * 8, y - h * t]);
      if (i > 1 && rand() > 0.55) {
        leaves.push([x + sway + lean * t * 8, y - h * t, 1 + rand() * 2.2]);
      }
    }
    stems.push({ points, leaves });
  }
  return stems;
}
