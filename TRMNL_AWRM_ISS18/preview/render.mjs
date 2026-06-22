// TRMNL X preview renderer.
//
// Rendert Shared + Layout-Markup mit den AWRM-Beispieldaten in die echte
// Plattformstruktur (screen--v2 / view / mashup), damit Full und die Mashup-
// Views vor dem Upload lokal im Browser geprüft werden können.
//
//   make preview                 # aus TRMNL_X_Start/
//   # oder direkt:
//   node preview/render.mjs
//
// liquidjs wird aus ../tools/node_modules aufgelöst (dort bereits installiert).
// Erzeugt: preview/full.html, preview/full_today.html, preview/mashups.html
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url)); // .../TRMNL_X_Start/preview
const XROOT = join(HERE, "..");                        // .../TRMNL_X_Start
const PROOT = join(XROOT, "..");                       // Projekt-Root

// liquidjs aus der vorhandenen tools-Installation auflösen (ESM ignoriert NODE_PATH).
const require = createRequire(join(PROOT, "tools", "package.json"));
const { Liquid } = require("liquidjs");

const engine = new Liquid();
const markup = (name) => readFileSync(join(XROOT, "markup", `${name}.liquid`), "utf8");
const sample = (name) => JSON.parse(readFileSync(join(PROOT, "sample", `${name}.json`), "utf8"));

const shared = markup("shared");
const dataNormal = sample("output");
const dataToday = sample("output_today");
const dataEmpty = {
  ...dataNormal,
  has_pickups: false,
  next: null,
  upcoming: [],
  error: "Keine zukünftigen Termine im Kalender.",
};

const sharedCss = await engine.parseAndRender(shared, {});

async function view(name, viewClass, data) {
  const body = await engine.parseAndRender(markup(name), data);
  return `<div class="view ${viewClass}">${body}</div>`;
}

function page(inner) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://trmnl.com/css/3.1.1/plugins.css">
  <style>html,body{width:1872px;height:1404px;margin:0;overflow:hidden}</style>
  ${sharedCss}
</head>
<body class="trmnl environment">
  <div class="screen screen--v2 screen--4bit">
${inner}
  </div>
</body>
</html>
`;
}

function unresolved(html) {
  return (html.match(/\{\{|\{%/g) || []).length;
}

// --- Full (normal + HEUTE) ---
const fullNormal = await view("full", "view--full", dataNormal);
const fullToday = await view("full", "view--full", dataToday);
writeFileSync(join(HERE, "full.html"), page(fullNormal));
writeFileSync(join(HERE, "full_today.html"), page(fullToday));

// --- Mashups: jede Mashup-View in eigener Datei, realistischer Container ---
const halfH = await view("half_horizontal", "view--half_horizontal", dataNormal);
const halfHToday = await view("half_horizontal", "view--half_horizontal", dataToday);
const halfV = await view("half_vertical", "view--half_vertical", dataNormal);
const halfVToday = await view("half_vertical", "view--half_vertical", dataToday);
const quad = await view("quadrant", "view--quadrant", dataNormal);
const quadToday = await view("quadrant", "view--quadrant", dataToday);
const quadEmpty = await view("quadrant", "view--quadrant", dataEmpty);

// Half horizontal: 1Tx1B (oben normal, unten HEUTE)
writeFileSync(join(HERE, "half_horizontal.html"), page(
  `    <div class="mashup mashup--1Tx1B">\n${halfH}\n${halfHToday}\n    </div>`));
// Half vertical: 1Lx1R (links normal, rechts HEUTE)
writeFileSync(join(HERE, "half_vertical.html"), page(
  `    <div class="mashup mashup--1Lx1R">\n${halfV}\n${halfVToday}\n    </div>`));
// Quadrant: 2x2 (normal, HEUTE, leer, normal)
writeFileSync(join(HERE, "quadrant.html"), page(
  `    <div class="mashup mashup--2x2">\n${quad}\n${quadToday}\n${quadEmpty}\n${quad}\n    </div>`));

const checks = [
  ["full.html", fullNormal],
  ["full_today.html", fullToday],
  ["half_horizontal.html", halfH],
  ["half_vertical.html", halfV],
  ["quadrant.html", quad],
  ["quadrant (empty)", quadEmpty],
];
let bad = 0;
for (const [label, html] of checks) {
  const n = unresolved(html);
  if (n) bad++;
  console.log(`${n ? "FAIL" : "ok  "} ${label.padEnd(28)} ${html.length} bytes, unresolved-liquid: ${n}`);
}
console.log(bad ? `\n${bad} view(s) with unresolved Liquid` : "\nPreviews → preview/{full,full_today,half_horizontal,half_vertical,quadrant}.html");
process.exit(bad ? 1 : 0);
