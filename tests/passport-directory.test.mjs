import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("stages Passport collaborators before creating an LMS login", async () => {
  const [migration, sync] = await Promise.all([
    read("../netlify/database/migrations/20260822000300_passport_employee_directory.sql"),
    read("../netlify/functions/passport-sync.mts"),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS passport_employees/i);
  assert.match(migration, /provisioning_status[\s\S]*pending[\s\S]*invited[\s\S]*active/i);
  assert.match(sync, /eventType === "employee\.upsert"/);
  assert.match(sync, /INSERT INTO passport_employees/i);
  assert.doesNotMatch(sync, /INSERT INTO users/i);
});

test("provisions a selected Passport collaborator through Netlify Identity", async () => {
  const adminFunction = await read("../netlify/functions/user-admin.mts");
  assert.match(adminFunction, /scope"\) !== "passport-directory"/);
  assert.match(adminFunction, /action === "invite-passport-employee"/);
  assert.match(adminFunction, /findIdentityUserByEmail/);
  assert.match(adminFunction, /admin\.createUser/);
  assert.match(adminFunction, /requestPasswordRecovery\(email\)/);
  assert.match(adminFunction, /INSERT INTO passport_connections/);
  assert.doesNotMatch(adminFunction, /INSERT INTO enrollments/i);
});

test("exposes a controlled Passport-first access workflow", async () => {
  const [app, identity] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../netlify/functions/identity.mts"),
  ]);
  assert.match(app, /Depuis le Passeport/);
  assert.match(app, /Sélectionnez un nouveau collaborateur/);
  assert.match(app, /Créer l’accès/);
  assert.match(app, /Saisie exceptionnelle/);
  assert.doesNotMatch(app, /identity\.signup/);
  assert.doesNotMatch(app, />Créer un compte</);
  assert.match(identity, /UPDATE passport_employees SET provisioning_status = 'active'/);
});

test("documents ownership, matching and the empty learner start", async () => {
  const guide = await read("../docs/PASSEPORT-INTEGRATION.md");
  assert.match(guide, /Le Passeport est la source RH/);
  assert.match(guide, /identifiant externe du Passeport, matricule, puis e-mail/);
  assert.match(guide, /reste vide jusqu’à l’affectation explicite d’un parcours/);
  assert.match(guide, /PASSPORT_WEBHOOK_SECRET/);
  assert.match(guide, /passeportcdl\.netlify\.app/);
});
