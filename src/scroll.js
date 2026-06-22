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

export function initScroll(scene, { reducedMotion = false } = {}) {
  const sections = Array.from(document.querySelectorAll('[data-scene]'));
  const progressBar = document.getElementById('scrollProgress');
  const navLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));

  const setProgress = (p) => {
    const v = Math.min(1, Math.max(0, p));
    scene.state.progress = v;
    if (progressBar) progressBar.style.width = `${v * 100}%`;
  };

  if (reducedMotion) {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
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

  // Content panels rotate in 3D as they scroll (alternating swing).
  const mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width:861px)', mobile: '(max-width:860px)' }, (ctx) => {
    const desktop = ctx.conditions.desktop;
    const ry = desktop ? 15 : 6;
    const rx = desktop ? 6 : 3;
    const z = desktop ? -170 : -60;
    sections.forEach((section, i) => {
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
    destroy: () => { lenis.destroy(); ScrollTrigger.getAll().forEach((t) => t.kill()); },
  };
}
