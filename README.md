# The Human Talisman

An immersive, full-screen website for **The Human Talisman** — manual osteopathy,
high-grade manual therapy, and movement integration in Winnipeg.

The page is built around a **3D anatomical spine** (Three.js) that rotates,
repositions and changes camera angle as the visitor scrolls. Every major section
is linked to a distinct visual state of the spine, with the written content
layered over a full-screen scene. All content, booking links and clinical
language are carried verbatim from the source HTML — nothing was invented.

## The spine model is required

The spine is a **real model loaded at runtime**, not procedural geometry. Place a
detailed model at `public/models/spine.glb` (GLB preferred; `.gltf`, `.fbx` and
`.obj` are also accepted, Draco-compressed GLB supported). See
[`public/models/README.md`](public/models/README.md) for details. Until a model
is present the site runs its graceful static fallback — all content and booking
links work, but no spine is shown. The loader lives in `src/loadSpine.js`.

## Stack

- **Vite** — dev server + bundler (vanilla ES modules, no framework)
- **Three.js** — procedural spine + WebGL scene
- **GSAP + ScrollTrigger** — scroll-linked camera / spine poses
- **Lenis** — smooth scrolling

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build + preview:

```bash
npm run build
npm run preview  # http://localhost:4173
```

End-to-end checks (requires a local Chromium for Playwright):

```bash
npm test
```

## How the experience is wired

| Section (`data-scene`)        | Spine / camera state                                  |
|-------------------------------|-------------------------------------------------------|
| Hero (`hero`)                 | Full column, three-quarter front, slow drift          |
| Why different (`transition`)  | Rotates to a side profile, eases closer               |
| The work (`spine`)            | Close on the column, thoracic region highlighted      |
| A session (`gait`)            | Side, lowered to the lumbar/sacrum, highlighted        |
| Approach / About (`heart`)    | Centred on the thoracic spine, front                  |
| Locations / Book (`return`)   | Upright, full column, calm                            |
| FAQ (`low`)                   | Pulled back and dimmed                                 |

As each section scrolls past, its content panel also **rotates in 3D** — swinging
from a tilted, recessed state into a flat, readable state at centre, then tilting
away as it leaves. The swing direction follows the spine's rotation for that
scene, so the panels and the spine move together (inspired by the scroll feel of
activetheory.net, rebuilt from scratch — no reference code or assets are used).

Poses live in `src/scroll.js` (`SCENES`, plus the panel-rotation `matchMedia`
block). The spine model is loaded and prepared in `src/loadSpine.js`; the
renderer/camera/lighting, image-based lighting and the frame-rate watchdog are in
`src/scene.js`.

## Resilience

- **Reduced motion** — `prefers-reduced-motion` disables smooth scroll and
  scroll-scrubbing and renders the spine as a single static frame.
- **No WebGL** — falls back to the brand photographic backdrop; all content and
  booking links remain fully functional.
- **Low performance** — a frame-rate watchdog first drops the pixel ratio, then,
  if still slow, hands off to the static backdrop.
- **Lost WebGL context** — caught at runtime and degraded to the static backdrop.
- A 6-second safety timer guarantees the loader is removed even if 3D never
  initialises.

The original uploaded file is kept for reference at
[`reference/sample-source.html`](reference/sample-source.html).
