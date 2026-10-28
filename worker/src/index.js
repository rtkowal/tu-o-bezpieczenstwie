// Tu o Bezpieczeństwie · Redakcja — API (Cloudflare Worker + D1)
// Hasło redakcji: sekret DASHBOARD_PASSWORD. Zapis briefów: sekret ADMIN_TOKEN.
const EDITABLE = new Set(["votes", "selections", "episodes"]);
const ALL = new Set(["votes", "selections", "episodes", "briefs"]);
const TTL = 60 * 60 * 24 * 30; // token ważny 30 dni

function cors(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : allowed[0],
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Vary": "Origin",
  };
}
const json = (body, status, h) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...h } });

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function makeToken(env) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  return `v1.${exp}.${await hmac(env.TOKEN_SECRET, "v1." + exp)}`;
}
async function role(env, req) {
  const a = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!a) return null;
  if (env.ADMIN_TOKEN && a === env.ADMIN_TOKEN) return "admin";
  if (env.BOT_TOKEN && a === env.BOT_TOKEN) return "bot"; // automat: tylko briefy i odcinki
  const [v, exp, sig] = a.split(".");
  if (v !== "v1" || !exp || Number(exp) < Date.now() / 1000) return null;
  return sig === (await hmac(env.TOKEN_SECRET, "v1." + exp)) ? "editor" : null;
}

export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean); // api, ...

    try {
      if (p[0] !== "api") return json({ error: "not_found" }, 404, h);

      if (p[1] === "login" && req.method === "POST") {
        const { password } = await req.json().catch(() => ({}));
        if (!env.DASHBOARD_PASSWORD || password !== env.DASHBOARD_PASSWORD) return json({ error: "Złe hasło." }, 401, h);
        return json({ token: await makeToken(env) }, 200, h);
      }

      const r = await role(env, req);
      if (!r) return json({ error: "Zaloguj się hasłem redakcji." }, 401, h);

      // GET /api/list/:coll[?field=date&eq=2026-10-13]
      if (p[1] === "list" && req.method === "GET") {
        const coll = p[2];
        if (!ALL.has(coll)) return json({ error: "bad_collection" }, 400, h);
        const field = url.searchParams.get("field"), eq = url.searchParams.get("eq");
        const stmt = field
          ? env.DB.prepare("SELECT id,data,version FROM docs WHERE collection=? AND json_extract(data,'$.'||?)=? ORDER BY id").bind(coll, field, eq)
          : env.DB.prepare("SELECT id,data,version FROM docs WHERE collection=? ORDER BY id").bind(coll);
        const { results } = await stmt.all();
        return json({ docs: results.map(x => ({ id: x.id, version: x.version, data: JSON.parse(x.data) })) }, 200, h);
      }

      // GET|PUT /api/doc/:coll/:id
      if (p[1] === "doc" && p[2] && p[3]) {
        const coll = p[2], id = decodeURIComponent(p[3]);
        if (!ALL.has(coll)) return json({ error: "bad_collection" }, 400, h);
        if (req.method === "GET") {
          const row = await env.DB.prepare("SELECT data,version FROM docs WHERE collection=? AND id=?").bind(coll, id).first();
          return json(row ? { exists: true, version: row.version, data: JSON.parse(row.data) } : { exists: false }, 200, h);
        }
        if (req.method === "PUT") {
          if (r === "bot" && coll !== "briefs" && coll !== "episodes") return json({ error: "Automat zapisuje tylko briefy." }, 403, h);
          if (r !== "admin" && r !== "bot" && !EDITABLE.has(coll)) return json({ error: "Tylko maszyna zapisuje briefy." }, 403, h);
          const body = await req.text();
          if (body.length > 900_000) return json({ error: "too_large" }, 413, h);
          JSON.parse(body);
          await env.DB.prepare(
            "INSERT INTO docs(collection,id,data,version,updated_at) VALUES(?,?,?,1,datetime('now')) " +
            "ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data, version=docs.version+1, updated_at=datetime('now')"
          ).bind(coll, id, body).run();
          return json({ ok: true }, 200, h);
        }
      }
      return json({ error: "not_found" }, 404, h);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500, h);
    }
  },
};
