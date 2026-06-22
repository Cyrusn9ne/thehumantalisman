// Self-hosted variable fonts loaded via the FontFace API so only the latin
// woff2 files we actually use are bundled (and inlined in the portable build).
// font-display: swap avoids invisible text; matching fallbacks limit CLS.
import interNormal from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';
import frauncesNormal from '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2';
import frauncesItalic from '@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2';

function add(family, url, descriptors) {
  try {
    const face = new FontFace(family, `url(${url}) format('woff2')`, { display: 'swap', ...descriptors });
    face.load().then((f) => document.fonts.add(f)).catch(() => {});
  } catch (e) { /* FontFace unsupported — fall back to the system stack */ }
}

add('InterVar', interNormal, { weight: '100 900', style: 'normal' });
add('FrauncesVar', frauncesNormal, { weight: '100 900', style: 'normal' });
add('FrauncesVar', frauncesItalic, { weight: '100 900', style: 'italic' });
