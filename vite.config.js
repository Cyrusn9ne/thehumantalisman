import { defineConfig } from 'vite';
import { fetchInstagram } from './api/_core.mjs';

// Serves /instagram.json during `vite dev` / `vite preview` using the same logic
// as the scheduled job (sample data until a token is configured). In production a
// real public/instagram.json (written by the GitHub Action) is served statically.
function instagramDevApi() {
  const handler = async (req, res) => {
    const out = await fetchInstagram(process.env);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out));
  };
  return {
    name: 'instagram-dev-api',
    configureServer(server) { server.middlewares.use('/instagram.json', handler); },
    configurePreviewServer(server) { server.middlewares.use('/instagram.json', handler); },
  };
}

// Plain Vite config. Vanilla JS + ES modules, mirroring the single-file source
// patterns while enabling real npm modules (three, gsap, lenis) and a dev server.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [instagramDevApi()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          gsap: ['gsap'],
        },
      },
    },
  },
});
