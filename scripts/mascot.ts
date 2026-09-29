/**
 * Renders the mascot sprite (src/tui/mascot.ts) to the images in docs/assets.
 *
 *   bun scripts/mascot.ts          # btk-mascot.svg, btk-banner.svg
 *   bun scripts/mascot.ts --png    # also btk-banner.png (2560x1280), through headless Chrome
 *
 * Chrome is found through $CHROME, then the usual install locations.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ACCENT } from "../src/output/palette.ts";
import { mascotPixels } from "../src/tui/mascot.ts";
import { VERSION } from "../src/version.ts";

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { png: { type: "boolean" } } });

const OUT = join(import.meta.dir, "..", "docs", "assets");
const pixels = mascotPixels();
const SH = pixels.length;
const SW = pixels[0]?.length ?? 0;

/** One unit per pixel; runs of the same color become one rect. `fill` paints every pixel one color (the shadow). */
function spriteRects(fill?: string) {
  const out: string[] = [];
  pixels.forEach((row, y) => {
    let x = 0;
    while (x < SW) {
      const color = row[x];
      if (!color) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < SW && (fill ? row[end] : row[end] === color)) end++;
      out.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill ?? color}"/>`);
      x = end;
    }
  });
  return out.join("");
}

const mascotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW * 16}" height="${SH * 16}" viewBox="0 0 ${SW} ${SH}" shape-rendering="crispEdges">
<title>btk mascot</title>
${spriteRects()}
</svg>
`;

// ---- banner: the mascot inside the btk TUI frame, 1280x640 ----------------
const W = 1280;
const H = 640;
const FONT = "'SF Mono', 'JetBrains Mono', Menlo, monospace";
const MUTED = "#8B93A7";
const TEXT = "#E6E8EE";
const CELL = 13;
const box = { x: 48, y: 104, w: W - 96, h: 446 };
const artX = box.x + 44;
const artY = box.y + Math.round((box.h - SH * CELL) / 2) - 6;
const textX = artX + SW * CELL + 56;

let hintX = box.x + 18;
const hintSpans = [
  ["↑↓", "move"],
  ["enter", "open"],
  ["?", "help"],
  ["q", "quit"],
]
  .map(([key = "", label = ""]) => {
    const span = `<tspan x="${hintX}" fill="#FFFFFF" font-weight="700">${key}</tspan><tspan fill="${MUTED}"> ${label}</tspan>`;
    hintX += (key.length + label.length + 4) * 12.6;
    return span;
  })
  .join("");

const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#FFFFFF" opacity="0.06"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="#000" opacity="0.18"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="#0A0A0F"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>

  <text x="${box.x + 4}" y="74" font-family="${FONT}" font-size="22">
    <tspan fill="${ACCENT}" font-weight="700">◆ bun-toolkit</tspan><tspan fill="${MUTED}"> ❯ </tspan><tspan fill="${TEXT}">home</tspan>
  </text>
  <text x="${W - box.x - 4}" y="74" font-family="${FONT}" font-size="20" fill="${MUTED}" text-anchor="end">v${VERSION} · bun 1.4</text>

  <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="18" fill="#101016" stroke="${ACCENT}" stroke-width="2.5"/>
  <ellipse cx="${artX + (SW * CELL) / 2}" cy="${artY + (SH * CELL) / 2 + 10}" rx="300" ry="220" fill="url(#glow)"/>
  <g shape-rendering="crispEdges">
    <g transform="translate(${artX + CELL} ${artY + CELL}) scale(${CELL})">${spriteRects(ACCENT)}</g>
    <g transform="translate(${artX} ${artY}) scale(${CELL})">${spriteRects()}</g>
  </g>

  <g font-family="${FONT}">
    <text x="${textX}" y="${box.y + 150}" font-size="112" font-weight="800" fill="#FFFFFF" letter-spacing="-4">btk</text>
    <rect x="${textX + 214}" y="${box.y + 70}" width="36" height="84" fill="${ACCENT}"/>
    <text x="${textX + 4}" y="${box.y + 196}" font-size="22" fill="${MUTED}">Bun native API straight in your terminal</text>
    <text x="${textX + 4}" y="${box.y + 268}" font-size="22">
      <tspan fill="${ACCENT}" font-weight="700">❯</tspan><tspan fill="${TEXT}"> btk image ./photos --to webp</tspan>
    </text>
    <text x="${textX + 4}" y="${box.y + 306}" font-size="22">
      <tspan fill="#4ADE80">✔</tspan><tspan fill="${TEXT}"> 48 files</tspan><tspan fill="${MUTED}"> · 12.4 MB → 3.1 MB · 1.2s</tspan>
    </text>
    <text x="${textX + 4}" y="${box.y + 344}" font-size="22" fill="${MUTED}">• one CLI · one config · one output style</text>
  </g>

  <text y="${box.y + box.h + 44}" font-family="${FONT}" font-size="20">${hintSpans}</text>

  <rect width="${W}" height="${H}" fill="url(#scan)"/>
</svg>
`;

await Bun.write(join(OUT, "btk-mascot.svg"), mascotSvg);
await Bun.write(join(OUT, "btk-banner.svg"), bannerSvg);
console.log(`wrote ${join(OUT, "btk-mascot.svg")}\nwrote ${join(OUT, "btk-banner.svg")}`);

if (values.png) {
  const chrome = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    Bun.which("google-chrome"),
    Bun.which("chromium"),
  ].find((path): path is string => !!path && existsSync(path));
  if (!chrome) {
    console.error("no Chrome found: set $CHROME to render the PNG");
    process.exit(1);
  }
  const png = join(OUT, "btk-banner.png");
  const proc = Bun.spawnSync([
    chrome,
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=2",
    `--window-size=${W},${H}`,
    `--screenshot=${png}`,
    `file://${join(OUT, "btk-banner.svg")}`,
  ]);
  if (proc.exitCode !== 0) {
    console.error(proc.stderr.toString());
    process.exit(1);
  }
  console.log(`wrote ${png}`);
}
