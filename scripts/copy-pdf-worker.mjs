// Copies the PDF reader's worker file from node_modules into /public so the browser can load it.
// Runs automatically after "npm install" and before "npm run dev" and "npm run build".
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs");
const to = join(root, "public", "pdf.worker.min.mjs");

if (!existsSync(from)) {
  console.warn("copy-pdf-worker: pdfjs-dist is not installed yet, skipping.");
  process.exit(0);
}
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log("copy-pdf-worker: copied pdf.worker.min.mjs to public/");
