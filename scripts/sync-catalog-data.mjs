import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const input = process.argv[2];
if (!input) {
  throw new Error("Usage: node scripts/sync-catalog-data.mjs <catalogues.json>");
}

const source = JSON.parse(await readFile(resolve(input), "utf8"));
const complete = Array.isArray(source.complete) ? source.complete : [];
const medical = Array.isArray(source.medical) ? source.medical : [];

const payload = {
  generatedAt: "2026-08-20",
  totals: { complete: complete.length, medical: medical.length, all: complete.length + medical.length },
  complete,
  medical,
};

await writeFile(
  new URL("../app/catalogues.json", import.meta.url),
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

console.log(`Catalogue synchronisé : ${payload.totals.all} formations.`);
