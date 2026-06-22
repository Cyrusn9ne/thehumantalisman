import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Per-scene camera/spine poses. Every major section in the source HTML carries
 * a `data-scene` attribute; each maps to a distinct visual state of the spine
 * (camera position + look-at target + column rotation + highlighted region).
 * The values are tweened as a section scrolls into its reading position, so
 * camera and spine movement are tied directly to scroll progress.
 */
export const SCENES = {
  hero: { camX: 3.2, camY: 0.4, camZ: 14, tgtX: 0, tgtY: 0.3, tgtZ: 0, rotY: -0.35, highlight: 'all', strength: 0.32 },
  transition: { camX: 6.2, camY: 0.8, camZ: 11.5, tgtX: 0, tgtY: 0.5, tgtZ: 0, rotY: -0.85, highlight: 'all', strength: 0.3 },
  spine: { camX: -4.4, camY: 1.4, camZ: 9, tgtX: 0, tgtY: 1.2, tgtZ: 0, rotY: 0.45, highlight: 'thoracic', strength: 0.85 },
  gait: { camX: 8, camY: -2.2, camZ: 9, tgtX: 0, tgtY: -2, tgtZ: 0, rotY: 1.2, highlight: 'lumbar', strength: 0.85 },
  heart: { camX: 0.2, camY: 1.2, camZ: 8.2, tgtX: 0, tgtY: 1.1, tgtZ: 0, rotY: 0.0, highlight: 'thoracic', strength: 0.6 },
  return: { camX: 2.4, camY: 0.2, camZ: 13, tgtX: 0, tgtY: 0.2, tgtZ: 0, rotY: -0.2, highlight: 'all', strength: 0.42 },
  low: { camX: -3.2, camY: 0.4, camZ: 17, tgtX: 0, tgtY: 0.2, tgtZ: 0, rotY: -1.4, highlight: 'all', strength: 0.14 },
};

function applyImmediate(scene, pose) {
  Object.assign(scene.state, {
    camX: pose.camX, camY: pose.camY, camZ: pose.camZ,
    tgtX: pose.tgtX, tgtY: pose.tgtY, tgtZ: pose.tgtZ,
    rotY: pose.rotY, highlight: pose.highlight, highlightStrength: pose.strength,
  });
}

/**
 * Wire Lenis smooth scrolling + GSAP ScrollTrigger. Returns a control object.
 * When `reducedMotion` is true, no smooth scroll or scrubbing is installed and
 * the spine is parked in the hero pose (a single static render).
 */
export function initScroll(scene, { reducedMotion = false } = {}) {
  const sections = Array.from(document.querySelectorAll('[data-scene]'));
  const progressBar = document.getElementById('scrollProgress');
  const navLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));

  // Hero pose to begin with.
  applyImmediate(scene, SCENES.hero);

  if (reducedMotion) {
    // Native scroll only; still update the progress bar and active nav.
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const v = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (progressBar) progressBar.style.width = `${v * 100}%`;
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
  lenis.on('scroll', ({ progress }) => {
    if (progressBar) progressBar.style.width = `${Math.min(1, Math.max(0, progress)) * 100}%`;
  });

  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Expose the smooth-scroll instance for debugging and automated tests.
  window.__lenis = lenis;

  // One scrubbed tween per section: as the section rises into the reading zone,
  // the camera/spine ease from the previous pose to this section's pose.
  sections.forEach((section) => {
    const sceneName = section.dataset.scene;
    const pose = SCENES[sceneName] || SCENES.hero;
    gsap.to(scene.state, {
      camX: pose.camX, camY: pose.camY, camZ: pose.camZ,
      tgtX: pose.tgtX, tgtY: pose.tgtY, tgtZ: pose.tgtZ,
      rotY: pose.rotY,
      highlightStrength: pose.strength,
      ease: 'power2.inOut',
      onStart: () => { scene.state.highlight = pose.highlight; },
      onReverseComplete: () => { scene.state.highlight = pose.highlight; },
      scrollTrigger: {
        trigger: section,
        start: 'top 85%',
        end: 'top 35%',
        scrub: 0.8,
        onEnter: () => { scene.state.highlight = pose.highlight; },
        onEnterBack: () => { scene.state.highlight = pose.highlight; },
      },
    });
  });

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
