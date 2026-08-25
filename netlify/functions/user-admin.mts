import { getDatabase } from "@netlify/database";
import { admin, getUser, requestPasswordRecovery, verifyRequestOrigin } from "@netlify/identity";

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
      SELECT pe.id, pe.external_employee_id, pe.matricule, pe.email, pe.full_name, pe.phone,
             pe.department, pe.job_title, pe.manager_name, pe.hire_date, pe.location,
             pe.employment_status, pe.provisioning_status, pe.lms_user_id,
             pe.last_synced_at, pe.invited_at, pe.activated_at, pe.last_error,
             u.last_login_at
      FROM passport_employees pe
      LEFT JOIN users u ON u.id = pe.lms_user_id
      ORDER BY
        CASE pe.provisioning_status WHEN 'pending' THEN 1 WHEN 'error' THEN 2 WHEN 'invited' THEN 3 WHEN 'active' THEN 4 ELSE 5 END,
        pe.full_name
      LIMIT 500
    `;
    return json({ employees: rows });
  }

  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "invite-passport-employee") {
    const directoryId = String(body.directoryId ?? "");
    if (!directoryId) return json({ error: "Collaborateur du Passeport requis" }, 400);
    const rows = await db.sql<Record<string, unknown>>`SELECT * FROM passport_employees WHERE id = ${directoryId} LIMIT 1`;
    const employee = rows[0];
    if (!employee) return json({ error: "Collaborateur introuvable dans l’annuaire du Passeport" }, 404);
    if (String(employee.employment_status) !== "active") return json({ error: "Ce collaborateur n’est pas actif dans le Passeport" }, 409);
    if (employee.lms_user_id) return json({ error: "Un accès LMS existe déjà pour ce collaborateur" }, 409);
    const email = String(employee.email ?? "").trim().toLowerCase();
    const fullName = String(employee.full_name ?? "").trim();
    if (!email) return json({ error: "Ajoutez une adresse e-mail dans le Passeport avant de créer l’accès LMS" }, 409);
    if (!fullName) return json({ error: "Le nom du collaborateur est incomplet" }, 409);

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
      INSERT INTO users (id, email, full_name, role, matricule, phone, department, job_title, manager_name, hire_date, location, status)
      VALUES (${userId}, ${email}, ${fullName}, 'learner', ${employee.matricule ? String(employee.matricule) : null},
        ${employee.phone ? String(employee.phone) : null}, ${employee.department ? String(employee.department) : null},
        ${employee.job_title ? String(employee.job_title) : null}, ${employee.manager_name ? String(employee.manager_name) : null},
        ${employee.hire_date ? String(employee.hire_date) : null}, ${employee.location ? String(employee.location) : null}, 'active')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
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
