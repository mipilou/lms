import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Netlify database migration numbers are unique", async () => {
  const files = (await readdir(new URL("netlify/database/migrations/", root))).filter((file) => file.endsWith(".sql"));
  const numbers = files.map((file) => file.split("_")[0]);
  assert.equal(new Set(numbers).size, numbers.length, `Duplicate migration number detected: ${files.join(", ")}`);
});

test("global search is controlled, keyboard accessible and navigable", async () => {
  const [app, api] = await Promise.all([read("app/lms-app.tsx"), read("netlify/functions/lms-data.mts")]);
  assert.match(app, /onSearchResult/);
  assert.match(app, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(app, /scope=search/);
  assert.match(app, /global-search-results/);
  assert.match(api, /scope === "search"/);
  assert.match(api, /u\.role = 'learner'/);
});

test("AI module manifest follows the versioned Walyah layout", async () => {
  const [importer, api, model] = await Promise.all([
    read("app/ai-module-import.ts"),
    read("netlify/functions/lms-data.mts"),
    read("public/modeles/module-ia-walyah-exemple.json"),
  ]);
  const parsed = JSON.parse(model);
  assert.equal(parsed.schemaVersion, "walyah-lms-module-v1");
  assert.ok(parsed.modules[0].blocks.length >= 8);
  for (const type of ["hero", "objectives", "steps", "callout", "case_study", "knowledge_check", "summary"]) {
    assert.match(importer, new RegExp(type));
  }
  assert.match(api, /import-ai-module/);
  assert.match(api, /lesson_content/);
  assert.match(api, /Module généré par IA importé/);
});

test("Google Drive resources bypass binary upload while retaining strict links", async () => {
  const [picker, app, migration, docs] = await Promise.all([
    read("app/google-drive-picker.ts"),
    read("app/lms-app.tsx"),
    read("netlify/database/migrations/20260825000200_ai_modules_google_drive.sql"),
    read("docs/GOOGLE-DRIVE.md"),
  ]);
  assert.match(picker, /drive\.file/);
  assert.match(picker, /PickerBuilder/);
  assert.match(app, /Coller un lien Drive partagé/);
  assert.match(migration, /'drive'/);
  assert.match(docs, /NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID/);
});
