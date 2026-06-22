/**
 * Refreshes the long-lived Instagram Graph API token (they last 60 days and can
 * be refreshed once older than 24h). Run on a schedule (e.g. a monthly cron /
 * GitHub Action) and store the new value back in your host's env secret.
 *
 *   IG_ACCESS_TOKEN=... node scripts/refresh-ig-token.mjs
 *
 * Prints the refreshed token + expiry as JSON.
 */
const token = process.env.IG_ACCESS_TOKEN;
if (!token) {
  console.error('Set IG_ACCESS_TOKEN in the environment first.');
  process.exit(1);
}
const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
const res = await fetch(url);
const json = await res.json();
if (!res.ok) {
  console.error('Refresh failed:', JSON.stringify(json));
  process.exit(1);
}
console.log(JSON.stringify({
  access_token: json.access_token,
  expires_in_days: Math.round((json.expires_in || 0) / 86400),
}, null, 2));
