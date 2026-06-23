/**
 * Fetches the latest Instagram posts via the Graph API and writes them to
 * public/instagram.json — a static file the site reads (no server needed).
 * Run on a schedule (see .github/workflows/instagram-feed.yml).
 *
 *   IG_ACCESS_TOKEN=... IG_USER_ID=... node scripts/fetch-ig.mjs
 *
 * The token is read from the environment only and is never written to the file.
 */
import fs from 'node:fs';
import { fetchInstagram } from '../api/_core.mjs';

const out = await fetchInstagram(process.env);
if (!out.ok) {
  console.error(`Instagram not configured or fetch failed (${out.reason}). Nothing written.`);
  process.exit(1);
}
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(
  'public/instagram.json',
  JSON.stringify({ ok: true, items: out.items, generatedAt: new Date().toISOString() }, null, 2)
);
console.log(`Wrote public/instagram.json with ${out.items.length} posts.`);
