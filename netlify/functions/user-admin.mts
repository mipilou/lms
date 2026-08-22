import { getDatabase } from "@netlify/database";
import { admin, getUser, requestPasswordRecovery, verifyRequestOrigin } from "@netlify/identity";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}aA!9`;
}

const handler = async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  verifyRequestOrigin(request);
  const current = await getUser();
  if (!current) return json({ error: "Authentification requise" }, 401);
  const isSuperAdmin = current.roles?.includes("super_admin") ?? false;
  const isStaff = isSuperAdmin || (current.roles?.includes("admin") ?? false);
  if (!isStaff) return json({ error: "Accès administrateur requis" }, 403);

  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const db = getDatabase();

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
    const target = await admin.getUser(userId);
    const previousRole = target.roles?.includes("super_admin") ? "super_admin" : target.roles?.includes("admin") ? "admin" : "learner";
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
