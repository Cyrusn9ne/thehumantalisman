/**
 * Shared Instagram Graph API fetch logic, used by both the serverless function
 * (api/instagram.mjs) and the Vite dev middleware. The access token is read from
 * the server environment only — it is never sent to the browser.
 *
 * Required env:
 *   IG_ACCESS_TOKEN  long-lived Instagram Graph API token
 *   IG_USER_ID       the Instagram user id the token belongs to
 *
 * Without those, it returns ok:false plus sample items so the UI is previewable.
 */

const TTL_MS = 10 * 60 * 1000;
const cache = { at: 0, items: null };

export function sampleItems() {
  // Brand-image placeholders linking to the profile — clearly marked sample data.
  const permalink = 'https://www.instagram.com/the.human.talisman';
  return Array.from({ length: 6 }, (_, i) => ({
    id: `sample-${i}`,
    type: 'IMAGE',
    image: '/brand-bg.jpg',
    permalink,
    caption: '',
    timestamp: null,
  }));
}

export async function fetchInstagram(env = {}) {
  const token = env.IG_ACCESS_TOKEN;
  const userId = env.IG_USER_ID;
  if (!token || !userId) {
    return { ok: false, reason: 'not-configured', items: sampleItems() };
  }
  if (cache.items && Date.now() - cache.at < TTL_MS) {
    return { ok: true, cached: true, items: cache.items };
  }
  const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
  const url = `https://graph.instagram.com/${userId}/media?fields=${fields}&limit=12&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, reason: 'api-error', status: res.status, items: cache.items || sampleItems() };
    }
    const json = await res.json();
    const items = (json.data || [])
      .filter((m) => m.media_type !== 'VIDEO' || m.thumbnail_url)
      .map((m) => ({
        id: m.id,
        type: m.media_type,
        image: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
        permalink: m.permalink,
        caption: (m.caption || '').slice(0, 160),
        timestamp: m.timestamp,
      }));
    cache.items = items;
    cache.at = Date.now();
    return { ok: true, items };
  } catch (e) {
    return { ok: false, reason: 'fetch-failed', items: cache.items || sampleItems() };
  }
}
