# Direction — taking the field to exceptional

This document synthesizes four research streams (2026-08-22): how 3D web worlds
are built successfully with AI assistance, how state-of-the-art WebGL projects
are actually executed, how exceptional visual beauty is produced, and an honest
self-analysis of how this project's visuals were built so far. It is the working
standard for all further visual work on Waystation.

## 1. The diagnosis (self-analysis, confirmed by research)

The renderer was built with an **engineering loop** (spec → build → fix defects)
when beauty requires an **art loop** (reference → value plan → build-to-match →
critique → subtract). Specific confirmed failures:

- **No reference ever existed.** "Done" had no external definition, which is how
  a 4/10 got self-scored as 8/10. Every professional pipeline studied — Bruno
  Simon, Coastal World, Lusion, Susurrus, Pixar — locks reference and mood
  before building anything.
- **Additive accumulation, never subtraction.** Effects were stacked (pools,
  beams, mist, grain…) and nothing was ever removed for taste. Research names
  this the #1 AI failure mode: "AI generates additively and uniformly in one
  pass; beauty is produced hierarchically and subtractively across checkpointed
  passes." Journey and Sable both got beautiful by *removing*.
- **No value structure.** The scene was never once checked in grayscale; the
  moon, beams, pools, and lanterns compete. Pros design the light/dark masses
  (notan) before color exists.
- **Palette by math, not by choice.** Submitter hue (0–360°) paints the field a
  full rainbow. Professional palettes are 2–3 hues at ~70/25/5 dominance.
- **Maker's-eye judgment.** The builder graded frames seconds after making them.
  Every real correction came from fresh eyes. The documented fix (Snider,
  Playwright-MCP loops) is a screenshot pipeline with *fixed preset views*
  compared against the reference, every iteration.
- **One-frame judgment.** Beauty was assessed on one establishing shot; reading
  distance, mobile portrait, and motion were checked late or never.

## 2. The standard process from now on

1. **Reference lock (no code).** 3 hero reference images; a one-page art bible:
   palette (with the hue-remap rule), value plan, focal hierarchy, the "money
   shot" description. Human (Hiiro) approves the art bible before any code.
2. **Three fixed target frames.** Hero wide, reading close-up, mobile portrait.
   Every iteration screenshots all three from identical camera presets.
3. **One change per iteration.** Change → screenshot ×3 → grayscale check
   (CSS `filter: grayscale(1)` on the canvas) → 15-point audit (below) →
   keep or revert. Commit per kept change.
4. **Element order: composition → value → color → light → post.** Never tune
   bloom before the value masses read in grayscale.
5. **A subtraction pass every round.** Remove or quiet one thing; if the frame
   doesn't get worse, it stays removed.
6. **Knobs, not re-prompts.** Tunable constants exposed in one place (or a debug
   panel) so taste adjustments are turned, not re-derived.
7. **Fresh eyes at milestones.** External critique (Hiiro and/or critic agents)
   against the reference board — not against memory of the last version.
8. **Perf gate at the end of each phase.** FPS watchdog; quality tiers; the
   post chain is the first thing dropped, reflection resolution second.

## 3. The 15-point frame audit (run on screenshots)

1 Grayscale: distinct light/dark masses, or mush? 2 Thumbnail at ~200px: 2–3 big
shapes? 3 One focal point in 5 seconds? 4 One value family ~70% dominant?
5 ≤3 hues at ~70/25/5? 6 Max saturation only near the focal point? 7 Every
light has a visible source? 8 One dominant light direction? 9 Three depth planes
(background cooler/paler/softer; fog matches background)? 10 Detail concentrated
at focus, visible rest areas? 11 Sharpest edges only at the focal point?
12 Silhouettes read in flat black? 13 Big–medium–small size variety, no uniform
repetition? 14 Deliberate asymmetry/imperfection present? 15 Subtraction test:
remove one element — did the frame get worse?

## 4. Gap analysis: current field vs the professional cookbook

| Element | Current | Professional target |
|---|---|---|
| Bloom | Global luminance threshold (fought two blowout wars) | **Selective bloom**: only the lantern/moon layer blooms; scene layer never does |
| Palette | Raw submitter hue = rainbow soup | **Hue remap**: map any submitted hue into a scripted palette (dominant warm-amber family ~70%, teal secondary ~25%, magenta accent ~5%) while preserving distinguishability |
| Value | Unplanned; competing brightness | Notan: water+sky darkest 70%, mist/reeds mid 25%, lantern cores the only true highlights 5% |
| Reflections | 768px sharp planar Reflector | **Lower-res + blurred** planar reflection (quarter-res, blur hides cheapness, softer = more pro, faster) |
| Camera | Free-fly at FOV 58 | Default **cinematic drift** (slow rail/parallax, FOV ~40–45, damped); free-fly as explicit "explore" mode |
| Focal point | None designed | One nearest bright lantern staged as primary focus; moon as counterweight; edge/detail hierarchy supports it |
| Sky | Static star points | Twinkling star Points layer; milky way kept subtle |
| Detail density | Uniform reeds everywhere | Clumped interest areas + open water rest areas |
| Perf | No tiers, unmeasured on phones | FPS watchdog → drop post → halve reflection → cap DPR; 3 tiers |
| Grade | Shader split-tone | Keep, tuned after value/palette fixes; grain stays (kills banding) |

## 5. Execution phases

- **Phase 0 — Art bible + reference lock** (with Hiiro's approval of palette and
  money shot).
- **Phase 1 — Structure:** selective bloom layers; hue-remap; value rebalance
  (darken mids, quiet beams/mist); FOV + cinematic default camera.
- **Phase 2 — Craft:** blurred low-res reflections; star twinkle; detail
  density shaping; edge hierarchy; staged focal lantern.
- **Phase 3 — Performance:** watchdog + tiers; real-phone verification.
- **Phase 4 — Fresh-eyes audit** against the reference board; subtraction
  passes; only then launch assets (OG images, share frames).

Full source list lives in the session research reports (Codrops case studies,
GDC art-direction talks, Bruno Simon / Coastal World / Lusion / Susurrus
writeups, AI-workflow postmortems).
