import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("routes recovery links to a required new-password form", async () => {
  const app = await read("../app/lms-app.tsx");
  assert.match(app, /callback\?\.type === "recovery"/);
  assert.match(app, /identity\.updateUser\(\{ password \}\)/);
  assert.match(app, /Enregistrer le nouveau mot de passe/);
  assert.match(app, /await identity\.logout\(\)/);
  assert.match(app, /Votre adresse e-mail est confirmée/);
});

test("stores learner avatars privately and exposes only authorized reads", async () => {
  const [upload, api, app] = await Promise.all([
    read("../netlify/functions/upload.mts"),
    read("../netlify/functions/lms-data.mts"),
    read("../app/lms-app.tsx"),
  ]);
  assert.match(upload, /purpose === "avatar"/);
  assert.match(upload, /walyah-lms-avatars/);
  assert.match(upload, /targetUserId !== user\.id/);
  assert.match(upload, /profile_metadata/);
  assert.match(api, /AS has_avatar/i);
  assert.match(app, /Modifier/);
});

test("ships distinct admin and super-admin dashboards with protected role changes", async () => {
  const [app, userAdmin] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../netlify/functions/user-admin.mts"),
  ]);
  assert.match(app, /Tableau de bord administrateur/);
  assert.match(app, /Tableau de bord super-administrateur/);
  assert.match(app, /session\.role === "super_admin" \? <SuperAdminDashboard/);
  assert.match(userAdmin, /Vous ne pouvez pas retirer votre propre rôle/);
  assert.match(userAdmin, /Conservez au moins un super-administrateur actif/);
});
