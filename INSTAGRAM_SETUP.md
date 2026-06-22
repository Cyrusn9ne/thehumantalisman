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

## Configure the deployment

Set these as **environment variables / secrets** on your host (never commit them):

```
IG_ACCESS_TOKEN=<your long-lived token>
IG_USER_ID=<your instagram user id>
```

The feed needs a host that runs serverless functions:

- **Vercel** — `api/instagram.mjs` works as-is. Add the env vars in Project
  Settings → Environment Variables.
- **Netlify** — point a function at the same logic, or use
  `netlify/functions/instagram.mjs`:
  ```js
  import { fetchInstagram } from '../../api/_core.mjs';
  export const handler = async () => ({
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(await fetchInstagram(process.env)),
  });
  ```
  and add a redirect `/api/instagram -> /.netlify/functions/instagram`.
- **Cloudflare Pages** — adapt to a Pages Function using `env` instead of
  `process.env`.

Locally, `npm run dev` serves `/api/instagram` already (sample data unless the
env vars are set in your shell).

## Keep the token fresh

Long-lived tokens expire after 60 days but can be refreshed (once older than 24h):

```
IG_ACCESS_TOKEN=<current> node scripts/refresh-ig-token.mjs
```

Run it on a schedule (monthly cron or a GitHub Action) and write the printed
token back into your host's `IG_ACCESS_TOKEN` secret.
