import './styles.css';
import './fonts.js';
import { initUI } from './ui.js';
import { initPolish } from './polish.js';

/**
 * Entry point. Decides which experience to run based on capability:
 *   1. Reduced motion  → static single-frame spine, native scroll.
 *   2. No WebGL        → CSS brand backdrop only, fully functional content.
 *   3. Full            → animated 3D spine driven by scroll (lazy-loaded).
 *
 * In every case the written content, booking links and navigation work.
 */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 700);
}

function enterStaticFallback(reason) {
  // Switch the page into the no-3D presentation. Content stays intact.
  root.classList.add('no-3d');
  root.classList.remove('has-3d');
  if (reason) console.info(`[talisman] static fallback: ${reason}`);
  hideLoader();
}

async function boot() {
  initUI();
  initPolish({ reducedMotion });

  // Always reveal content even if the 3D path never finishes.
  const safety = setTimeout(hideLoader, 6000);

  if (!hasWebGL()) {
    clearTimeout(safety);
    enterStaticFallback('WebGL unavailable');
    document.body.dataset.mode = 'no-webgl';
    return;
  }

  root.classList.add('has-3d');

  try {
    const [{ SpineScene }, { initScroll }] = await Promise.all([
      import('./scene.js'),
      import('./scroll.js'),
    ]);

    const canvas = document.getElementById('scene');
    let scroll = null;

    const scene = new SpineScene(canvas, {
      reducedMotion,
      onLowPerf: () => {
        // Sustained low frame rate: stop the loop and show the static backdrop.
        scene.stop();
        if (scroll) scroll.destroy();
        enterStaticFallback('low performance');
        document.body.dataset.mode = 'low-perf';
      },
    });

    // Load the four pose images and build the field before starting.
    await scene.loadModel();

    scroll = initScroll(scene, { reducedMotion });
    scene.start();

    // Intro ignition: energy rises and the heart lights up.
    if (!reducedMotion) {
      const { gsap } = await import('gsap');
      gsap.fromTo(scene.state, { intro: 0 }, { intro: 1, duration: 1.9, ease: 'power2.out' });
    }

    // Keep ScrollTrigger measurements correct after fonts/layout settle.
    window.addEventListener('load', () => scroll.refresh && scroll.refresh());
    setTimeout(() => scroll.refresh && scroll.refresh(), 400);

    clearTimeout(safety);
    document.body.dataset.mode = reducedMotion ? 'reduced-motion' : 'full';
    requestAnimationFrame(hideLoader);
  } catch (err) {
    clearTimeout(safety);
    console.error('[talisman] 3D init failed', err);
    enterStaticFallback('init error');
    document.body.dataset.mode = 'error-fallback';
  }
}

// Catch a lost WebGL context at runtime and degrade gracefully.
window.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  enterStaticFallback('context lost');
  document.body.dataset.mode = 'context-lost';
}, { passive: false });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
