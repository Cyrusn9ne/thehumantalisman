import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * High-end interaction polish: a glowing custom cursor, magnetic CTAs and
 * word-by-word heading reveals. All of it is desktop + fine-pointer only and is
 * fully skipped under reduced motion, so it never affects accessibility.
 */
export function initPolish({ reducedMotion }) {
  const fine = window.matchMedia('(pointer:fine)').matches;

  splitHeadings(reducedMotion);

  if (reducedMotion || !fine) return;

  customCursor();
  magneticButtons();
}

/** Split headings into words and rise them in as they enter the viewport. */
function splitHeadings(reducedMotion) {
  const targets = document.querySelectorAll('h1, h2');
  targets.forEach((el) => {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    const words = el.textContent.split(/(\s+)/);
    el.textContent = '';
    const spans = [];
    for (const w of words) {
      if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(' ')); continue; }
      const outer = document.createElement('span');
      outer.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top';
      const inner = document.createElement('span');
      inner.style.cssText = 'display:inline-block;will-change:transform';
      inner.textContent = w;
      outer.appendChild(inner);
      el.appendChild(outer);
      spans.push(inner);
    }
    if (reducedMotion) return;
    gsap.set(spans, { yPercent: 115 });
    gsap.to(spans, {
      yPercent: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

/** A soft amber ring that trails the pointer and reacts to interactive targets. */
function customCursor() {
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  document.body.append(dot, ring);
  document.documentElement.classList.add('has-cursor');

  let mx = innerWidth / 2, my = innerHeight / 2;
  let rx = mx, ry = my;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px,${my}px)`;
  }, { passive: true });

  const interactive = 'a, button, summary, [data-service], input, .service';
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest(interactive)) ring.classList.add('hot');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest(interactive)) ring.classList.remove('hot');
  });

  gsap.ticker.add(() => {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx}px,${ry}px)`;
  });
}

/** Primary CTAs subtly pull toward the cursor when it's near. */
function magneticButtons() {
  const buttons = document.querySelectorAll('.btn-primary, .btn-ghost');
  buttons.forEach((btn) => {
    const strength = 0.32;
    const onMove = (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      gsap.to(btn, { x: x * strength, y: y * strength, duration: 0.4, ease: 'power3.out' });
    };
    const reset = () => gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.4)' });
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerleave', reset);
  });
}
