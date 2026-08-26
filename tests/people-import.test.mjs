import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { parseCsvTable, parsePeopleTable } from "../app/people-import.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("normalizes the required HR columns and French dates", () => {
  const result = parsePeopleTable([
    ["matricule", "nom", "prenom", "date_de_naissance", "date_entree", "poste", "service", "email"],
    ["cdl-001", "DUPONT", "Amina", "18/04/1992", "2024-01-15", "Infirmière", "Soins", "amina@example.com"],
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].matricule, "CDL-001");
  assert.equal(result.rows[0].birthDate, "1992-04-18");
  assert.equal(result.rows[0].hireDate, "2024-01-15");
});

test("rejects duplicate matricules and malformed rows before persistence", () => {
  const result = parsePeopleTable([
    ["matricule", "nom", "prenom", "date naissance", "date entrée", "fonction"],
    ["A-1", "MBOUMBA", "Lina", "01/02/1990", "10/01/2025", "Comptable"],
    ["A-1", "MBOUMBA", "Lina", "01/02/1990", "10/01/2025", "Comptable"],
    ["A-3", "", "Noa", "31/02/1990", "10/01/2025", "Technicien"],
  ]);
  assert.equal(result.rows.length, 1);
  assert.match(result.errors.map((item) => item.message).join(" "), /présent plusieurs fois/);
  assert.match(result.errors.map((item) => item.message).join(" "), /nom manquant/);
  assert.match(result.errors.map((item) => item.message).join(" "), /date de naissance invalide/);
});

test("parses quoted Google Sheets CSV exports", () => {
  const rows = parseCsvTable('matricule,nom,prenom,date_de_naissance,date_entree,poste\nA-1,"MBOUMBA, née NGOMA",Lina,01/02/1990,10/01/2025,"Responsable, accueil"\n');
  assert.equal(rows[1][1], "MBOUMBA, née NGOMA");
  assert.equal(rows[1][5], "Responsable, accueil");
});

test("stores bulk imports in the RH directory without creating training assignments", async () => {
  const [migration, server, app] = await Promise.all([
    read("../netlify/database/migrations/20260826000100_bulk_people_import.sql"),
    read("../netlify/functions/user-admin.mts"),
    read("../app/lms-app.tsx"),
  ]);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_date DATE/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS import_batch_id TEXT/);
  assert.match(server, /action === "preview-google-sheet"/);
  assert.match(server, /action === "bulk-import-people"/);
  assert.match(server, /ON CONFLICT \(matricule\).*DO UPDATE/s);
  assert.match(server, /url\.hostname !== "docs\.google\.com"/);
  assert.doesNotMatch(server, /INSERT INTO enrollments/i);
  assert.match(app, /Importer une liste/);
  assert.match(app, /Fichier Excel/);
  assert.match(app, /Google Sheets/);
  assert.match(app, /Aucun compte ni formation n’a été créé automatiquement/);
});

test("ships a downloadable Excel template", async () => {
  const path = new URL("../public/modeles/import-personnes-walyah.xlsx", import.meta.url);
  const [metadata, content] = await Promise.all([stat(path), readFile(path)]);
  assert.ok(metadata.size > 5_000);
  assert.equal(content.subarray(0, 2).toString(), "PK");
});
