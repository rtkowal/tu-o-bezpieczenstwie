// Wgrywa brief do API redakcji.
// Użycie: TUOBEZ_API=https://... ADMIN_TOKEN=... node scripts/push-brief.mjs <data RRRR-MM-DD> <media|research|content> <plik.json>
//        node scripts/push-brief.mjs --all <folder wydania/>   (wgrywa wszystkie wydania i tworzy episodes)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const API = (process.env.TUOBEZ_API || "").replace(/\/$/, "");
const TOKEN = process.env.ADMIN_TOKEN;
if (!API || !TOKEN) { console.error("Ustaw TUOBEZ_API i ADMIN_TOKEN."); process.exit(1); }
async function put(coll, id, data) {
  const r = await fetch(`${API}/api/doc/${coll}/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`${coll}/${id}: ${r.status} ${await r.text()}`);
  console.log("OK", coll, id);
}
async function episode(d) {
  const r = await fetch(`${API}/api/doc/episodes/${d}`, { headers: { Authorization: "Bearer " + TOKEN } });
  if ((await r.json()).exists) return; // nie nadpisuj zatwierdzeń redakcji
  await put("episodes", d, { date: d, createdAt: new Date().toISOString() });
}
const [a, b, c] = process.argv.slice(2);
if (a === "--all") {
  for (const d of readdirSync(b).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
    await episode(d);
    for (const k of ["media", "research", "content"]) { const f = join(b, d, k + ".json"); if (existsSync(f)) await put("briefs", `${d}_${k}`, JSON.parse(readFileSync(f, "utf8"))); }
  }
} else {
  await episode(a);
  await put("briefs", `${a}_${b}`, JSON.parse(readFileSync(c, "utf8")));
}
