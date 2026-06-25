# Deploying The Human Talisman (free)

Recommended host: **Cloudflare Pages** — free, fast global CDN, auto-deploys on
every push, serves at the site root (no path juggling). Netlify works identically.

## One-time setup (≈5 minutes)

1. Go to **https://dash.cloudflare.com** → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git** → pick this repository.
2. Build settings:
   - **Framework preset:** None / Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variable:** `NODE_VERSION` = `20`
3. **Save and Deploy.** You get a live URL like `the-human-talisman.pages.dev`.

That's it. Every push to the connected branch rebuilds and deploys automatically.

## Custom domain (thehumantalisman.com)

Cloudflare Pages → your project → **Custom domains** → add `thehumantalisman.com`
and follow the DNS prompt. Because the site is served at the domain root, no code
changes are needed.

## Instagram feed

The feed is fully automated and **needs nothing extra on the host** — a GitHub
Action writes `public/instagram.json`, which is then built and deployed like any
other file. See `INSTAGRAM_SETUP.md` for the one-time token + GitHub secrets.

## Notes

- Nothing secret is stored in Cloudflare — the Instagram token lives only as a
  GitHub Actions secret.
- Caching and security headers are configured in `public/_headers`.
- Prefer GitHub Pages instead? It also works, but project sites serve from a
  `/repo/` subpath; set Vite's `base` to `/<repo>/` (or attach a custom domain to
  serve at root). Cloudflare/Netlify avoid this entirely.
