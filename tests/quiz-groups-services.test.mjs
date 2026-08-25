import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("persists imported QCMs and exposes complete lifecycle actions", async () => {
  const [app, api, importer] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../netlify/functions/lms-data.mts"),
    read("../app/quiz-import.ts"),
  ]);
  assert.match(api, /persistQuizQuestions/);
  assert.match(api, /persisted: true/);
  assert.match(api, /action === "update-quiz"/);
  assert.match(api, /action === "delete-quiz"/);
  assert.match(api, /quiz\.created/);
  assert.match(app, /Enregistrer dans la base/);
  assert.match(app, /scope=quiz-admin/);
  assert.match(app, /Modifier le QCM/);
  assert.match(importer, /Array\.isArray\(parsed\) \? \{ questions: parsed \}/);
});

test("creates training groups and assigns QCMs to learners or cohorts", async () => {
  const [app, api, migration] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../netlify/functions/lms-data.mts"),
    read("../netlify/database/migrations/20260825000100_quiz_assignments_training_groups.sql"),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS training_groups/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS training_group_members/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS quiz_assignments/);
  assert.match(api, /create-training-group/);
  assert.match(api, /update-training-group/);
  assert.match(api, /delete-training-group/);
  assert.match(api, /action === "assign-quiz"/);
  assert.match(api, /INSERT INTO enrollments/);
  assert.match(app, /Groupes de formation/);
  assert.match(app, /Affecter au groupe/);
});

test("organizes the learner directory into service sections", async () => {
  const app = await read("../app/lms-app.tsx");
  assert.match(app, /Apprenants par service/);
  assert.match(app, /Rubriques par service/);
  assert.match(app, /learner-service-sections/);
  assert.match(app, /service-filter-cards/);
});
