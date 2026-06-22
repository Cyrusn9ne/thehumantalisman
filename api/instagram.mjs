/**
 * Serverless endpoint for the Instagram feed (Vercel / Node-style signature:
 * `export default (req, res)`). Works on Vercel out of the box and on Netlify
 * via a thin wrapper (see INSTAGRAM_SETUP.md). The token stays server-side.
 */
import { fetchInstagram } from './_core.mjs';

export default async function handler(req, res) {
  try {
    const out = await fetchInstagram(process.env);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    // Cache at the edge; clients revalidate often enough for a feed.
    res.setHeader('cache-control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, reason: 'handler-error', items: [] }));
  }
}
