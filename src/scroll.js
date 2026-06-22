import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll wiring.
 *
 * The figure + electromagnetic field is driven by overall scroll progress
 * (0 → 1), cross-fading through the four poses in order:
 *   side profile → rear view → front view → Vitruvian.
 *
 * Content panels additionally rotate in 3D as they pass, swinging in sympathy
 * with the field. Under reduced motion there is no smooth scroll or scrubbing;
 * the pose still updates on native scroll via single-frame renders.
 */
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

  // Expose the smooth-scroll instance for debugging and automated tests.
  window.__lenis = lenis;

  // Active-nav highlighting as each target section passes the viewport centre.
  sections.forEach((section) => {
    if (!section.id) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top center',
      end: 'bottom center',
      onToggle: (self) => {
        if (!self.isActive) return;
        navLinks.forEach((a) => {
          a.classList.toggle('active', a.getAttribute('href') === `#${section.id}`);
        });
      },
    });
  });

  // ---- Content panels rotate in 3D as they scroll, swinging with the field ----
  const mm = gsap.matchMedia();
  mm.add(
    { desktop: '(min-width:861px)', mobile: '(max-width:860px)' },
    (ctx) => {
      const desktop = ctx.conditions.desktop;
      const ry = desktop ? 17 : 7;
      const rx = desktop ? 7 : 3;
      const z = desktop ? -190 : -70;

      sections.forEach((section, i) => {
        const panel = section.querySelector('.panel, .hero-card');
        if (!panel) return;
        const dir = i % 2 ? 1 : -1;
        const tl = gsap.timeline({
          scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.9 },
        });
        tl.fromTo(
          panel,
          { rotationY: ry * dir, rotationX: rx, z, y: 34, transformPerspective: 1300 },
          { rotationY: 0, rotationX: 0, z: 0, y: 0, ease: 'power2.out' }
        ).to(panel, {
          rotationY: -ry * 0.8 * dir,
          rotationX: -rx * 0.7,
          z: z * 0.8,
          y: -26,
          ease: 'power2.in',
        });
      });
    }
  );

  // Anchor links route through Lenis so smooth scroll and ScrollTrigger agree.
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
    destroy: () => {
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    },
  };
}
