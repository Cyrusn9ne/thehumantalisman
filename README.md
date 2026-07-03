# The Human Talisman

An immersive, full-screen website for **The Human Talisman** — manual osteopathy,
high-grade manual therapy, and movement integration in Winnipeg.

The page is built around a glowing **human figure inside a circular
electromagnetic (torus) field** (Three.js). As the visitor scrolls, the figure
and field rotate through four poses in order, with flowing cross-fade
transitions and cinematic post-processing. All content, booking links and
clinical language are carried verbatim from the source HTML — nothing was
invented.

## The field images

The centrepiece is driven by four supplied photographs in `public/field/`:

| File | Pose |
|------|------|
| `pose-1.webp` | side profile |
| `pose-2.webp` | rear view |
| `pose-3.webp` | front view |
| `pose-4.webp` | Vitruvian |

Scroll progress (0 → 1) cross-fades through them in that order. If a file is
missing, a clearly-labelled placeholder is generated so the motion is still
visible. The engine lives in `src/field.js`; the renderer, post-processing and
frame-rate watchdog are in `src/scene.js`.

## The spinal axis

Layered over the body field is the central anatomical system (`src/axis.js`):
an abstract spinal axis — luminous core, seventeen vertebral rings on an
S-curve, a fascial web, and nerve pulses (the single muted-cobalt accent).
Each section's `data-scene` drives its state via `AXIS_SCENES` in
`src/scroll.js`, telling the story of entering the body:

| Scene | Story beat | System state |
|---|---|---|
| `hero` | surface tension | quiet field, no axis |
| `transition` | the axis is sensed | faint presence |
| `spine` | the work | vertebral structure enters |
| `gait` | a session | joint space opens (decompression) |
| `heart` | approach | fascial web + nerve regulation |
| `human` | about | human presence returns |
| `return` | locations / instagram | scene simplifies |
| `low` | faq | almost still |
| `settle` | book | systems settle, light gathers |

### Graphics enhancements

- **UnrealBloom** post-processing for the amber glow
- **Vignette + film grain** colour grade pass
- Additive **ember particles** drifting over the field
- Animated **field shimmer** (subtle swirl) in the shader
- ACES filmic tone mapping, high-DPR rendering, smooth Lenis scrolling

## Stack

- **Vite** — dev server + bundler (vanilla ES modules, no framework)
- **Three.js** + EffectComposer — WebGL scene & post-processing
- **GSAP + ScrollTrigger** — scroll-linked pose progress & panel rotation
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

Overall scroll progress (0 → 1) cross-fades the field through the four poses in
order — side profile → rear → front → Vitruvian — driven from `src/scroll.js`.

As each section scrolls past, its content panel also **rotates in 3D** — swinging
from a tilted, recessed state into a flat, readable state at centre, then tilting
away as it leaves, in sympathy with the field (inspired by the scroll feel of
activetheory.net, rebuilt from scratch — no reference code or assets are used).
The panel-rotation `matchMedia` block lives in `src/scroll.js`; the field engine
is in `src/field.js` and the renderer/post-processing/watchdog in `src/scene.js`.

## Resilience

- **Reduced motion** — `prefers-reduced-motion` disables smooth scroll, particles
  and shimmer; the pose still updates on scroll via single-frame renders.
- **No WebGL** — falls back to the brand photographic backdrop; all content and
  booking links remain fully functional.
- **Low performance** — a frame-rate watchdog first drops bloom + pixel ratio,
  then, if still slow, hands off to the static backdrop.
- **Lost WebGL context** — caught at runtime and degraded to the static backdrop.
- A 6-second safety timer guarantees the loader is removed even if WebGL never
  initialises.

The original uploaded file is kept for reference at
[`reference/sample-source.html`](reference/sample-source.html).
