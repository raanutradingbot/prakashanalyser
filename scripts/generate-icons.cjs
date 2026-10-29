// One-off generator for PWA icons (manifest + apple-touch-icon).
// Run with: node scripts/generate-icons.cjs
const fs = require("node:fs");
const path = require("node:path");
const { ImageResponse } = require("next/og");

const OUT_DIR = path.join(__dirname, "..", "public");

function mark(size, { padding = 0, bg = "#0f1521" } = {}) {
  const p = padding;
  return {
    type: "div",
    props: {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
      },
      children: {
        type: "svg",
        props: {
          width: size - p * 2,
          height: size - p * 2,
          viewBox: "0 0 26 26",
          children: [
            {
              type: "rect",
              props: { x: 0.75, y: 0.75, width: 24.5, height: 24.5, rx: 5, fill: "none", stroke: "#e7ecf3", strokeWidth: 1.5 },
            },
            {
              type: "line",
              props: { x1: 4, y1: 15, x2: 22, y2: 15, stroke: "#e7ecf3", strokeWidth: 1, strokeDasharray: "2 2", opacity: 0.6 },
            },
            {
              type: "polyline",
              props: {
                points: "4,19 9,16 13,17.5 17,10 22,7",
                fill: "none",
                stroke: "#2fd27a",
                strokeWidth: 2.2,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              },
            },
          ],
        },
      },
    },
  };
}

async function render(node, size, name) {
  const res = new ImageResponse(node, { width: size, height: size });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT_DIR, name), buf);
  console.log("wrote", name);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await render(mark(192), 192, "icon-192.png");
  await render(mark(512), 512, "icon-512.png");
  // Maskable icons need safe-zone padding (~10%) since the OS can crop to a shape.
  await render(mark(512, { padding: 51 }), 512, "icon-512-maskable.png");
  await render(mark(180, { padding: 14 }), 180, "apple-touch-icon.png");
}

main();
