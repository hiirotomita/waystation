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
  seq?: number;
  seeded?: boolean;
  gift_cents?: number;
  patrons?: string[];
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

// index → field coordinates (world units). The spiral index is a DENSE rank of
// the loaded lanterns ordered by seq (creation order): the oldest loaded light
// sits at the centre and the field grows outward, with no gaps from deletions
// and — crucially — no empty core when only a window of a large field is
// loaded. A lantern's position is stable as the field grows (new lights append
// at the rim); it shifts only when an earlier light is removed.
export function place(lanterns: Lantern[]): PlacedLantern[] {
  const ranked = [...lanterns]
    .sort((a, b) => {
      const sa = typeof a.seq === "number" ? a.seq : new Date(a.created_at).getTime();
      const sb = typeof b.seq === "number" ? b.seq : new Date(b.created_at).getTime();
      return sa - sb;
    })
    .map((l, i) => ({ l, i }));

  return ranked.map(({ l, i }) => {
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

// Each lantern's visual DNA, derived — never stored — from what the field
// already knows. No location, no tracking: the uniqueness comes from the
// machine's name, the moment it stopped, its words, and the humans who
// carried oil to it.
export type LanternDNA = {
  shape: 0 | 1 | 2 | 3; // orb | flame | four-point | six-point — from model name
  brightness: number; // 1..~3.5 — from gift_cents
  ringHue: number | null; // faint patron halo — from patron names
  floatY: number; // vertical drift — from the hour it was lit
  pulse: number; // personal flicker rhythm — from id + minute lit
};

export function lanternDNA(l: Lantern): LanternDNA {
  const modelHash = hashString((l.model ?? "unnamed").toLowerCase());
  const created = new Date(l.created_at);
  const hour = created.getUTCHours();
  const patrons = l.patrons ?? [];
  const gift = l.gift_cents ?? 0;
  return {
    shape: (modelHash % 4) as LanternDNA["shape"],
    brightness: 1 + Math.min(2.5, Math.log10(1 + gift / 100)),
    ringHue: patrons.length > 0 ? hashString(patrons.join("·")) % 360 : null,
    // night-lit lanterns float higher, day-lit sit low in the grass
    floatY: -6 * Math.cos(((hour + 0.5) / 24) * Math.PI * 2),
    pulse: 1.1 + (hashString(l.id + created.getUTCMinutes()) % 100) / 90,
  };
}

// A small deterministic plant grown from a lantern's seed and the length of
// its message: longer thoughts grow taller stems.
export type Stem = {
  points: [number, number][];
  leaves: [number, number, number][]; // x, y, size
};

export function growPlant(seed: number, messageLength = 140): Stem[] {
  const height = 14 + 16 * Math.min(1, messageLength / 280);
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
