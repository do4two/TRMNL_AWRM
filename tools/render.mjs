// Local preview renderer: renders each Liquid template with sample data into
// sample/preview/*.html so you can open them in a browser (or screenshot them).
//
//   cd tools && npm install      # one-time, installs liquidjs
//   node tools/render.mjs        # run from the project root
//
// Optional arg: path to a JSON payload (defaults to sample/output.json).
import { Liquid } from "liquidjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = process.argv[2] || join(ROOT, "sample", "output.json");

const engine = new Liquid();
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const previewDir = join(ROOT, "sample", "preview");
mkdirSync(previewDir, { recursive: true });

const layouts = {
  full: [800, 480],
  half_horizontal: [800, 240],
  half_vertical: [400, 480],
  quadrant: [400, 240],
};

for (const [name, [w, h]] of Object.entries(layouts)) {
  const tpl = readFileSync(join(ROOT, "templates", `${name}.liquid`), "utf8");
  const body = await engine.parseAndRender(tpl, data);
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://usetrmnl.com/css/latest/plugins.css">
<style>body{margin:0;background:#bbb}.screen{width:${w}px;height:${h}px;overflow:hidden}</style>
</head><body class="environment trmnl"><div class="screen">${body}</div></body></html>`;
  writeFileSync(join(previewDir, `${name}.html`), html);
  const leftover = (body.match(/\{\{|\{%/g) || []).length;
  console.log(`${name.padEnd(18)} ${body.length} bytes, unresolved-liquid-tags: ${leftover}`);
}
console.log("Previews written to sample/preview/*.html");
