// Builds a single, self-contained HTML file (all JS/CSS inlined and the brand
// image embedded as base64) that opens directly in any modern browser with no
// server and no install — useful for previewing this WebGL site from anywhere.
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'dist-portable');

await build({
  root,
  base: './',
  configFile: false,
  logLevel: 'warn',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

// Inline the brand image (a public asset, so the bundler leaves it as a URL).
const htmlPath = path.join(outDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const imgB64 = fs.readFileSync(path.join(root, 'public', 'brand-bg.jpg')).toString('base64');
const dataUri = `data:image/jpeg;base64,${imgB64}`;
// The base:'./' build may emit the asset as ./brand-bg.jpg or /brand-bg.jpg.
html = html.replaceAll('./brand-bg.jpg', dataUri).replaceAll('/brand-bg.jpg', dataUri);

const finalPath = path.join(root, 'the-human-talisman-preview.html');
fs.writeFileSync(finalPath, html);
const kb = (fs.statSync(finalPath).size / 1024).toFixed(0);
console.log(`Portable preview written: ${finalPath} (${kb} KB)`);
