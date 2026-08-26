import { getDatabase } from "@netlify/database";
import { admin, getUser, requestPasswordRecovery, verifyRequestOrigin } from "@netlify/identity";
import { PEOPLE_IMPORT_MAX_ROWS, normalizeCanonicalPeopleRows, parseCsvTable, parsePeopleTable } from "../../app/people-import";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}aA!9`;
}

async function findIdentityUserByEmail(email: string) {
  for (let page = 1; page <= 50; page += 1) {
    const users = await admin.listUsers({ page, perPage: 100 });
    const match = users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (match || users.length < 100) return match;
  }
  return undefined;
}

function googleSheetExportUrl(input: string) {
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error("Collez une adresse Google Sheets complète."); }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw new Error("Seuls les liens sécurisés docs.google.com sont acceptés.");
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Ce lien ne correspond pas à une feuille Google Sheets.");
  const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ""));
  const gid = url.searchParams.get("gid") ?? hashParameters.get("gid") ?? "0";
  if (!/^\d+$/.test(gid)) throw new Error("L’onglet Google Sheets sélectionné est invalide.");
  return {
    spreadsheetId: match[1],
    gid,
    url: `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`,
  };
}

async function previewGoogleSheet(input: string) {
  const reference = googleSheetExportUrl(input);
  const response = await fetch(reference.url, {
    headers: { Accept: "text/csv,application/csv;q=0.9,*/*;q=0.1" },
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error("Google Sheets n’a pas autorisé la lecture. Partagez la feuille en mode Lecteur avec toute personne disposant du lien.");
  if (Number(response.headers.get("content-length") ?? 0) > 3_000_000) throw new Error("Cette feuille dépasse la taille maximale autorisée (3 Mo). Importez-la en plusieurs fichiers.");
  const csv = await response.text();
  if (new TextEncoder().encode(csv).byteLength > 3_000_000) throw new Error("Cette feuille dépasse la taille maximale autorisée (3 Mo). Importez-la en plusieurs fichiers.");
  if (/^\s*<!doctype html|^\s*<html/i.test(csv)) throw new Error("La feuille est privée. Activez le partage « Toute personne disposant du lien – Lecteur ».");
  return { ...reference, result: parsePeopleTable(parseCsvTable(csv)) };
}

const handler = async (request: Request) => {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (request.method === "POST") verifyRequestOrigin(request);
  const current = await getUser();
  if (!current) return json({ error: "Authentification requise" }, 401);
  const isSuperAdmin = current.roles?.includes("super_admin") ?? false;
  const isStaff = isSuperAdmin || (current.roles?.includes("admin") ?? false);
  if (!isStaff) return json({ error: "Accès administrateur requis" }, 403);

  const db = getDatabase();

  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("scope") !== "passport-directory") return json({ error: "Périmètre inconnu" }, 400);
    const rows = await db.sql`
      SELECT pe.id, pe.external_employee_id, pe.matricule, pe.email, pe.full_name, pe.first_name,
             pe.last_name, pe.birth_date, pe.import_source, pe.phone,
             pe.department, pe.job_title, pe.manager_name, pe.hire_date, pe.location,
             pe.employment_status, pe.provisioning_status, pe.lms_user_id,
             pe.last_synced_at, pe.invited_at, pe.activated_at, pe.last_error,
             u.last_login_at
      FROM passport_employees pe
      LEFT JOIN users u ON u.id = pe.lms_user_id
      ORDER BY
        CASE pe.provisioning_status WHEN 'pending' THEN 1 WHEN 'error' THEN 2 WHEN 'invited' THEN 3 WHEN 'active' THEN 4 ELSE 5 END,
        pe.full_name
      LIMIT 1000
    `;
    return json({ employees: rows });
  }

  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "preview-google-sheet") {
    try {
      const preview = await previewGoogleSheet(String(body.url ?? "").trim());
      return json({
        rows: preview.result.rows,
        errors: preview.result.errors,
        warnings: preview.result.warnings,
        source: { spreadsheetId: preview.spreadsheetId, gid: preview.gid },
      });
    } catch (caught) {
      return json({ error: caught instanceof Error ? caught.message : "Lecture de la feuille Google Sheets impossible" }, 400);
    }
  }

  if (action === "bulk-import-people") {
    const requestedRows = Array.isArray(body.rows) ? body.rows : [];
    if (!requestedRows.length) return json({ error: "Aucune personne à importer" }, 400);
    if (requestedRows.length > PEOPLE_IMPORT_MAX_ROWS) return json({ error: `Import limité à ${PEOPLE_IMPORT_MAX_ROWS} personnes par opération` }, 400);
    const normalized = normalizeCanonicalPeopleRows(requestedRows);
    if (normalized.errors.length || !normalized.rows.length) {
      return json({ error: "Certaines lignes doivent être corrigées avant l’import.", errors: normalized.errors, warnings: normalized.warnings }, 400);
    }
    const source = String(body.source ?? "excel") === "google_sheets" ? "google_sheets" : "excel";
    const sourceReference = String(body.sourceReference ?? "").trim().slice(0, 500);
    const emailRows = normalized.rows.filter((row) => row.email);
    if (emailRows.length) {
      const incoming = db.sql.values(emailRows.map((row) => [row.matricule, row.email]));
      const conflicts = await db.sql<{ incoming_matricule: string; existing_matricule: string | null; email: string }>`
        WITH incoming(matricule, email) AS (VALUES ${incoming})
        SELECT incoming.matricule AS incoming_matricule, pe.matricule AS existing_matricule, incoming.email
        FROM incoming
        JOIN passport_employees pe ON LOWER(pe.email) = LOWER(incoming.email)
        WHERE pe.matricule IS DISTINCT FROM incoming.matricule
      `;
      if (conflicts.length) {
        return json({ error: `L’e-mail ${conflicts[0].email} appartient déjà au matricule ${conflicts[0].existing_matricule ?? "non renseigné"}. Corrigez le fichier avant l’import.` }, 409);
      }
    }

    const batchId = crypto.randomUUID();
    const metadata = JSON.stringify({ source, sourceReference: sourceReference || null, importedAt: new Date().toISOString() });
    const values = db.sql.values(normalized.rows.map((row) => [
      crypto.randomUUID(), row.matricule, row.email || null, `${row.firstName} ${row.lastName}`.trim(),
      row.firstName, row.lastName, row.birthDate, row.department || null, row.jobTitle, row.hireDate,
      "active", "pending", source, batchId, current.id, metadata,
    ]));
    const imported = await db.sql<{ matricule: string; inserted: boolean }>`
      INSERT INTO passport_employees (
        id, matricule, email, full_name, first_name, last_name, birth_date, department,
        job_title, hire_date, employment_status, provisioning_status, import_source,
        import_batch_id, imported_by, metadata
      ) VALUES ${values}
      ON CONFLICT (matricule) WHERE matricule IS NOT NULL DO UPDATE SET
        email = COALESCE(EXCLUDED.email, passport_employees.email),
        full_name = EXCLUDED.full_name,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        birth_date = EXCLUDED.birth_date,
        department = COALESCE(EXCLUDED.department, passport_employees.department),
        job_title = EXCLUDED.job_title,
        hire_date = EXCLUDED.hire_date,
        employment_status = 'active',
        provisioning_status = CASE WHEN passport_employees.lms_user_id IS NULL THEN 'pending' ELSE passport_employees.provisioning_status END,
        import_source = EXCLUDED.import_source,
        import_batch_id = EXCLUDED.import_batch_id,
        imported_by = EXCLUDED.imported_by,
        metadata = passport_employees.metadata || EXCLUDED.metadata,
        last_synced_at = NOW(), last_error = NULL, updated_at = NOW()
      RETURNING matricule, (xmax = 0) AS inserted
    `;
    await db.sql`
      UPDATE users u SET
        matricule = pe.matricule, full_name = pe.full_name, first_name = pe.first_name,
        last_name = pe.last_name, birth_date = pe.birth_date,
        email = COALESCE(pe.email, u.email), department = COALESCE(pe.department, u.department),
        job_title = pe.job_title, hire_date = pe.hire_date
      FROM passport_employees pe
      WHERE pe.import_batch_id = ${batchId} AND pe.lms_user_id = u.id
    `;
    const created = imported.filter((row) => row.inserted === true || String(row.inserted) === "true").length;
    const updated = imported.length - created;
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${current.id}, 'directory.people.imported', 'import_batch', ${batchId},
        ${`${imported.length} collaborateurs importés dans l’annuaire RH`},
        ${JSON.stringify({ source, sourceReference: sourceReference || null, created, updated, warnings: normalized.warnings.length })})
    `;
    return json({ ok: true, batchId, imported: imported.length, created, updated, warnings: normalized.warnings }, 201);
  }

  if (action === "invite-passport-employee") {
    const directoryId = String(body.directoryId ?? "");
    if (!directoryId) return json({ error: "Collaborateur du Passeport requis" }, 400);
    const rows = await db.sql<Record<string, unknown>>`SELECT * FROM passport_employees WHERE id = ${directoryId} LIMIT 1`;
    const employee = rows[0];
    if (!employee) return json({ error: "Collaborateur introuvable dans l’annuaire du Passeport" }, 404);
    if (String(employee.employment_status) !== "active") return json({ error: "Ce collaborateur n’est pas actif dans le Passeport" }, 409);
    if (employee.lms_user_id) return json({ error: "Un accès LMS existe déjà pour ce collaborateur" }, 409);
    const providedEmail = String(body.email ?? "").trim().toLowerCase();
    const email = String(employee.email ?? providedEmail).trim().toLowerCase();
    const fullName = String(employee.full_name ?? "").trim();
    if (!email) return json({ error: "Ajoutez une adresse e-mail dans le Passeport avant de créer l’accès LMS" }, 409);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "L’adresse e-mail renseignée est invalide" }, 400);
    if (!fullName) return json({ error: "Le nom du collaborateur est incomplet" }, 409);
    if (!employee.email) {
      const emailConflict = await db.sql<{ id: string }>`SELECT id FROM passport_employees WHERE LOWER(email) = ${email} AND id <> ${directoryId} LIMIT 1`;
      if (emailConflict[0]) return json({ error: "Cette adresse e-mail est déjà utilisée par une autre fiche de l’annuaire" }, 409);
      await db.sql`UPDATE passport_employees SET email = ${email}, updated_at = NOW() WHERE id = ${directoryId}`;
    }

    const identityMatch = await findIdentityUserByEmail(email);
    const employeeMatricule = employee.matricule ? String(employee.matricule) : null;
    const databaseMatches = employeeMatricule
      ? await db.sql<{ id: string; last_login_at: string | null }>`SELECT id, last_login_at FROM users WHERE LOWER(email) = ${email} OR matricule = ${employeeMatricule} LIMIT 1`
      : await db.sql<{ id: string; last_login_at: string | null }>`SELECT id, last_login_at FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
    const databaseMatch = databaseMatches[0];
    if (databaseMatch && identityMatch && databaseMatch.id !== identityMatch.id) {
      await db.sql`UPDATE passport_employees SET provisioning_status = 'error', last_error = 'Conflit entre le compte Identity et la base LMS', updated_at = NOW() WHERE id = ${directoryId}`;
      return json({ error: "Un compte utilisant cet e-mail existe avec un identifiant différent. Un rapprochement manuel est nécessaire." }, 409);
    }
    if (databaseMatch && !identityMatch) {
      await db.sql`UPDATE passport_employees SET provisioning_status = 'error', last_error = 'Fiche LMS existante sans compte Netlify Identity', updated_at = NOW() WHERE id = ${directoryId}`;
      return json({ error: "Une ancienne fiche LMS existe sans compte de connexion Netlify. Un rapprochement manuel est nécessaire avant l’invitation." }, 409);
    }

    let userId = identityMatch?.id ?? databaseMatch?.id;
    let invitationSent = false;
    if (!userId) {
      const created = await admin.createUser({
        email,
        password: temporaryPassword(),
        data: {
          role: "learner",
          app_metadata: { roles: ["learner"] },
          user_metadata: { full_name: fullName, department: employee.department ?? undefined, matricule: employee.matricule ?? undefined },
        },
      });
      userId = created.id;
      invitationSent = true;
    }
    if (!userId) return json({ error: "Création du compte impossible" }, 500);

    await db.sql`
      INSERT INTO users (id, email, full_name, first_name, last_name, birth_date, role, matricule, phone, department, job_title, manager_name, hire_date, location, status)
      VALUES (${userId}, ${email}, ${fullName}, ${employee.first_name ? String(employee.first_name) : null},
        ${employee.last_name ? String(employee.last_name) : null}, ${employee.birth_date ? String(employee.birth_date) : null},
        'learner', ${employee.matricule ? String(employee.matricule) : null},
        ${employee.phone ? String(employee.phone) : null}, ${employee.department ? String(employee.department) : null},
        ${employee.job_title ? String(employee.job_title) : null}, ${employee.manager_name ? String(employee.manager_name) : null},
        ${employee.hire_date ? String(employee.hire_date) : null}, ${employee.location ? String(employee.location) : null}, 'active')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
        first_name = COALESCE(EXCLUDED.first_name, users.first_name), last_name = COALESCE(EXCLUDED.last_name, users.last_name),
        birth_date = COALESCE(EXCLUDED.birth_date, users.birth_date),
        matricule = COALESCE(EXCLUDED.matricule, users.matricule), phone = COALESCE(EXCLUDED.phone, users.phone),
        department = COALESCE(EXCLUDED.department, users.department), job_title = COALESCE(EXCLUDED.job_title, users.job_title),
        manager_name = COALESCE(EXCLUDED.manager_name, users.manager_name), hire_date = COALESCE(EXCLUDED.hire_date, users.hire_date),
        location = COALESCE(EXCLUDED.location, users.location)
    `;
    await db.sql`
      UPDATE passport_employees SET lms_user_id = ${userId}, provisioning_status = ${databaseMatch?.last_login_at ? "active" : "invited"},
        invited_at = COALESCE(invited_at, NOW()), activated_at = CASE WHEN ${databaseMatch?.last_login_at ?? null} IS NOT NULL THEN COALESCE(activated_at, NOW()) ELSE activated_at END,
        last_error = NULL, updated_at = NOW()
      WHERE id = ${directoryId}
    `;
    await db.sql`
      INSERT INTO passport_connections (id, user_id, external_employee_id, match_key, sync_status, last_synced_at, metadata)
      VALUES (${crypto.randomUUID()}, ${userId}, ${employee.external_employee_id ? String(employee.external_employee_id) : null}, ${employee.matricule ? "matricule" : "email"}, 'connected', NOW(), ${JSON.stringify({ directoryId })})
      ON CONFLICT (user_id) DO UPDATE SET external_employee_id = COALESCE(EXCLUDED.external_employee_id, passport_connections.external_employee_id),
        match_key = EXCLUDED.match_key, sync_status = 'connected', last_synced_at = NOW(), last_error = NULL, metadata = EXCLUDED.metadata, updated_at = NOW()
    `;
    if (invitationSent) await requestPasswordRecovery(email);
    await db.sql`
      INSERT INTO activity_events (id, user_id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${userId}, ${current.id}, 'passport.employee.provisioned', 'user', ${userId}, 'Accès LMS créé depuis le Passeport', ${JSON.stringify({ email, directoryId, invitationSent })})
    `;
    return json({ ok: true, userId, email, fullName, invitationSent, message: invitationSent ? "Accès créé. Un e-mail de définition du mot de passe a été envoyé." : "Le profil existant a été relié au Passeport." }, 201);
  }

  if (action === "invite-learner") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.fullName ?? "").trim();
    const department = String(body.department ?? "").trim();
    if (!email || !fullName) return json({ error: "Nom et e-mail requis" }, 400);

    const created = await admin.createUser({
      email,
      password: temporaryPassword(),
      data: {
        role: "learner",
        app_metadata: { roles: ["learner"] },
        user_metadata: { full_name: fullName, department },
      },
    });
    await db.sql`
      INSERT INTO users (id, email, full_name, role, department)
      VALUES (${created.id}, ${email}, ${fullName}, 'learner', ${department || null})
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, department = EXCLUDED.department
    `;
    await requestPasswordRecovery(email);
    await db.sql`
      INSERT INTO activity_events (id, user_id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${created.id}, ${current.id}, 'user.invited', 'user', ${created.id}, 'Apprenant invité sans formation', ${JSON.stringify({ email, department })})
    `;
    return json({ ok: true, userId: created.id, message: "Compte créé. Un e-mail de définition du mot de passe a été envoyé." }, 201);
  }

  if (action === "update-role") {
    if (!isSuperAdmin) return json({ error: "Accès super-administrateur requis" }, 403);
    const userId = String(body.userId ?? "");
    const role = String(body.role ?? "");
    if (!userId || !["learner", "admin", "super_admin"].includes(role)) return json({ error: "Utilisateur ou rôle invalide" }, 400);
    if (userId === current.id && role !== "super_admin") return json({ error: "Vous ne pouvez pas retirer votre propre rôle de super-administrateur." }, 409);
    const target = await admin.getUser(userId);
    const previousRole = target.roles?.includes("super_admin") ? "super_admin" : target.roles?.includes("admin") ? "admin" : "learner";
    if (previousRole === "super_admin" && role !== "super_admin") {
      const superAdmins = await db.sql<{ count: number }>`SELECT COUNT(*)::INT AS count FROM users WHERE role = 'super_admin'`;
      if (Number(superAdmins[0]?.count ?? 0) <= 1) return json({ error: "Conservez au moins un super-administrateur actif." }, 409);
    }
    await admin.updateUser(userId, { role, app_metadata: { ...target.appMetadata, roles: [role] } });
    await db.sql`UPDATE users SET role = ${role} WHERE id = ${userId}`;
    await db.sql`
      INSERT INTO role_audit_events (id, actor_id, target_user_id, previous_role, new_role, source)
      VALUES (${crypto.randomUUID()}, ${current.id}, ${userId}, ${previousRole}, ${role}, 'lms_superadmin')
    `;
    return json({ ok: true, role, message: "Rôle mis à jour. La personne doit renouveler sa session." });
  }

  return json({ error: "Action inconnue" }, 400);
};

export default handler;
