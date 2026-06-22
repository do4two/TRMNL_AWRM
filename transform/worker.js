/**
 * AWRM → TRMNL transform
 * --------------------------------------------------------------------------
 * Fetches the official AWIDO/CubeFour waste-collection calendar for a single
 * address and returns a tiny, display-ready JSON document that a TRMNL Private
 * Plugin (Polling strategy) can consume directly in Liquid.
 *
 * Source (verified, see README):
 *   https://awido.cubefour.de/WebServices/Awido.Service.svc/secure/getData/{oid}?fractions=&client=rmk
 *
 * Default address: Ina-Seidel-Straße 18, 73630 Remshalden (Geradstetten)
 *   client = rmk
 *   oid    = 3d6a2719-0000-0000-0000-000000000000
 *
 * Runtime: standard Web `fetch` handler. Runs unchanged on
 *   - Cloudflare Workers   (export default { fetch })
 *   - Deno Deploit / Deno  (Deno.serve(handler))
 *   - Val.town             (export default handler)
 *   - Node 18+ via CLI:    `node worker.js`  (prints JSON to stdout)
 *
 * All date logic is anchored to Europe/Berlin. Holiday shifts are NOT
 * computed here — they are already baked into the source calendar.
 */

const AWIDO_BASE =
  "https://awido.cubefour.de/WebServices/Awido.Service.svc/secure";

// --- Defaults for the target address (override via env or query params) ----
const DEFAULTS = {
  client: "rmk",
  oid: "3d6a2719-0000-0000-0000-000000000000",
  address: "Ina-Seidel-Str. 18, Remshalden",
  // Fraction short-codes (snm) to hide from the "next bin" view.
  // UM = Umweltmobil (a mobile hazardous-waste truck you visit, not a bin
  // you put out), so it is excluded by default. Override with ?exclude=
  exclude: ["UM"],
  // How many upcoming collection DAYS to return (after same-day grouping).
  limit: 8,
};

// --- Clean display labels per AWIDO fraction short-code (snm) ---------------
// `name`  : full German label shown on screen
// `tag`   : short high-contrast badge text for e-ink (no color reliance)
// `group` : merge key, so e.g. the 2-weekly and 4-weekly Restmüll variants
//           that share a day collapse into a single "Restmüll" entry.
const LABELS = {
  R2:  { name: "Restmüll",     tag: "REST", group: "rest" },
  R4:  { name: "Restmüll",     tag: "REST", group: "rest" },
  RC1: { name: "Restmüll",     tag: "REST", group: "rest" },
  RC2: { name: "Restmüll",     tag: "REST", group: "rest" },
  BT:  { name: "Biotonne",     tag: "BIO",  group: "bio" },
  PT:  { name: "Papier",       tag: "PAP",  group: "papier" },
  GT:  { name: "Gelbe Tonne",  tag: "GELB", group: "gelb" },
  GG:  { name: "Grüngut",      tag: "GRÜN", group: "gruengut" },
  CB:  { name: "Christbäume",  tag: "BAUM", group: "christbaum" },
  KS:  { name: "Kartonagen",   tag: "KART", group: "karton" },
  UM:  { name: "Umweltmobil",  tag: "UM",   group: "umweltmobil" },
};

const WD_LONG = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
const WD_SHORT = ["So","Mo","Di","Mi","Do","Fr","Sa"];

// ---------------------------------------------------------------------------
// Date helpers — all calendar-date math, no wall-clock time, so DST is a
// non-issue. "Today" is the current civil date in Europe/Berlin.
// ---------------------------------------------------------------------------

/** Current civil date in Berlin as {y,m,d} integers. */
function berlinToday(now = new Date()) {
  // en-CA renders as YYYY-MM-DD
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** Parse "YYYYMMDD" → {y,m,d}. */
function parseYmd(s) {
  return { y: +s.slice(0, 4), m: +s.slice(4, 6), d: +s.slice(6, 8) };
}

/** Whole-day difference b - a (both {y,m,d}), using UTC anchors. */
function daysBetween(a, b) {
  const ua = Date.UTC(a.y, a.m - 1, a.d);
  const ub = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((ub - ua) / 86400000);
}

function jsWeekday({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
}

const pad2 = (n) => String(n).padStart(2, "0");
const ymdHuman = ({ y, m, d }) => `${pad2(d)}.${pad2(m)}.${y}`;
const ymdIso = ({ y, m, d }) => `${y}-${pad2(m)}-${pad2(d)}`;

function relativeLabel(days) {
  if (days === 0) return "Heute";
  if (days === 1) return "Morgen";
  if (days === 2) return "Übermorgen";
  return `in ${days} Tagen`;
}
function badgeLabel(days) {
  if (days === 0) return "HEUTE";
  if (days === 1) return "MORGEN";
  return "";
}

/** Human "last refresh" stamp in Berlin, e.g. "19.06.2026, 21:05". */
function berlinStamp(now = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(now).replace(",", "");
}

// ---------------------------------------------------------------------------
// Core transform
// ---------------------------------------------------------------------------

async function buildPayload(opts) {
  const { client, oid, address, exclude, limit } = opts;
  const now = new Date();
  const today = berlinToday(now);

  const base = {
    address,
    generated_at: now.toISOString(),
    generated_at_human: berlinStamp(now),
    today: ymdIso(today),
    source: "AWRM / awido.cubefour.de (client=" + client + ")",
    next: null,
    upcoming: [],
    count: 0,
    has_pickups: false,
    error: null,
  };

  let raw;
  try {
    const url = `${AWIDO_BASE}/getData/${encodeURIComponent(oid)}?fractions=&client=${encodeURIComponent(client)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "awrm-trmnl-transform/1.0" },
    });
    if (!res.ok) throw new Error(`awido HTTP ${res.status}`);
    raw = await res.json();
  } catch (e) {
    base.error = `Quelle nicht erreichbar: ${e.message}`;
    return base;
  }

  const calendar = Array.isArray(raw && raw.calendar) ? raw.calendar : null;
  if (!calendar) {
    base.error = "Unerwartetes Antwortformat (kein calendar).";
    return base;
  }

  // Fallback names from the source, in case AWIDO adds a new fraction code
  // we don't have a hand-tuned label for yet.
  const apiNames = {};
  for (const f of raw.fracts || []) apiNames[f.snm] = f.nm;

  const excludeSet = new Set(exclude);

  // Group future collections by date (YYYYMMDD).
  const byDay = new Map();
  for (const entry of calendar) {
    if (!entry || !entry.dt || !Array.isArray(entry.fr) || entry.fr.length === 0) continue;
    const d = parseYmd(entry.dt);
    if (daysBetween(today, d) < 0) continue; // past

    for (const code of entry.fr) {
      if (excludeSet.has(code)) continue;
      const def = LABELS[code] || {
        name: apiNames[code] || code, tag: code, group: code,
      };
      if (!byDay.has(entry.dt)) byDay.set(entry.dt, { dt: entry.dt, items: new Map() });
      const day = byDay.get(entry.dt);
      // Dedupe by merge-group so Restmüll variants collapse to one item.
      if (!day.items.has(def.group)) {
        day.items.set(def.group, { name: def.name, tag: def.tag, code });
      }
    }
  }

  const days = [...byDay.values()]
    .filter((d) => d.items.size > 0)
    .sort((a, b) => (a.dt < b.dt ? -1 : 1));

  const upcoming = days.slice(0, limit).map((day) => {
    const d = parseYmd(day.dt);
    const diff = daysBetween(today, d);
    const wd = jsWeekday(d);
    const items = [...day.items.values()];
    return {
      date: ymdIso(d),
      date_human: ymdHuman(d),
      day: pad2(d.d),
      month: pad2(d.m),
      weekday: WD_LONG[wd],
      weekday_short: WD_SHORT[wd],
      days_until: diff,
      relative: relativeLabel(diff),
      is_today: diff === 0,
      is_tomorrow: diff === 1,
      is_soon: diff <= 1,
      badge: badgeLabel(diff),
      items,
      items_text: items.map((i) => i.name).join(" + "),
      tags_text: items.map((i) => i.tag).join(" "),
    };
  });

  base.upcoming = upcoming;
  base.next = upcoming[0] || null;
  base.count = upcoming.length;
  base.has_pickups = upcoming.length > 0;
  if (!base.has_pickups && !base.error) {
    base.error = "Keine kommenden Termine in der Quelle (Kalender ggf. abgelaufen).";
  }
  return base;
}

// ---------------------------------------------------------------------------
// Request → options
// ---------------------------------------------------------------------------
function resolveOpts(reqUrl, env) {
  env = env || {};
  const q = reqUrl ? new URL(reqUrl).searchParams : new URLSearchParams();
  const pick = (key, dflt) => q.get(key) ?? env[key.toUpperCase()] ?? dflt;

  const excludeRaw = pick("exclude", null);
  const exclude = excludeRaw === null
    ? DEFAULTS.exclude
    : excludeRaw.split(",").map((s) => s.trim()).filter(Boolean);

  return {
    client: pick("client", DEFAULTS.client),
    oid: pick("oid", DEFAULTS.oid),
    address: pick("address", DEFAULTS.address),
    exclude,
    limit: Number(pick("limit", DEFAULTS.limit)) || DEFAULTS.limit,
  };
}

async function handler(request, env) {
  const opts = resolveOpts(request.url, env);
  const payload = await buildPayload(opts);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      // TRMNL polls ~1×/day; let any intermediary cache for 6h.
      "Cache-Control": "public, max-age=21600",
    },
  });
}

// --- Cloudflare Workers / Val.town -----------------------------------------
export default { fetch: handler };

// --- Deno Deploy ------------------------------------------------------------
// (uncomment when deploying to Deno)
// if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(handler);

// --- Node CLI (local testing): `node worker.js [?query]` --------------------
if (typeof process !== "undefined" && process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv[2] || "";
  const fakeUrl = "http://local/" + (query.startsWith("?") ? query : (query ? "?" + query : ""));
  buildPayload(resolveOpts(fakeUrl, process.env))
    .then((p) => { console.log(JSON.stringify(p, null, 2)); })
    .catch((e) => { console.error(e); process.exit(1); });
}

export { buildPayload, resolveOpts, handler };
