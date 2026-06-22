import { defineConfig } from 'vite';
import { fetchInstagram } from './api/_core.mjs';

// Serves /api/instagram during `vite dev` / `vite preview` using the same logic
// as the deployed serverless function (sample data until a token is configured).
function instagramDevApi() {
  const handler = async (req, res) => {
    const out = await fetchInstagram(process.env);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out));
  };
  return {
    name: 'instagram-dev-api',
    configureServer(server) { server.middlewares.use('/api/instagram', handler); },
    configurePreviewServer(server) { server.middlewares.use('/api/instagram', handler); },
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
