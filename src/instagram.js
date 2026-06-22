/**
 * Renders the Instagram gallery from our own serverless endpoint (/api/instagram),
 * which fetches via the official Graph API server-side (the access token never
 * reaches the browser). Degrades gracefully to the Follow CTA if unavailable.
 */
export function initInstagram() {
  const grid = document.getElementById('igGrid');
  if (!grid) return;

  // No server when opened as a local file (the portable preview) — show the CTA.
  if (location.protocol === 'file:') { fallback(grid); return; }

  fetch('/api/instagram', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => {
      const items = (data && data.items) || [];
      if (!items.length) return fallback(grid);
      render(grid, items.slice(0, 6));
      if (data.ok === false) {
        // Not yet configured / using sample data — note it for the operator only.
        const note = document.createElement('p');
        note.className = 'ig-note';
        note.textContent = 'Sample preview — connect the Instagram token to show live posts.';
        grid.parentElement.querySelector('.ig-cta')?.after(note);
      }
    })
    .catch(() => fallback(grid));
}

const IG_BADGE = `<svg class="ig-badge" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`;

function render(grid, items) {
  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = '';
  for (const item of items) {
    const a = document.createElement('a');
    a.className = 'ig-tile';
    a.href = item.permalink || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const captionText = (item.caption || '').trim();
    a.setAttribute('aria-label', captionText ? `Instagram post: ${captionText.slice(0, 60)}` : 'Instagram post');

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 600;
    img.height = 600;
    img.alt = captionText ? captionText.slice(0, 100) : 'Instagram post from The Human Talisman';
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => { a.style.display = 'none'; });
    img.src = item.image;

    a.appendChild(img);
    a.insertAdjacentHTML('beforeend', IG_BADGE);
    if (captionText) {
      const cap = document.createElement('div');
      cap.className = 'ig-cap';
      cap.textContent = captionText;
      a.appendChild(cap);
    }
    grid.appendChild(a);
  }
}

function fallback(grid) {
  // Hide the grid; the Follow CTA below it remains the call to action.
  grid.setAttribute('aria-busy', 'false');
  grid.style.display = 'none';
}
