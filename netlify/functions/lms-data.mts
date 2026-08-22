import { getDatabase } from "@netlify/database";
import { getUser, verifyRequestOrigin } from "@netlify/identity";

type IdentityUser = {
  id: string;
  email?: string;
  roles?: string[];
  user_metadata?: { full_name?: string };
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function certificateNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `WAL-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

const handler = async (request: Request) => {
  const identityUser = await getUser();
  if (!identityUser) return json({ error: "Authentification requise" }, 401);
  const user = identityUser as unknown as IdentityUser;
  const roles = user.roles ?? [];
  const isSuperAdmin = roles.includes("super_admin");
  const isStaff = isSuperAdmin || roles.includes("admin");
  const db = getDatabase();

  if (request.method === "GET") {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "dashboard";

    if (["admin", "catalog", "learner"].includes(scope) && !isStaff) {
      return json({ error: "Accès administrateur requis" }, 403);
    }

    if (scope === "admin") {
      const [totals, learnerRows, recentLogins, recentActivity, dailyLogins, courseStats, quizStats, accounts, roleAudit] = await Promise.all([
        db.sql`
          SELECT
            (SELECT COUNT(*)::INT FROM users WHERE role = 'learner') AS learners,
            (SELECT COUNT(*)::INT FROM courses WHERE published = TRUE) AS published_courses,
            (SELECT COUNT(*)::INT FROM courses WHERE lifecycle_status = 'catalog') AS catalog_courses,
            (SELECT COUNT(*)::INT FROM certificates) AS certificates,
            (SELECT COUNT(*)::INT FROM login_events WHERE occurred_at >= CURRENT_DATE) AS logins_today,
            (SELECT COUNT(*)::INT FROM enrollments WHERE status = 'overdue') AS overdue,
            (SELECT COUNT(*)::INT FROM enrollments WHERE status = 'completed') AS completed_enrollments,
            (SELECT COUNT(*)::INT FROM enrollments WHERE status = 'in_progress') AS in_progress_enrollments,
            (SELECT COUNT(*)::INT FROM enrollments WHERE status = 'assigned') AS assigned_enrollments,
            (SELECT COALESCE(ROUND(AVG(progress_percent)), 0)::INT FROM enrollments) AS completion_rate,
            (SELECT COUNT(*)::INT FROM users WHERE role = 'learner' AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '30 days')) AS inactive_users,
            (SELECT COUNT(DISTINCT user_id)::INT FROM login_events WHERE occurred_at >= NOW() - INTERVAL '7 days') AS active_users_7d,
            (SELECT COUNT(*)::INT FROM users WHERE role = 'admin') AS admins,
            (SELECT COUNT(*)::INT FROM users WHERE role = 'super_admin') AS super_admins,
            (SELECT COUNT(*)::INT FROM passport_connections WHERE sync_status = 'connected') AS passport_connected,
            (SELECT COUNT(*)::INT FROM integration_events WHERE status = 'pending') AS integrations_pending,
            (SELECT COUNT(*)::INT FROM integration_events WHERE status = 'failed') AS integrations_failed
        `,
        db.sql`
          SELECT u.id, u.matricule, u.email, u.full_name, u.department, u.job_title, u.status, u.last_login_at,
                 COALESCE(u.profile_metadata ? 'avatar_storage_key', FALSE) AS has_avatar,
                 COUNT(e.id)::INT AS assigned,
                 COUNT(e.id) FILTER (WHERE e.status = 'completed')::INT AS completed,
                 COALESCE(ROUND(AVG(e.progress_percent)), 0)::INT AS progress
          FROM users u
          LEFT JOIN enrollments e ON e.user_id = u.id
          WHERE u.role = 'learner'
          GROUP BY u.id
          ORDER BY u.last_login_at DESC NULLS LAST
          LIMIT 250
        `,
        db.sql`
          SELECT email, event_type, occurred_at, metadata
          FROM login_events
          ORDER BY occurred_at DESC
          LIMIT 75
        `,
        db.sql`
          SELECT a.event_type, a.summary, a.occurred_at, u.full_name, u.email,
                 CASE WHEN a.entity_type = 'course' THEN c.title ELSE NULL END AS entity_title
          FROM activity_events a
          LEFT JOIN users u ON u.id = a.user_id
          LEFT JOIN courses c ON c.id = a.entity_id
          ORDER BY a.occurred_at DESC
          LIMIT 20
        `,
        db.sql`
          SELECT occurred_at::DATE AS day, COUNT(*)::INT AS count
          FROM login_events
          WHERE occurred_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY occurred_at::DATE
          ORDER BY day
        `,
        db.sql`
          SELECT c.*,
                 COUNT(e.id)::INT AS enrolled,
                 COALESCE(ROUND(AVG(e.progress_percent)), 0)::INT AS completion_rate,
                 (SELECT COUNT(*)::INT FROM modules m WHERE m.course_id = c.id AND m.published = TRUE) AS module_count,
                 COALESCE((
                   SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                     'id', m.id,
                     'title', m.title,
                     'description', m.description,
                     'content_type', m.content_type,
                     'duration_minutes', m.duration_minutes,
                     'learning_objectives', m.learning_objectives,
                     'video_url', m.video_url,
                     'resources', COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('name', r.name, 'resource_type', r.resource_type, 'external_url', CASE WHEN r.resource_type = 'file' THEN '/.netlify/functions/upload?resourceId=' || r.id ELSE r.external_url END) ORDER BY r.created_at) FROM resources r WHERE r.module_id = m.id), '[]'::JSONB)
                   ) ORDER BY m.position)
                   FROM modules m WHERE m.course_id = c.id AND m.published = TRUE
                 ), '[]'::JSONB) AS module_content
          FROM courses c
          LEFT JOIN enrollments e ON e.course_id = c.id
          WHERE c.lifecycle_status <> 'catalog'
          GROUP BY c.id
          ORDER BY c.updated_at DESC, c.title
        `,
        db.sql`
          SELECT q.id, q.title, q.pass_threshold, q.published, c.title AS course_title,
                 COUNT(DISTINCT qq.id)::INT AS question_count,
                 COUNT(DISTINCT qa.user_id)::INT AS participants,
                 COALESCE(ROUND(AVG(qa.score)), 0)::INT AS average_score
          FROM quizzes q
          JOIN courses c ON c.id = q.course_id
          LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
          LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
          GROUP BY q.id, c.id
          ORDER BY q.created_at DESC
        `,
        isSuperAdmin ? db.sql`
          SELECT id, email, full_name, role, status, last_login_at
          FROM users
          ORDER BY CASE role WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, full_name
          LIMIT 250
        ` : Promise.resolve([]),
        isSuperAdmin ? db.sql`
          SELECT r.id, r.previous_role, r.new_role, r.occurred_at,
                 COALESCE(actor.full_name, actor.email, 'Administration') AS actor_name,
                 COALESCE(target.full_name, target.email, 'Utilisateur') AS target_name
          FROM role_audit_events r
          LEFT JOIN users actor ON actor.id = r.actor_id
          LEFT JOIN users target ON target.id = r.target_user_id
          ORDER BY r.occurred_at DESC
          LIMIT 30
        ` : Promise.resolve([]),
      ]);
      return json({ totals: totals[0], learners: learnerRows, recentLogins, recentActivity, dailyLogins, courseStats, quizStats, accounts, roleAudit, role: isSuperAdmin ? "super_admin" : "admin" });
    }

    if (scope === "catalog") {
      const rows = await db.sql`
        SELECT id, code, title, category, axis, audience, source_catalog, description, need,
               objective, methods, benefit, program, duration_minutes, published, lifecycle_status
        FROM courses
        ORDER BY source_catalog, code
      `;
      return json({ courses: rows });
    }

    if (scope === "learner") {
      const learnerId = url.searchParams.get("id");
      if (!learnerId) return json({ error: "id apprenant requis" }, 400);
      const [profile, enrollments, attempts, certificates, logins, activity, passport] = await Promise.all([
        db.sql`SELECT id, matricule, email, full_name, role, department, phone, job_title, manager_name, hire_date, location, status, created_at, last_login_at, COALESCE(profile_metadata ? 'avatar_storage_key', FALSE) AS has_avatar FROM users WHERE id = ${learnerId} LIMIT 1`,
        db.sql`
          SELECT e.id, e.status, e.progress_percent, e.assigned_at, e.due_at, e.completed_at,
                 c.id AS course_id, c.code, c.title, c.category,
                 COUNT(m.id)::INT AS modules,
                 COUNT(mp.id) FILTER (WHERE mp.completed = TRUE)::INT AS completed_modules
          FROM enrollments e
          JOIN courses c ON c.id = e.course_id
          LEFT JOIN modules m ON m.course_id = c.id AND m.published = TRUE
          LEFT JOIN module_progress mp ON mp.module_id = m.id AND mp.user_id = e.user_id
          WHERE e.user_id = ${learnerId}
          GROUP BY e.id, c.id
          ORDER BY e.assigned_at DESC
        `,
        db.sql`
          SELECT qa.id, qa.score, qa.passed, qa.submitted_at, q.title, c.id AS course_id, c.code, c.title AS course_title
          FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id JOIN courses c ON c.id = q.course_id
          WHERE qa.user_id = ${learnerId} ORDER BY qa.submitted_at DESC LIMIT 50
        `,
        db.sql`SELECT certificate_number, course_id, score, issued_at, expires_at FROM certificates WHERE user_id = ${learnerId} ORDER BY issued_at DESC`,
        db.sql`SELECT event_type, occurred_at, metadata FROM login_events WHERE user_id = ${learnerId} ORDER BY occurred_at DESC LIMIT 40`,
        db.sql`SELECT event_type, summary, metadata, occurred_at FROM activity_events WHERE user_id = ${learnerId} ORDER BY occurred_at DESC LIMIT 80`,
        db.sql`SELECT external_employee_id, match_key, sync_status, last_synced_at, last_error FROM passport_connections WHERE user_id = ${learnerId} LIMIT 1`,
      ]);
      if (!profile[0]) return json({ error: "Apprenant introuvable" }, 404);
      return json({ profile: profile[0], enrollments, attempts, certificates, logins, activity, passport: passport[0] ?? null });
    }

    const [courseRows, profile, certificates, activity] = await Promise.all([
      db.sql`
        SELECT c.*,
               (SELECT COUNT(*)::INT FROM modules m WHERE m.course_id = c.id AND m.published = TRUE) AS module_count,
               (SELECT COUNT(*)::INT FROM module_progress mp JOIN modules m ON m.id = mp.module_id WHERE m.course_id = c.id AND mp.user_id = ${user.id} AND mp.completed = TRUE) AS completed_modules,
               COALESCE(e.progress_percent, 0)::INT AS progress_percent,
               e.status AS enrollment_status,
               e.due_at,
               COALESCE((
                 SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                   'id', m.id,
                   'title', m.title,
                   'description', m.description,
                   'content_type', m.content_type,
                   'duration_minutes', m.duration_minutes,
                   'learning_objectives', m.learning_objectives,
                   'video_url', m.video_url,
                   'resources', COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('name', r.name, 'resource_type', r.resource_type, 'external_url', CASE WHEN r.resource_type = 'file' THEN '/.netlify/functions/upload?resourceId=' || r.id ELSE r.external_url END) ORDER BY r.created_at) FROM resources r WHERE r.module_id = m.id), '[]'::JSONB)
                 ) ORDER BY m.position)
                 FROM modules m WHERE m.course_id = c.id AND m.published = TRUE
               ), '[]'::JSONB) AS module_content
        FROM courses c
        JOIN enrollments e ON e.course_id = c.id AND e.user_id = ${user.id}
        WHERE c.published = TRUE
        ORDER BY c.mandatory DESC, e.due_at NULLS LAST, c.title
      `,
      db.sql`SELECT full_name, email, department, job_title, COALESCE(profile_metadata ? 'avatar_storage_key', FALSE) AS has_avatar FROM users WHERE id = ${user.id} LIMIT 1`,
      db.sql`
        SELECT cert.certificate_number, cert.course_id, cert.score, cert.issued_at,
               c.code AS course_code, c.title AS course_title
        FROM certificates cert JOIN courses c ON c.id = cert.course_id
        WHERE cert.user_id = ${user.id}
        ORDER BY cert.issued_at DESC
      `,
      db.sql`
        SELECT event_type, summary, occurred_at
        FROM activity_events
        WHERE user_id = ${user.id}
        ORDER BY occurred_at DESC
        LIMIT 30
      `,
    ]);
    return json({ profile: profile[0] ?? { full_name: user.user_metadata?.full_name ?? user.email, email: user.email }, courses: courseRows, certificates, activity });
  }

  if (request.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  verifyRequestOrigin(request);
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "complete-module") {
    const moduleId = String(body.moduleId ?? "");
    if (!moduleId) return json({ error: "moduleId requis" }, 400);
    const assignedModule = await db.sql`
      SELECT m.id
      FROM modules m
      JOIN enrollments e ON e.course_id = m.course_id AND e.user_id = ${user.id}
      WHERE m.id = ${moduleId} AND m.published = TRUE
      LIMIT 1
    `;
    if (!assignedModule[0]) return json({ error: "Ce module ne fait pas partie de vos formations assignées" }, 403);
    const progressId = crypto.randomUUID();
    await db.sql`
      INSERT INTO module_progress (id, user_id, module_id, completed, completed_at, updated_at)
      VALUES (${progressId}, ${user.id}, ${moduleId}, TRUE, NOW(), NOW())
      ON CONFLICT (user_id, module_id)
      DO UPDATE SET completed = TRUE, completed_at = NOW(), updated_at = NOW()
    `;
    await db.sql`
      UPDATE enrollments e SET
        progress_percent = p.percent,
        status = CASE WHEN p.percent = 100 THEN 'completed' WHEN p.percent > 0 THEN 'in_progress' ELSE e.status END,
        completed_at = CASE WHEN p.percent = 100 THEN NOW() ELSE e.completed_at END,
        updated_at = NOW()
      FROM (
        SELECT m.course_id,
               ROUND(100.0 * COUNT(mp.id) FILTER (WHERE mp.completed = TRUE) / NULLIF(COUNT(m.id), 0))::INT AS percent
        FROM modules m
        LEFT JOIN module_progress mp ON mp.module_id = m.id AND mp.user_id = ${user.id}
        WHERE m.course_id = (SELECT course_id FROM modules WHERE id = ${moduleId}) AND m.published = TRUE
        GROUP BY m.course_id
      ) p
      WHERE e.user_id = ${user.id} AND e.course_id = p.course_id
    `;
    await db.sql`
      INSERT INTO activity_events (id, user_id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${user.id}, 'module.completed', 'module', ${moduleId}, 'Module terminé')
    `;
    return json({ ok: true });
  }

  if (action === "submit-quiz") {
    const quizId = String(body.quizId ?? "");
    const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, unknown> : {};
    const quiz = await db.sql<{ pass_threshold: number; course_id: string; title: string }>`
      SELECT q.pass_threshold, q.course_id, q.title
      FROM quizzes q
      JOIN enrollments e ON e.course_id = q.course_id AND e.user_id = ${user.id}
      WHERE q.id = ${quizId} AND q.published = TRUE
      LIMIT 1
    `;
    if (!quiz[0]) return json({ error: "QCM introuvable" }, 404);
    const questions = await db.sql<{ correct_option: number }>`SELECT correct_option FROM quiz_questions WHERE quiz_id = ${quizId} ORDER BY position`;
    if (!questions.length) return json({ error: "Ce QCM ne contient aucune question" }, 400);
    const correctAnswers = questions.reduce((total, question, index) => total + (Number(answers[String(index)]) === question.correct_option ? 1 : 0), 0);
    const score = Math.round((correctAnswers / questions.length) * 100);
    const passed = score >= quiz[0].pass_threshold;
    const attemptId = crypto.randomUUID();
    await db.sql`
      INSERT INTO quiz_attempts (id, quiz_id, user_id, score, answers, passed)
      VALUES (${attemptId}, ${quizId}, ${user.id}, ${score}, ${JSON.stringify(answers)}, ${passed})
    `;
    if (passed) {
      const number = certificateNumber();
      await db.sql`
        INSERT INTO certificates (id, certificate_number, user_id, course_id, quiz_attempt_id, score)
        VALUES (${crypto.randomUUID()}, ${number}, ${user.id}, ${quiz[0].course_id}, ${attemptId}, ${score})
        ON CONFLICT (user_id, course_id) DO UPDATE SET quiz_attempt_id = EXCLUDED.quiz_attempt_id, score = EXCLUDED.score, issued_at = NOW()
      `;
      await db.sql`
        INSERT INTO integration_events (id, integration, direction, event_type, idempotency_key, subject_user_id, payload)
        VALUES (${crypto.randomUUID()}, 'formation_passport', 'outbound', 'training.completed', ${`completion:${user.id}:${quiz[0].course_id}`}, ${user.id}, ${JSON.stringify({ courseId: quiz[0].course_id, score, passed: true })})
        ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload, status = 'pending', attempts = 0, last_error = NULL
      `;
    }
    return json({ ok: true, passed, score });
  }

  if (!isStaff) return json({ error: "Accès administrateur requis" }, 403);

  if (action === "request-passport-sync") {
    const userId = String(body.userId ?? "");
    if (!userId) return json({ error: "userId requis" }, 400);
    const profile = await db.sql`SELECT id, matricule, email, full_name FROM users WHERE id = ${userId} LIMIT 1`;
    if (!profile[0]) return json({ error: "Utilisateur introuvable" }, 404);
    await db.sql`
      INSERT INTO integration_events (id, integration, direction, event_type, idempotency_key, subject_user_id, payload)
      VALUES (${crypto.randomUUID()}, 'formation_passport', 'outbound', 'passport.sync_requested', ${`sync:${userId}:${Date.now()}`}, ${userId}, ${JSON.stringify(profile[0])})
    `;
    return json({ ok: true });
  }

  if (action === "create-course") {
    const id = crypto.randomUUID();
    const title = String(body.title ?? "").trim();
    if (!title) return json({ error: "Titre requis" }, 400);
    const slug = String(body.slug ?? title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    const code = String(body.code ?? `WA-${Date.now()}`);
    const category = String(body.category ?? "Général");
    const description = String(body.description ?? "");
    const durationMinutes = Number(body.durationMinutes ?? 0);
    const mandatory = Boolean(body.mandatory);
    await db.sql`
      INSERT INTO courses (id, code, title, slug, category, description, objective, duration_minutes, mandatory, published, lifecycle_status, created_by)
      VALUES (${id}, ${code}, ${title}, ${slug}, ${category}, ${description}, ${description}, ${durationMinutes}, ${mandatory}, FALSE, 'draft', ${user.id})
    `;
    await db.sql`
      INSERT INTO modules (id, course_id, position, title, description, content_type, duration_minutes, published)
      VALUES (${`${id}-module-1`}, ${id}, 1, 'Introduction et objectifs', ${description}, 'text', ${durationMinutes}, TRUE)
    `;
    return json({ ok: true, id, code }, 201);
  }

  if (action === "add-video-link") {
    const moduleId = String(body.moduleId ?? "");
    const externalUrl = String(body.url ?? "");
    const name = String(body.name ?? "Vidéo du module");
    let parsed: URL;
    try { parsed = new URL(externalUrl); } catch { return json({ error: "URL vidéo invalide" }, 400); }
    if (!['https:'].includes(parsed.protocol)) return json({ error: "Une URL HTTPS est requise" }, 400);
    const moduleRows = await db.sql`SELECT id FROM modules WHERE id = ${moduleId} LIMIT 1`;
    if (!moduleRows[0]) return json({ error: "Module introuvable" }, 404);
    await db.sql`UPDATE modules SET content_type = 'video', video_url = ${externalUrl}, updated_at = NOW() WHERE id = ${moduleId}`;
    await db.sql`
      INSERT INTO resources (id, module_id, name, resource_type, external_url, uploaded_by)
      VALUES (${crypto.randomUUID()}, ${moduleId}, ${name}, 'link', ${externalUrl}, ${user.id})
    `;
    return json({ ok: true });
  }

  if (action === "assign-course") {
    const userId = String(body.userId ?? "");
    const courseId = String(body.courseId ?? "");
    if (!userId || !courseId) return json({ error: "userId et courseId requis" }, 400);
    const [targetRows, courseRows] = await Promise.all([
      db.sql`SELECT id FROM users WHERE id = ${userId} AND role = 'learner' LIMIT 1`,
      db.sql`SELECT id, code, title FROM courses WHERE id = ${courseId} AND published = TRUE LIMIT 1`,
    ]);
    if (!targetRows[0]) return json({ error: "Apprenant introuvable" }, 404);
    if (!courseRows[0]) return json({ error: "Formation publiée introuvable" }, 404);
    await db.sql`
      INSERT INTO enrollments (id, user_id, course_id, assigned_by, due_at, assignment_note, assignment_source)
      VALUES (${crypto.randomUUID()}, ${userId}, ${courseId}, ${user.id}, ${body.dueAt ? String(body.dueAt) : null}, ${body.note ? String(body.note) : null}, 'admin')
      ON CONFLICT (user_id, course_id) DO UPDATE SET assigned_by = EXCLUDED.assigned_by, due_at = EXCLUDED.due_at, assignment_note = EXCLUDED.assignment_note, assignment_source = 'admin', updated_at = NOW()
    `;
    await db.sql`
      INSERT INTO activity_events (id, user_id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${userId}, ${user.id}, 'course.assigned', 'course', ${courseId}, 'Formation assignée')
    `;
    await db.sql`
      INSERT INTO integration_events (id, integration, direction, event_type, idempotency_key, subject_user_id, payload)
      VALUES (${crypto.randomUUID()}, 'formation_passport', 'outbound', 'course.assigned', ${`assignment:${userId}:${courseId}`}, ${userId}, ${JSON.stringify({ courseId, courseCode: courseRows[0].code, title: courseRows[0].title, dueAt: body.dueAt ?? null })})
      ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload, status = 'pending', attempts = 0, last_error = NULL
    `;
    return json({ ok: true });
  }

  if (action === "create-quiz") {
    const id = crypto.randomUUID();
    const courseId = String(body.courseId ?? "hygiene-mains");
    const title = String(body.title ?? "Évaluation finale");
    const threshold = Number(body.threshold ?? 80);
    const submittedQuestions = Array.isArray(body.questions) ? body.questions : [{ prompt: body.question, options: body.options, correct: body.correct, explanation: "" }];
    if (!submittedQuestions.length || submittedQuestions.length > 100) return json({ error: "Le QCM doit contenir entre 1 et 100 questions" }, 400);
    const normalizedQuestions: Array<{ prompt: string; options: string[]; correct: number; explanation: string }> = [];
    for (const [index, raw] of submittedQuestions.entries()) {
      const question = raw as Record<string, unknown>;
      const prompt = String(question.prompt ?? "").trim();
      const options = Array.isArray(question.options) ? question.options.map(String).slice(0, 6) : [];
      const correct = Number(question.correct ?? 0);
      const explanation = String(question.explanation ?? "");
      if (!prompt || options.length < 2 || correct < 0 || correct >= options.length) return json({ error: `Question ${index + 1} invalide` }, 400);
      normalizedQuestions.push({ prompt, options, correct, explanation });
    }
    await db.sql`INSERT INTO quizzes (id, course_id, title, pass_threshold, published) VALUES (${id}, ${courseId}, ${title}, ${threshold}, FALSE)`;
    for (const [index, question] of normalizedQuestions.entries()) {
      await db.sql`
        INSERT INTO quiz_questions (id, quiz_id, position, prompt, options, correct_option, explanation)
        VALUES (${crypto.randomUUID()}, ${id}, ${index + 1}, ${question.prompt}, ${JSON.stringify(question.options)}, ${question.correct}, ${question.explanation})
      `;
    }
    return json({ ok: true, id, questionCount: normalizedQuestions.length }, 201);
  }

  if (action === "update-role-mirror") {
    if (!isSuperAdmin) return json({ error: "Accès super-administrateur requis" }, 403);
    const targetUserId = String(body.userId ?? "");
    const role = String(body.role ?? "");
    if (!targetUserId || !["learner", "admin", "super_admin"].includes(role)) return json({ error: "Utilisateur ou rôle invalide" }, 400);
    const previous = await db.sql<{ role: string }>`SELECT role FROM users WHERE id = ${targetUserId} LIMIT 1`;
    if (!previous[0]) return json({ error: "Utilisateur introuvable" }, 404);
    await db.sql`UPDATE users SET role = ${role} WHERE id = ${targetUserId}`;
    await db.sql`
      INSERT INTO role_audit_events (id, actor_id, target_user_id, previous_role, new_role)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${targetUserId}, ${previous[0].role}, ${role})
    `;
    return json({ ok: true, warning: "Le rôle doit aussi être attribué dans Netlify Identity pour modifier les droits de connexion." });
  }

  return json({ error: "Action inconnue" }, 400);
};

export default handler;
