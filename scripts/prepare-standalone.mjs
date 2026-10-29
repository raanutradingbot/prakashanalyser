// Next's `output: "standalone"` build emits a self-contained server at
// .next/standalone/server.js, but it doesn't bring static assets or /public
// along — those have to be copied in manually (the Dockerfile does the same
// three copies). Desktop packaging needs that same self-contained folder, so
// this script does it once, after `next build`, for either consumer to use.
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error('No .next/standalone found. Run "npm run build" first (next.config.ts sets output: "standalone").');
  process.exit(1);
}

const staticSrc = join(root, ".next", "static");
const staticDest = join(standalone, ".next", "static");
rmSync(staticDest, { recursive: true, force: true });
cpSync(staticSrc, staticDest, { recursive: true });

const publicSrc = join(root, "public");
const publicDest = join(standalone, "public");
rmSync(publicDest, { recursive: true, force: true });
cpSync(publicSrc, publicDest, { recursive: true });

console.log("Prepared self-contained build at .next/standalone (static assets + public copied in).");
