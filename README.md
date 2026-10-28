# Tu o Bezpieczeństwie · Redakcja

Dashboard redakcji programu „Tu o Bezpieczeństwie” (ToTU): Media Brief z głosowaniem, Research Brief z selekcją i Kartki odcinka.

- `docs/` — statyczna strona na GitHub Pages (bez danych; wszystko pobiera z API po haśle).
- `worker/` — API na Cloudflare Workers z bazą D1 `tuobez-redakcja`.
- `scripts/push-brief.mjs` — wgrywa briefy: `TUOBEZ_API=... ADMIN_TOKEN=... node scripts/push-brief.mjs <RRRR-MM-DD> <media|research|content> <plik.json>`
