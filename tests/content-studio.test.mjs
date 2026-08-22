import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("opens a real course studio from the 2026 catalogue", async () => {
  const source = await readFile(new URL("app/lms-app.tsx", root), "utf8");
  assert.match(source, /const draft = catalogCourseDraft\(selected\)/);
  assert.match(source, /setPreparing\(\{ course: draft, catalog: selected \}\)/);
  assert.match(source, /prepare-catalog-course/);
  assert.match(source, /Modules & contenus/);
  assert.match(source, /Publier la formation/);
});

test("accepts multimedia and validates SCORM packages", async () => {
  const upload = await readFile(new URL("netlify/functions/upload.mts", root), "utf8");
  assert.match(upload, /"mp3", "wav", "m4a", "ogg", "aac"/);
  assert.match(upload, /imsmanifest\.xml/);
  assert.match(upload, /SCORM 2004/);
  assert.match(upload, /maxResourceSize = 50 \* 1024 \* 1024/);
  assert.match(upload, /finalize-resource-upload/);
  assert.match(upload, /maxChunkSize = 3 \* 1024 \* 1024/);
});

test("ships JSON and Excel QCM imports with four question types", async () => {
  const importer = await readFile(new URL("app/quiz-import.ts", root), "utf8");
  const migration = await readFile(new URL("netlify/database/migrations/20260822000200_content_studio_scorm_quizzes.sql", root), "utf8");
  const model = await stat(new URL("public/modeles/qcm-walyah-modele.xlsx", root));
  for (const questionType of ["single", "multiple", "true_false", "short_text"]) {
    assert.match(importer, new RegExp(questionType));
    assert.match(migration, new RegExp(questionType));
  }
  assert.match(importer, /Ligne \$\{line\}/);
  assert.ok(model.size > 5_000, "The Excel import model should be a real XLSX workbook");
});
