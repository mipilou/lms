import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ships no demonstration access or fictional learner fallback", async () => {
  const [app, data, activityDocs] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../app/data.ts"),
    read("../docs/PASSEPORT-INTEGRATION.md"),
  ]);
  const combined = `${app}\n${data}\n${activityDocs}`;
  assert.doesNotMatch(combined, /accès de démonstration/i);
  assert.doesNotMatch(combined, /Arielle Ndong|Marc Obame|Sarah Bekale|Carène Moussavou|Dimitri Essono|Franck Mouketou/i);
  assert.match(app, /Aucune formation ne vous a encore été assignée/);
});

test("creates learner accounts without automatic enrollment", async () => {
  const [identity, userAdmin, cleanup] = await Promise.all([
    read("../netlify/functions/identity.mts"),
    read("../netlify/functions/user-admin.mts"),
    read("../netlify/database/migrations/20260822000100_remove_automatic_enrollments.sql"),
  ]);
  assert.doesNotMatch(identity, /INSERT INTO enrollments/i);
  assert.doesNotMatch(userAdmin, /courseIds|INSERT INTO enrollments/i);
  assert.match(cleanup, /DELETE FROM enrollments/i);
  assert.match(cleanup, /assignment_source/i);
});

test("returns only explicitly assigned courses to a learner", async () => {
  const api = await read("../netlify/functions/lms-data.mts");
  assert.match(api, /JOIN enrollments e ON e\.course_id = c\.id AND e\.user_id = \$\{user\.id\}/);
  assert.match(api, /Ce module ne fait pas partie de vos formations assignées/);
});
