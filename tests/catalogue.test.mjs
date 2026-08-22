import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contains the two complete 2026 catalogues without duplicate codes", async () => {
  const payload = JSON.parse(await readFile(new URL("../app/catalogues.json", import.meta.url), "utf8"));
  const courses = [...payload.complete, ...payload.medical];
  assert.equal(payload.complete.length, 124);
  assert.equal(payload.medical.length, 20);
  assert.equal(courses.length, 144);
  assert.equal(new Set(courses.map((course) => course.code)).size, 144);
  assert.ok(courses.every((course) => course.code && course.title && course.duration && course.audience));
  assert.ok(payload.medical.every((course) => course.program.length === 5));
});

test("ships governance and passport database migrations", async () => {
  const governance = await readFile(new URL("../netlify/database/migrations/20260820000200_expand_lms_governance.sql", import.meta.url), "utf8");
  const catalogue = await readFile(new URL("../netlify/database/migrations/20260820000300_seed_2026_catalogues.sql", import.meta.url), "utf8");
  const assignmentPolicy = await readFile(new URL("../netlify/database/migrations/20260822000100_remove_automatic_enrollments.sql", import.meta.url), "utf8");
  for (const table of ["certificates", "activity_events", "training_requests", "passport_connections", "integration_events", "role_audit_events"]) {
    assert.match(governance, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.equal((catalogue.match(/\('catalog-/g) ?? []).length, 144);
  assert.match(assignmentPolicy, /assignment_source/);
  assert.match(assignmentPolicy, /DELETE FROM enrollments/);
});
