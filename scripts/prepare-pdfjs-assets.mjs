import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pdfjsBuild = fileURLToPath(import.meta.resolve("pdfjs-dist/build/pdf.mjs"));
const pdfjsRoot = resolve(dirname(pdfjsBuild), "..");
const publicRoot = resolve(process.cwd(), "public", "pdfjs");

await mkdir(publicRoot, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(join(pdfjsRoot, directory), join(publicRoot, directory), {
    force: true,
    recursive: true,
  });
}

console.log("PDF.js font, CMap, and WASM assets are ready.");
