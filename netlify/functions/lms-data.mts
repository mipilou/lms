import { getDatabase } from "@netlify/database";
import { getUser, verifyRequestOrigin } from "@netlify/identity";

type IdentityUser = {
  id: string;
  email?: string;
  roles: string[];
  user_metadata?: { full_name?: string };
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

const handler = async (request: Request) => {
  const identityUser = await getUser();
  if (!identityUser) return json({ error: "Authentification requise" }, 401);
  const user = identityUser as unknown as IdentityUser;
  const isAdmin = user.roles.includes("admin");
  const db = getDatabase();

  if (request.method === "GET") {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "dashboard";

    if (scope === "admin" && !isAdmin) return json({ error: "Accès administrateur requis" }, 403);

    if (scope === "admin") {
      const [totals, learners, recentLogins] = await Promise.all([
        db.sql`
          SELECT
            (SELECT COUNT(*)::INT FROM users WHERE role = 'learner') AS learners,
            (SELECT COUNT(*)::INT FROM courses WHERE published = TRUE) AS courses,
            (SELECT COUNT(*)::INT FROM quiz_attempts WHERE passed = TRUE) AS certificates,
            (SELECT COUNT(*)::INT FROM login_events WHERE occurred_at >= CURRENT_DATE) AS logins_today
        `,
        db.sql`
          SELECT u.id, u.email, u.full_name, u.department, u.status, u.last_login_at,
                 COUNT(e.id)::INT AS assigned,
                 COUNT(e.id) FILTER (WHERE e.status = 'completed')::INT AS completed
          FROM users u
          LEFT JOIN enrollments e ON e.user_id = u.id
          WHERE u.role = 'learner'
          GROUP BY u.id
          ORDER BY u.last_login_at DESC NULLS LAST
          LIMIT 100
        `,
        db.sql`
          SELECT email, event_type, occurred_at, metadata
          FROM login_events
          ORDER BY occurred_at DESC
          LIMIT 50
        `,
      ]);
      return json({ totals: totals[0], learners, recentLogins });
    }

    const courseRows = await db.sql`
      SELECT c.*,
             COUNT(m.id)::INT AS module_count,
             COUNT(mp.id) FILTER (WHERE mp.completed = TRUE)::INT AS completed_modules
      FROM courses c
      LEFT JOIN modules m ON m.course_id = c.id AND m.published = TRUE
      LEFT JOIN module_progress mp ON mp.module_id = m.id AND mp.user_id = ${user.id}
      WHERE c.published = TRUE
      GROUP BY c.id
      ORDER BY c.mandatory DESC, c.created_at DESC
    `;
    return json({ courses: courseRows });
  }

  if (request.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  verifyRequestOrigin(request);
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "complete-module") {
    const moduleId = String(body.moduleId ?? "");
    if (!moduleId) return json({ error: "moduleId requis" }, 400);
    await db.sql`
      INSERT INTO module_progress (id, user_id, module_id, completed, completed_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${moduleId}, TRUE, NOW(), NOW())
      ON CONFLICT (user_id, module_id)
      DO UPDATE SET completed = TRUE, completed_at = NOW(), updated_at = NOW()
    `;
    return json({ ok: true });
  }

  if (action === "submit-quiz") {
    const quizId = String(body.quizId ?? "");
    const score = Number(body.score ?? 0);
    const answers = body.answers ?? {};
    const quiz = await db.sql<{ pass_threshold: number }>`SELECT pass_threshold FROM quizzes WHERE id = ${quizId} LIMIT 1`;
    if (!quiz[0]) return json({ error: "QCM introuvable" }, 404);
    const passed = score >= quiz[0].pass_threshold;
    await db.sql`
      INSERT INTO quiz_attempts (id, quiz_id, user_id, score, answers, passed)
      VALUES (${crypto.randomUUID()}, ${quizId}, ${user.id}, ${score}, ${JSON.stringify(answers)}, ${passed})
    `;
    return json({ ok: true, passed });
  }

  if (!isAdmin) return json({ error: "Accès administrateur requis" }, 403);

  if (action === "create-course") {
    const id = crypto.randomUUID();
    const title = String(body.title ?? "");
    const slug = String(body.slug ?? title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    const category = String(body.category ?? "Général");
    const description = String(body.description ?? "");
    const durationMinutes = Number(body.durationMinutes ?? 0);
    const mandatory = Boolean(body.mandatory);
    await db.sql`
      INSERT INTO courses (id, title, slug, category, description, duration_minutes, mandatory, published, created_by)
      VALUES (${id}, ${title}, ${slug}, ${category}, ${description}, ${durationMinutes}, ${mandatory}, FALSE, ${user.id})
    `;
    return json({ ok: true, id }, 201);
  }

  if (action === "create-quiz") {
    const id = crypto.randomUUID();
    const questionId = crypto.randomUUID();
    const courseId = String(body.courseId ?? "hygiene-mains");
    const title = String(body.title ?? "Évaluation finale");
    const threshold = Number(body.threshold ?? 80);
    const prompt = String(body.question ?? "");
    const options = Array.isArray(body.options) ? body.options.map(String) : [];
    const correct = Number(body.correct ?? 0);
    await db.sql`
      INSERT INTO quizzes (id, course_id, title, pass_threshold, published)
      VALUES (${id}, ${courseId}, ${title}, ${threshold}, FALSE)
    `;
    await db.sql`
      INSERT INTO quiz_questions (id, quiz_id, position, prompt, options, correct_option)
      VALUES (${questionId}, ${id}, 1, ${prompt}, ${JSON.stringify(options)}, ${correct})
    `;
    return json({ ok: true, id }, 201);
  }

  return json({ error: "Action inconnue" }, 400);
};

export default handler;
