import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll wiring for the figure sequence.
 *
 * Overall scroll progress (0 → 1) drives the four-pose sequence (front → side →
 * back → davinci). A soft snap gently settles onto a pose only when the reader
 * stops very near one of the four anchor points, so reading the content in
 * between is never hijacked. Content panels also rotate in 3D as they pass.
 */
const POSE_POINTS = [0, 1 / 3, 2 / 3, 1];

/**
 * Spinal-axis narrative. Each data-scene maps to a state of the anatomical
 * system: how present the axis is, how open the joint spaces are
 * (decompression), the fascial web, the nerve pulses, the column's rotation,
 * and how far the body-field recedes behind it (dim).
 *
 *   hero        surface tension — quiet field, no axis
 *   transition  the axis is sensed
 *   spine       the work — vertebral structure enters
 *   gait        a session — joint space opens (decompression)
 *   heart       approach — fascial web + nervous-system regulation
 *   human       about — human presence returns, warmth
 *   return      locations / instagram — scene simplifies
 *   low         faq — almost still
 *   settle      book — systems settle, light gathers on the axis
 */
const AXIS_SCENES = {
  hero: { visibility: 0, decompression: 0, fascia: 0, pulses: 0, rotY: -0.4, dim: 0 },
  transition: { visibility: 0.22, decompression: 0, fascia: 0, pulses: 0.08, rotY: -0.1, dim: 0.12 },
  spine: { visibility: 1, decompression: 0.12, fascia: 0.12, pulses: 0.25, rotY: 0.4, dim: 0.55 },
  gait: { visibility: 1, decompression: 0.9, fascia: 0.28, pulses: 0.35, rotY: 0.95, dim: 0.6 },
  heart: { visibility: 0.92, decompression: 0.5, fascia: 1, pulses: 0.55, rotY: 1.6, dim: 0.6 },
  human: { visibility: 0.4, decompression: 0.3, fascia: 0.3, pulses: 0.25, rotY: 2.1, dim: 0.2 },
  return: { visibility: 0.3, decompression: 0.1, fascia: 0.1, pulses: 0.12, rotY: 2.6, dim: 0.12 },
  low: { visibility: 0.18, decompression: 0, fascia: 0.05, pulses: 0.08, rotY: 2.9, dim: 0.08 },
  settle: { visibility: 0.85, decompression: 0.04, fascia: 0.18, pulses: 0.7, rotY: 3.6, dim: 0.3 },
};

export function initScroll(scene, { reducedMotion = false } = {}) {
  const sections = Array.from(document.querySelectorAll('[data-scene]'));
  const progressBar = document.getElementById('scrollProgress');
  const navLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));

  const setProgress = (p) => {
    const v = Math.min(1, Math.max(0, p));
    // The render loop eases progress toward this target (see scene.js).
    scene.state.targetProgress = v;
    if (progressBar) progressBar.style.width = `${v * 100}%`;
  };

  if (reducedMotion) {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const v = max > 0 ? window.scrollY / max : 0;
      scene.state.targetProgress = v;
      scene.state.progress = v; // no render loop to ease it
      if (progressBar) progressBar.style.width = `${v * 100}%`;
      scene.renderOnce();
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return { lenis: null, refresh: () => {}, destroy: () => window.removeEventListener('scroll', onScroll) };
  }

  const lenis = new Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.4,
  });

  lenis.on('scroll', ScrollTrigger.update);
  lenis.on('scroll', ({ progress }) => setProgress(progress));
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  window.__lenis = lenis;

  // Route keyboard scrolling through Lenis so holding an arrow key scrolls
  // smoothly from the first press instead of fighting native scroll (no glitch).
  const onKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) return;
    // Don't scroll the page behind an open drawer / mobile menu.
    if (document.getElementById('drawer')?.classList.contains('open')) return;
    if (document.getElementById('mobileMenu')?.classList.contains('open')) return;

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const vh = window.innerHeight;
    const cur = lenis.targetScroll ?? lenis.scroll ?? window.scrollY;
    let target = null, duration = 0.5;
    switch (e.key) {
      case 'ArrowDown': target = cur + 130; duration = 0.4; break;
      case 'ArrowUp': target = cur - 130; duration = 0.4; break;
      case 'PageDown': target = cur + vh * 0.9; break;
      case 'PageUp': target = cur - vh * 0.9; break;
      case 'Home': target = 0; duration = 0.8; break;
      case 'End': target = max; duration = 0.8; break;
      default: return;
    }
    e.preventDefault();
    lenis.scrollTo(Math.max(0, Math.min(max, target)), { duration, easing: (x) => 1 - Math.pow(1 - x, 3) });
  };
  window.addEventListener('keydown', onKey);

  // ---- Soft snap: settle onto a pose only when stopped very near one ----
  let snapTimer;
  let snapping = false;
  const trySnap = () => {
    if (snapping) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    const p = window.scrollY / max;
    let nearest = POSE_POINTS[0];
    for (const pt of POSE_POINTS) if (Math.abs(pt - p) < Math.abs(nearest - p)) nearest = pt;
    if (Math.abs(nearest - p) < 0.045 && Math.abs(nearest - p) > 0.002) {
      snapping = true;
      lenis.scrollTo(nearest * max, {
        duration: 0.7,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        onComplete: () => { snapping = false; },
      });
    }
  };
  lenis.on('scroll', () => { clearTimeout(snapTimer); snapTimer = setTimeout(trySnap, 170); });

  // Active-nav highlighting.
  sections.forEach((section) => {
    if (!section.id) return;
    ScrollTrigger.create({
      trigger: section, start: 'top center', end: 'bottom center',
      onToggle: (self) => {
        if (!self.isActive) return;
        navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${section.id}`));
      },
    });
  });

  // Spinal-axis narrative: scrub each section's axis state in as it reaches
  // the reading zone, so the anatomical system moves with the story.
  sections.forEach((section) => {
    const pose = AXIS_SCENES[section.dataset.scene];
    if (!pose) return;
    gsap.to(scene.axisState, {
      ...pose,
      ease: 'power2.inOut',
      scrollTrigger: { trigger: section, start: 'top 85%', end: 'top 30%', scrub: 0.8 },
    });
  });

  // Content panels ease through a restrained 3D swing as they scroll. The hero
  // stays anchored — the field carries the opening motion, not the type.
  const mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width:861px)', mobile: '(max-width:860px)' }, (ctx) => {
    const desktop = ctx.conditions.desktop;
    const ry = desktop ? 9 : 4;
    const rx = desktop ? 4 : 2;
    const z = desktop ? -110 : -40;
    sections.forEach((section, i) => {
      if (section.dataset.scene === 'hero') return;
      const panel = section.querySelector('.panel, .hero-card');
      if (!panel) return;
      const dir = i % 2 ? 1 : -1;
      const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.9 } });
      tl.fromTo(
        panel,
        { rotationY: ry * dir, rotationX: rx, z, y: 30, transformPerspective: 1300 },
        { rotationY: 0, rotationX: 0, z: 0, y: 0, ease: 'power2.out' }
      ).to(panel, { rotationY: -ry * 0.8 * dir, rotationX: -rx * 0.7, z: z * 0.8, y: -24, ease: 'power2.in' });
    });
  });

  // Anchor links route through Lenis.
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -70 });
    });
  });

  setProgress(0);
  ScrollTrigger.refresh();

  return {
    lenis,
    refresh: () => ScrollTrigger.refresh(),
    destroy: () => { window.removeEventListener('keydown', onKey); lenis.destroy(); ScrollTrigger.getAll().forEach((t) => t.kill()); },
  };
}
