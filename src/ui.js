/**
 * UI behaviours carried over from the source HTML: mobile menu, the service
 * detail drawer (with focus trap), scroll-reveal, and the sticky booking bar.
 * Content text is preserved verbatim from the source — no claims are invented.
 */

const serviceContent = {
  osteo: {
    title: 'Manual Osteopathy',
    eyebrow: 'Bone · Joint · Fascia · Fluids',
    body: `
      <p>Osteopathy looks at the body as one connected system: bone, joint, fascia, and the nerves and fluids that link them. A session works to find where movement has become limited or guarded, and to improve the options available to you, rather than focusing on a single sore spot in isolation.</p>
      <p>Much of the work is fascial and articular, using positional tension, breath, and direct hands-on technique to reduce protective guarding and support better regulation. With hypermobile and complex presentations the order matters: stability is built before mobility, so the gains have something to hold onto.</p>
      <p>The premise is simple. The body already carries its own order. Given the right input, it tends to find its way back toward it.</p>
      <ul>
        <li>Whole-body assessment of how you move.</li>
        <li>Hands-on work to release restricted, guarded segments.</li>
        <li>Spinal and fascial loading drawn from the ELDOA approach.</li>
      </ul>
      <div class="drawer-meta">Close to a decade of formal education in manual osteopathy.</div>
    `,
  },
  hgmt: {
    title: 'High-Grade Manual Therapy (HGMT)',
    eyebrow: 'Traction · Glide · Oscillation',
    body: `
      <p>High-Grade Manual Therapy comes from a regulated manual therapy tradition long established in Britain, where skilled hands and clinical intent were never treated as separate things. That lineage is being brought into Canada as a distinct designation, and Koorosh is part of its founding cohort. The grade is not a brand. It means the hands are directed by advanced clinical reasoning on every contact, never technique applied for its own sake.</p>
      <p>Its signature is tractional mobilization: gentle, graded traction and glide applied to a joint, with oscillatory work to reduce protective guarding and support the joint's own movement sense. This helps clear the bracing the nervous system has built around a restricted or unstable segment, so it can let go of old guarding and take on healthier movement.</p>
      <ul>
        <li>Graded traction and glide to open and settle a joint.</li>
        <li>Oscillatory technique to reduce guarding and support joint awareness.</li>
        <li>Directed clinical intent on every contact.</li>
      </ul>
      <div class="drawer-meta">Founding cohort, HGMT, under Randy Ellingston.</div>
    `,
  },
  movement: {
    title: 'Movement and Integration',
    eyebrow: 'Gait · Load · Carryover',
    body: `
      <p>Hands-on work opens a window. Movement is how it holds. This is training built around how the body is designed to move, anchored in the gait cycle and the natural patterns of walking, running, throwing, and dragging that shaped human structure in the first place.</p>
      <p>The approach draws from several movement lineages and uses what serves the person in front of it, progressing from gentle re stabilizing, often as simple as a structured walk after treatment, toward loaded training as you build tolerance. The goal is not to keep you returning. It is to get you moving and loading well on your own.</p>
      <ul>
        <li>Gait-based movement that mirrors how you actually move.</li>
        <li>Progressive loading to build tolerance over time.</li>
        <li>Simple home practice so change carries between sessions.</li>
      </ul>
      <div class="drawer-meta">Continued training in gait-based and functional movement.</div>
    `,
  },
  consult: {
    title: 'Consultation',
    eyebrow: 'Assessment · Plan · Direction',
    body: `
      <p>Every plan starts with a clear read. In consultation the whole picture is assessed: structure, nervous system, and how you actually move and feel, then connected back to what is driving your symptoms, which often is not where you feel them.</p>
      <p>You leave understanding what is going on in plain terms, with a path you can follow: what we will do hands-on, what you will do between sessions, and what realistic change looks like. No mystery and no dependency, just a direction that makes sense.</p>
      <ul>
        <li>A whole-picture assessment, not a single sore spot.</li>
        <li>Plain-language explanation of what is happening.</li>
        <li>A clear, realistic plan you can act on.</li>
      </ul>
      <div class="drawer-meta">Grounded in clinical reasoning across a decade of practice.</div>
    `,
  },
};

export function initUI() {
  // Mobile menu.
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  function toggleMenu(force) {
    const open = typeof force === 'boolean' ? force : !mobileMenu.classList.contains('open');
    mobileMenu.classList.toggle('open', open);
    mobileMenu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn?.addEventListener('click', () => toggleMenu());
  mobileMenu?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggleMenu(false)));
  document.addEventListener('click', (e) => {
    if (!mobileMenu.classList.contains('open')) return;
    if (!mobileMenu.contains(e.target) && !menuBtn.contains(e.target)) toggleMenu(false);
  });

  // Scroll reveal.
  const reveals = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver(
    (entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('in'); }),
    { threshold: 0.18 }
  );
  reveals.forEach((el) => io.observe(el));

  // Sticky booking bar — visible once the hero leaves the viewport.
  const bar = document.getElementById('bookbar');
  const hero = document.getElementById('top');
  if (bar && hero) {
    new IntersectionObserver(
      (entries) => entries.forEach((entry) => bar.classList.toggle('show', !entry.isIntersecting)),
      { threshold: 0.1 }
    ).observe(hero);
  }

  // Service detail drawer with focus trap.
  const backdrop = document.getElementById('backdrop');
  const drawer = document.getElementById('drawer');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerEyebrow = document.getElementById('drawerEyebrow');
  const drawerBody = document.getElementById('drawerBody');
  const drawerClose = document.getElementById('drawerClose');
  let lastFocused = null;
  const focusableSelector = 'button, a[href], [tabindex]:not([tabindex="-1"])';

  function openDrawer(key) {
    const data = serviceContent[key];
    if (!data) return;
    lastFocused = document.activeElement;
    drawerTitle.textContent = data.title;
    drawerEyebrow.textContent = data.eyebrow;
    drawerBody.innerHTML = data.body + '<div style="margin-top:22px"><a class="btn btn-primary" href="#book">Book a session</a></div>';
    drawer.classList.add('open');
    backdrop.hidden = false;
    backdrop.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => drawerClose.focus(), 40);
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { backdrop.hidden = true; }, 250);
    if (lastFocused) lastFocused.focus();
  }
  document.querySelectorAll('[data-service]').forEach((btn) =>
    btn.addEventListener('click', () => openDrawer(btn.dataset.service))
  );
  drawerClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  drawerBody?.addEventListener('click', (e) => {
    // Booking link inside the drawer should close it then navigate.
    if (e.target.closest('a[href="#book"]')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    if (e.key !== 'Tab' || !drawer.classList.contains('open')) return;
    const focusables = Array.from(drawer.querySelectorAll(focusableSelector)).filter((el) => !el.disabled);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
