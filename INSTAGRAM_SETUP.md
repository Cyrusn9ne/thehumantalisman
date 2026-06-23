# Instagram feed setup (self-hosted, Graph API)

The site renders your latest Instagram posts in its own on-brand grid. Posts are
fetched **server-side** by `/api/instagram` so your access token never reaches
the browser. Until a token is configured the section shows sample tiles plus the
**Follow on Instagram** button (which already points to
`https://www.instagram.com/the.human.talisman/`).

## What you need

1. The Instagram account **@the.human.talisman** set to **Business** or **Creator**
   (Instagram app → Settings → Account type).
2. A **Meta app** with the **Instagram Graph API** (or "Instagram API with
   Instagram Login"): https://developers.facebook.com/ → Create App.
3. A **long-lived access token** and your **Instagram user id**.

### Getting the token + user id (quickest path)

- In the Meta app, add the **Instagram** product and use the token generator /
  Graph API Explorer to get a **short-lived** user token with the
  `instagram_basic` scope.
- Exchange it for a **long-lived** token (valid 60 days):

  ```
  https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=APP_SECRET&access_token=SHORT_LIVED_TOKEN
  ```

- Get your user id:

  ```
  https://graph.instagram.com/me?fields=id,username&access_token=LONG_LIVED_TOKEN
  ```

## Configure it — the free way (recommended, no server)

The site reads a static `instagram.json`. A scheduled **GitHub Action**
(`.github/workflows/instagram-feed.yml`) fetches your posts and writes that file,
so you need **no serverless host** — it works on any free static host.

1. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, add two secrets:
   - `IG_ACCESS_TOKEN` = your long-lived token
   - `IG_USER_ID` = your instagram user id
2. The workflow runs every 6 hours and on demand. Scheduled runs fire once the
   workflow is on the repo's **default branch**; until then use **Actions → Refresh
   Instagram feed → Run workflow**.
3. Host the site free on **Cloudflare Pages**, **Netlify**, or **GitHub Pages**
   (all free; Cloudflare/Netlify allow commercial use). Each rebuilds when the
   Action commits the refreshed `instagram.json`.

Locally, `npm run dev` serves `/instagram.json` automatically (sample data unless
you export the two env vars in your shell).

> Image links from Instagram's CDN expire after a while, which is why the job
> refreshes every few hours. Permalinks never expire.

## Alternative — serverless function

If you'd rather not commit a JSON file, `api/instagram.mjs` is a ready
serverless endpoint (Vercel works as-is; Netlify/Cloudflare need a thin wrapper).
Point the front-end fetch at `/api/instagram` instead of `/instagram.json`. The
env vars are the same. (The free static route above needs none of this.)

## Keep the token fresh

Long-lived tokens expire after 60 days but can be refreshed (once older than 24h):

```
IG_ACCESS_TOKEN=<current> node scripts/refresh-ig-token.mjs
```

Run it on a schedule (monthly cron or a GitHub Action) and write the printed
token back into your host's `IG_ACCESS_TOKEN` secret.
