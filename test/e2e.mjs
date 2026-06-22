import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://localhost:5173/';
const OUT = '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];

const BOOKING = {
  omnia: 'https://omnia.juvonno.com/portal/publicbook.php?step=dateTime&branch_id=1&dr=29&product_id=107',
  academy: 'https://academymassage.juvonno.com/portal/publicbook.php?step=dateTime&branch_id=1&dr=244&product_id=388',
  instagram: 'https://www.instagram.com/the.human.talisman?igsh=MXJ4cG8wdmYwczhzNQ==',
};

const results = { viewports: {}, special: {}, errors: [] };

function attachConsole(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => bucket.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    // Ignore the OG image preload (absolute prod URL, not served in dev).
    if (u.includes('thehumantalisman.ca')) return;
    bucket.push(`requestfailed: ${u} ${r.failure()?.errorText || ''}`);
  });
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

  for (const vp of VIEWPORTS) {
    const errs = [];
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    attachConsole(page, errs);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);

    const mode = await page.evaluate(() => document.body.dataset.mode);
    const loaderGone = await page.evaluate(() => !document.getElementById('loader'));
    const canvasOk = await page.evaluate(() => {
      const c = document.getElementById('scene');
      return c ? c.width > 0 && c.height > 0 : false;
    });

    // Screenshot: top
    await page.screenshot({ path: `${OUT}/${vp.name}-1-top.png` });

    // Scroll to middle
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.5, behavior: 'instant' }));
    await settle(page, 1400);
    await page.screenshot({ path: `${OUT}/${vp.name}-2-middle.png` });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await settle(page, 1400);
    await page.screenshot({ path: `${OUT}/${vp.name}-3-bottom.png` });

    // Booking link integrity
    const links = await page.evaluate(() => {
      const get = (sel) => Array.from(document.querySelectorAll(sel)).map((a) => ({ href: a.href, target: a.target, rel: a.rel }));
      return {
        omnia: get('a[href*="omnia.juvonno.com"]'),
        academy: get('a[href*="academymassage.juvonno.com"]'),
        instagram: get('a[href*="instagram.com"]'),
      };
    });
    const bookingOk =
      links.omnia.length >= 1 && links.omnia.every((l) => l.href === BOOKING.omnia && l.target === '_blank') &&
      links.academy.length >= 1 && links.academy.every((l) => l.href === BOOKING.academy && l.target === '_blank') &&
      links.instagram.length >= 1;

    // Drawer open/close
    let drawerOk = false;
    try {
      await page.evaluate(() => window.scrollTo({ top: document.getElementById('work').offsetTop, behavior: 'instant' }));
      await page.waitForTimeout(500);
      await page.click('[data-service="osteo"]');
      await page.waitForTimeout(500);
      const open = await page.evaluate(() => document.getElementById('drawer').classList.contains('open'));
      const hasBook = await page.evaluate(() => !!document.querySelector('#drawerBody a[href="#book"]'));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const closed = await page.evaluate(() => !document.getElementById('drawer').classList.contains('open'));
      drawerOk = open && hasBook && closed;
    } catch (e) { errs.push(`drawer: ${e.message}`); }

    // Mobile menu (only relevant where menu button is visible)
    let menuOk = null;
    const menuVisible = await page.evaluate(() => {
      const b = document.getElementById('menuBtn');
      return b && getComputedStyle(b).display !== 'none';
    });
    if (menuVisible) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(300);
      await page.click('#menuBtn');
      await page.waitForTimeout(400);
      const opened = await page.evaluate(() => document.getElementById('mobileMenu').classList.contains('open'));
      await page.click('#mobileMenu a[href="#faq"]');
      await page.waitForTimeout(800);
      const closedAfter = await page.evaluate(() => !document.getElementById('mobileMenu').classList.contains('open'));
      menuOk = opened && closedAfter;
    }

    // Nav anchor scrolling
    let navOk = null;
    if (!menuVisible) {
      // Resync Lenis to the top before exercising the anchor link, since the
      // earlier native scrollTo() calls (for screenshots) bypass Lenis.
      await page.evaluate(() => window.__lenis && window.__lenis.scrollTo(0, { immediate: true }));
      await page.waitForTimeout(500);
      await page.click('.nav-links a[href="#locations"]');
      navOk = false;
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(400);
        navOk = await page.evaluate(() => {
          const r = document.getElementById('locations').getBoundingClientRect();
          return r.top < window.innerHeight * 0.6 && r.top > -200;
        });
        if (navOk) break;
      }
    }

    // Horizontal overflow check
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);

    results.viewports[vp.name] = { mode, loaderGone, canvasOk, bookingOk, drawerOk, menuOk, navOk, noHScroll, links, errors: errs };
    await ctx.close();
  }

  // --- Reduced motion ---
  {
    const errs = [];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    attachConsole(page, errs);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const mode = await page.evaluate(() => document.body.dataset.mode);
    const loaderGone = await page.evaluate(() => !document.getElementById('loader'));
    await page.screenshot({ path: `${OUT}/reduced-motion.png` });
    results.special.reducedMotion = { mode, loaderGone, errors: errs };
    await ctx.close();
  }

  // --- No WebGL fallback (force getContext to fail for webgl) ---
  {
    const errs = [];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    attachConsole(page, errs);
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).includes('webgl')) return null;
        return orig.call(this, type, ...rest);
      };
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const mode = await page.evaluate(() => document.body.dataset.mode);
    const has3d = await page.evaluate(() => document.documentElement.classList.contains('no-3d'));
    const loaderGone = await page.evaluate(() => !document.getElementById('loader'));
    const bookingStillThere = await page.evaluate(() => !!document.querySelector('a[href*="omnia.juvonno.com"]'));
    await page.screenshot({ path: `${OUT}/no-webgl.png` });
    results.special.noWebGL = { mode, has3d, loaderGone, bookingStillThere, errors: errs };
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync('/tmp/results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
