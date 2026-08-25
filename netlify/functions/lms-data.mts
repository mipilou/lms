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

async function issueCompletionCertificate(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  courseId: string,
  score: number | null,
  quizAttemptId: string | null,
) {
  const [existing, identity] = await Promise.all([
    db.sql<{ certificate_number: string; issued_at: string }>`SELECT certificate_number, issued_at FROM certificates WHERE user_id = ${userId} AND course_id = ${courseId} LIMIT 1`,
    db.sql<Record<string, unknown>>`
      SELECT u.full_name, u.email, u.matricule, u.department, u.job_title, u.location,
             c.code, c.title, c.category, c.duration_minutes
      FROM users u CROSS JOIN courses c
      WHERE u.id = ${userId} AND c.id = ${courseId}
      LIMIT 1
    `,
  ]);
  if (!identity[0]) return null;
  const number = existing[0]?.certificate_number ?? certificateNumber();
  const metadata = JSON.stringify({
    learnerName: identity[0].full_name,
    learnerEmail: identity[0].email,
    matricule: identity[0].matricule,
    department: identity[0].department,
    jobTitle: identity[0].job_title,
    location: identity[0].location,
    courseCode: identity[0].code,
    courseTitle: identity[0].title,
    category: identity[0].category,
    durationMinutes: identity[0].duration_minutes,
    issuer: "Walyah Académie",
  });
  const rows = await db.sql<{ certificate_number: string; issued_at: string }>`
    INSERT INTO certificates (id, certificate_number, user_id, course_id, quiz_attempt_id, score, metadata)
    VALUES (${crypto.randomUUID()}, ${number}, ${userId}, ${courseId}, ${quizAttemptId}, ${score}, ${metadata})
    ON CONFLICT (user_id, course_id) DO UPDATE SET
      quiz_attempt_id = COALESCE(EXCLUDED.quiz_attempt_id, certificates.quiz_attempt_id),
      score = COALESCE(EXCLUDED.score, certificates.score), metadata = EXCLUDED.metadata
    RETURNING certificate_number, issued_at
  `;
  await db.sql`
    INSERT INTO integration_events (id, integration, direction, event_type, idempotency_key, subject_user_id, payload)
    VALUES (${crypto.randomUUID()}, 'formation_passport', 'outbound', 'training.completed', ${`completion:${userId}:${courseId}`}, ${userId}, ${JSON.stringify({ courseId, score, passed: true, certificateNumber: number })})
    ON CONFLICT (idempotency_key) DO NOTHING
  `;
  if (!existing[0]) {
    await db.sql`
      INSERT INTO activity_events (id, user_id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${userId}, ${userId}, 'certificate.issued', 'course', ${courseId}, 'Certificat de fin de formation délivré', ${JSON.stringify({ certificateNumber: number })})
    `;
  }
  return rows[0] ?? { certificate_number: number, issued_at: new Date().toISOString() };
}

function normalizedAnswer(value: unknown) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function numberArray(value: unknown) {
  if (!Array.isArray(value)) return Number.isInteger(Number(value)) ? [Number(value)] : [];
  return Array.from(new Set(value.map(Number).filter((item) => Number.isInteger(item) && item >= 0)));
}

function jsonArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

type NormalizedQuizQuestion = {
  type: string;
  prompt: string;
  options: string[];
  correctAnswers: number[];
  acceptedAnswers: string[];
  explanation: string;
  points: number;
};

function normalizeQuizQuestions(value: unknown): { questions?: NormalizedQuizQuestion[]; error?: string } {
  const submittedQuestions = Array.isArray(value) ? value : [];
  if (!submittedQuestions.length || submittedQuestions.length > 100) {
    return { error: "Le QCM doit contenir entre 1 et 100 questions" };
  }
  const allowedQuestionTypes = new Set(["single", "multiple", "true_false", "short_text"]);
  const questions: NormalizedQuizQuestion[] = [];
  for (const [index, raw] of submittedQuestions.entries()) {
    const question = raw as Record<string, unknown>;
    const type = String(question.type ?? question.questionType ?? "single");
    const prompt = String(question.prompt ?? "").trim();
    let options = Array.isArray(question.options) ? question.options.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 6) : [];
    if (type === "true_false") options = ["Vrai", "Faux"];
    if (type === "short_text") options = [];
    const correctAnswers = type === "short_text" ? [] : numberArray(question.correctAnswers ?? question.correct_answers ?? question.correct);
    const rawAcceptedAnswers = question.acceptedAnswers ?? question.accepted_answers;
    const acceptedAnswers = type === "short_text" && Array.isArray(rawAcceptedAnswers)
      ? rawAcceptedAnswers.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : [];
    const explanation = String(question.explanation ?? "");
    const points = Math.round(Number(question.points ?? 1));
    if (!allowedQuestionTypes.has(type)) return { error: `Question ${index + 1} : type invalide` };
    if (!prompt) return { error: `Question ${index + 1} : intitulé requis` };
    if ((type === "single" || type === "multiple") && (options.length < 2 || options.length > 6)) return { error: `Question ${index + 1} : 2 à 6 réponses sont requises` };
    if (type === "single" && correctAnswers.length !== 1) return { error: `Question ${index + 1} : une seule bonne réponse est requise` };
    if (type === "multiple" && !correctAnswers.length) return { error: `Question ${index + 1} : sélectionnez au moins une bonne réponse` };
    if (type === "true_false" && (correctAnswers.length !== 1 || correctAnswers[0] > 1)) return { error: `Question ${index + 1} : choisissez Vrai ou Faux` };
    if (correctAnswers.some((answer) => answer >= options.length)) return { error: `Question ${index + 1} : index de bonne réponse invalide` };
    if (type === "short_text" && !acceptedAnswers.length) return { error: `Question ${index + 1} : réponse acceptée requise` };
    if (points < 1 || points > 10) return { error: `Question ${index + 1} : points entre 1 et 10 requis` };
    questions.push({ type, prompt, options, correctAnswers, acceptedAnswers, explanation, points });
  }
  return { questions };
}

async function persistQuizQuestions(
  db: ReturnType<typeof getDatabase>,
  input: { id: string; courseId: string; title: string; threshold: number; questions: NormalizedQuizQuestion[]; update: boolean },
) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    if (input.update) {
      await client.query(
        "UPDATE quizzes SET course_id = $1, title = $2, pass_threshold = $3, updated_at = NOW() WHERE id = $4 AND archived_at IS NULL",
        [input.courseId, input.title, input.threshold, input.id],
      );
      await client.query("DELETE FROM quiz_questions WHERE quiz_id = $1", [input.id]);
    } else {
      await client.query(
        "INSERT INTO quizzes (id, course_id, title, pass_threshold, published, updated_at) VALUES ($1, $2, $3, $4, FALSE, NOW())",
        [input.id, input.courseId, input.title, input.threshold],
      );
    }
    for (const [index, question] of input.questions.entries()) {
      await client.query(
        `INSERT INTO quiz_questions
          (id, quiz_id, position, prompt, options, correct_option, question_type, correct_answers, accepted_answers, explanation, points)
         VALUES ($1, $2, $3, $4, $5::JSONB, $6, $7, $8::JSONB, $9::JSONB, $10, $11)`,
        [crypto.randomUUID(), input.id, index + 1, question.prompt, JSON.stringify(question.options), question.correctAnswers[0] ?? 0, question.type, JSON.stringify(question.correctAnswers), JSON.stringify(question.acceptedAnswers), question.explanation, question.points],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

    if (["admin", "catalog", "learner", "course-studio", "quiz-admin", "groups"].includes(scope) && !isStaff) {
      return json({ error: "Accès administrateur requis" }, 403);
    }

    if (scope === "quiz") {
      const quizId = url.searchParams.get("quizId") ?? "";
      if (!quizId) return json({ error: "quizId requis" }, 400);
      const quizzes = isStaff
        ? await db.sql<{ id: string; title: string; pass_threshold: number; course_id: string; course_title: string }>`
            SELECT q.id, q.title, q.pass_threshold, q.course_id, c.title AS course_title
            FROM quizzes q JOIN courses c ON c.id = q.course_id
            WHERE q.id = ${quizId} AND q.published = TRUE AND q.archived_at IS NULL
            LIMIT 1
          `
        : await db.sql<{ id: string; title: string; pass_threshold: number; course_id: string; course_title: string }>`
            SELECT q.id, q.title, q.pass_threshold, q.course_id, c.title AS course_title
            FROM quizzes q
            JOIN courses c ON c.id = q.course_id
            JOIN enrollments e ON e.course_id = q.course_id AND e.user_id = ${user.id}
            WHERE q.id = ${quizId} AND q.published = TRUE AND q.archived_at IS NULL AND c.published = TRUE
              AND (
                EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
                OR q.targeted = FALSE
              )
            LIMIT 1
          `;
      if (!quizzes[0]) return json({ error: "Évaluation introuvable ou non attribuée" }, 404);
      const questions = await db.sql`
        SELECT id, position, prompt, options, question_type, points
        FROM quiz_questions
        WHERE quiz_id = ${quizId}
        ORDER BY position
      `;
      return json({ quiz: quizzes[0], questions });
    }

    if (scope === "quiz-admin") {
      const quizId = url.searchParams.get("quizId") ?? "";
      if (!quizId) return json({ error: "quizId requis" }, 400);
      const [quizzes, questions, assignments] = await Promise.all([
        db.sql`
          SELECT q.id, q.course_id, q.title, q.pass_threshold, q.published, c.code AS course_code, c.title AS course_title
          FROM quizzes q JOIN courses c ON c.id = q.course_id
          WHERE q.id = ${quizId} AND q.archived_at IS NULL
          LIMIT 1
        `,
        db.sql`
          SELECT id, position, prompt, options, correct_option, question_type, correct_answers,
                 accepted_answers, explanation, points
          FROM quiz_questions
          WHERE quiz_id = ${quizId}
          ORDER BY position
        `,
        db.sql`
          SELECT qa.id, qa.user_id, qa.training_group_id, qa.due_at, qa.assignment_note,
                 qa.assignment_source, qa.assigned_at, u.full_name, u.department,
                 tg.name AS group_name
          FROM quiz_assignments qa
          JOIN users u ON u.id = qa.user_id
          LEFT JOIN training_groups tg ON tg.id = qa.training_group_id
          WHERE qa.quiz_id = ${quizId}
          ORDER BY qa.assigned_at DESC, u.full_name
        `,
      ]);
      if (!quizzes[0]) return json({ error: "Questionnaire introuvable" }, 404);
      return json({ quiz: quizzes[0], questions, assignments });
    }

    if (scope === "groups") {
      const [groups, members] = await Promise.all([
        db.sql`
          SELECT tg.id, tg.name, tg.description, tg.department, tg.status, tg.created_at, tg.updated_at,
                 COUNT(tgm.user_id)::INT AS member_count,
                 COUNT(DISTINCT qa.quiz_id)::INT AS assigned_quizzes
          FROM training_groups tg
          LEFT JOIN training_group_members tgm ON tgm.group_id = tg.id
          LEFT JOIN quiz_assignments qa ON qa.training_group_id = tg.id
          WHERE tg.status = 'active'
          GROUP BY tg.id
          ORDER BY tg.name
        `,
        db.sql`
          SELECT tgm.group_id, u.id, u.full_name, u.email, u.matricule, u.department, u.job_title
          FROM training_group_members tgm
          JOIN users u ON u.id = tgm.user_id AND u.role = 'learner'
          JOIN training_groups tg ON tg.id = tgm.group_id AND tg.status = 'active'
          ORDER BY u.department NULLS LAST, u.full_name
        `,
      ]);
      return json({ groups, members });
    }

    if (scope === "course-studio") {
      const courseId = url.searchParams.get("courseId") ?? "";
      if (!courseId) return json({ error: "courseId requis" }, 400);
      const [courseRows, moduleRows, quizRows] = await Promise.all([
        db.sql`SELECT * FROM courses WHERE id = ${courseId} LIMIT 1`,
        db.sql`
          SELECT m.*,
                 COALESCE((
                   SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                     'id', r.id,
                     'name', r.name,
                     'resource_type', r.resource_type,
                     'content_kind', r.content_kind,
                     'mime_type', r.mime_type,
                     'size_bytes', r.size_bytes,
                     'metadata', r.metadata,
                     'external_url', CASE WHEN r.resource_type = 'file' THEN '/.netlify/functions/upload?resourceId=' || r.id ELSE r.external_url END
                   ) ORDER BY r.created_at)
                   FROM resources r WHERE r.module_id = m.id
                 ), '[]'::JSONB) AS resources
          FROM modules m
          WHERE m.course_id = ${courseId}
          ORDER BY m.position
        `,
        db.sql`
          SELECT q.id, q.title, q.pass_threshold, q.published, COUNT(qq.id)::INT AS question_count
          FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
          WHERE q.course_id = ${courseId} AND q.archived_at IS NULL
          GROUP BY q.id ORDER BY q.created_at DESC
        `,
      ]);
      if (!courseRows[0]) return json({ error: "Formation introuvable" }, 404);
      return json({ course: courseRows[0], modules: moduleRows, quizzes: quizRows });
    }

    if (scope === "admin") {
      const requestedPeriod = Number(url.searchParams.get("period") ?? 30);
      const periodDays = [7, 30, 90].includes(requestedPeriod) ? requestedPeriod : 30;
      const periodStart = new Date();
      periodStart.setHours(0, 0, 0, 0);
      periodStart.setDate(periodStart.getDate() - (periodDays - 1));
      const periodSince = periodStart.toISOString();
      const [totals, learnerRows, recentLogins, recentActivity, dailyLogins, courseStats, quizStats, accounts, roleAudit, departmentStats] = await Promise.all([
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
            (SELECT COUNT(DISTINCT user_id)::INT FROM login_events WHERE occurred_at >= ${periodSince}) AS active_users_period,
            (SELECT COUNT(*)::INT FROM certificates WHERE issued_at >= ${periodSince}) AS certificates_period,
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
          SELECT l.id, l.user_id, l.email, l.event_type, l.occurred_at, l.metadata,
                 u.full_name, u.matricule, u.department, u.job_title, u.status, u.last_login_at,
                 COALESCE(u.profile_metadata ? 'avatar_storage_key', FALSE) AS has_avatar
          FROM login_events l
          LEFT JOIN users u ON u.id = l.user_id
          WHERE l.occurred_at >= ${periodSince}
          ORDER BY l.occurred_at DESC
          LIMIT 250
        `,
        db.sql`
          SELECT a.id, a.user_id, a.event_type, a.entity_type, a.entity_id, a.summary, a.occurred_at, a.metadata,
                 u.full_name, u.email, u.matricule, u.department, u.job_title, u.status, u.last_login_at,
                 COALESCE(u.profile_metadata ? 'avatar_storage_key', FALSE) AS has_avatar,
                 COALESCE(c.title, linked_course.title) AS entity_title,
                 COALESCE(c.id, linked_course.id) AS linked_course_id
          FROM activity_events a
          LEFT JOIN users u ON u.id = a.user_id
          LEFT JOIN courses c ON a.entity_type = 'course' AND c.id = a.entity_id
          LEFT JOIN modules m ON a.entity_type = 'module' AND m.id = a.entity_id
          LEFT JOIN quizzes q ON a.entity_type = 'quiz' AND q.id = a.entity_id
          LEFT JOIN courses linked_course ON linked_course.id = COALESCE(m.course_id, q.course_id)
          WHERE a.occurred_at >= ${periodSince}
          ORDER BY a.occurred_at DESC
          LIMIT 100
        `,
        db.sql`
          SELECT occurred_at::DATE AS day, COUNT(*)::INT AS count
          FROM login_events
          WHERE occurred_at >= ${periodSince}
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
                     'resources', COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', r.id, 'name', r.name, 'resource_type', r.resource_type, 'content_kind', r.content_kind, 'mime_type', r.mime_type, 'size_bytes', r.size_bytes, 'metadata', r.metadata, 'external_url', CASE WHEN r.resource_type = 'file' THEN '/.netlify/functions/upload?resourceId=' || r.id ELSE r.external_url END) ORDER BY r.created_at) FROM resources r WHERE r.module_id = m.id), '[]'::JSONB)
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
          SELECT q.id, q.title, q.pass_threshold, q.published, c.id AS course_id, c.title AS course_title,
                 COUNT(DISTINCT qq.id)::INT AS question_count,
                 COUNT(DISTINCT qa.user_id)::INT AS participants,
                 COALESCE(ROUND(AVG(qa.score)), 0)::INT AS average_score,
                 COUNT(DISTINCT qas.user_id)::INT AS assigned_users,
                 COUNT(DISTINCT qas.training_group_id)::INT AS assigned_groups
          FROM quizzes q
          JOIN courses c ON c.id = q.course_id
          LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
          LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
          LEFT JOIN quiz_assignments qas ON qas.quiz_id = q.id
          WHERE q.archived_at IS NULL
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
        db.sql`
          SELECT COALESCE(NULLIF(u.department, ''), 'Non renseigné') AS department,
                 COUNT(DISTINCT u.id)::INT AS learners,
                 COUNT(DISTINCT u.id) FILTER (WHERE u.last_login_at >= ${periodSince})::INT AS active_learners,
                 COALESCE(ROUND(AVG(e.progress_percent)), 0)::INT AS average_progress,
                 COUNT(e.id) FILTER (WHERE e.status = 'completed')::INT AS completed
          FROM users u
          LEFT JOIN enrollments e ON e.user_id = u.id
          WHERE u.role = 'learner'
          GROUP BY COALESCE(NULLIF(u.department, ''), 'Non renseigné')
          ORDER BY learners DESC, average_progress DESC
          LIMIT 10
        `,
      ]);
      return json({ totals: totals[0], learners: learnerRows, recentLogins, recentActivity, dailyLogins, courseStats, quizStats, accounts, roleAudit, departmentStats, periodDays, role: isSuperAdmin ? "super_admin" : "admin" });
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
               (SELECT q.id FROM quizzes q
                WHERE q.course_id = c.id AND q.published = TRUE AND q.archived_at IS NULL
                  AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
                    OR q.targeted = FALSE)
                ORDER BY EXISTS (SELECT 1 FROM quiz_assignments preferred WHERE preferred.quiz_id = q.id AND preferred.user_id = ${user.id}) DESC, q.created_at LIMIT 1) AS quiz_id,
               (SELECT q.title FROM quizzes q
                WHERE q.course_id = c.id AND q.published = TRUE AND q.archived_at IS NULL
                  AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
                    OR q.targeted = FALSE)
                ORDER BY EXISTS (SELECT 1 FROM quiz_assignments preferred WHERE preferred.quiz_id = q.id AND preferred.user_id = ${user.id}) DESC, q.created_at LIMIT 1) AS quiz_title,
               (SELECT q.pass_threshold FROM quizzes q
                WHERE q.course_id = c.id AND q.published = TRUE AND q.archived_at IS NULL
                  AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
                    OR q.targeted = FALSE)
                ORDER BY EXISTS (SELECT 1 FROM quiz_assignments preferred WHERE preferred.quiz_id = q.id AND preferred.user_id = ${user.id}) DESC, q.created_at LIMIT 1) AS quiz_threshold,
               COALESCE((
                 SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                   'id', m.id,
                   'title', m.title,
                   'description', m.description,
                   'content_type', m.content_type,
                   'duration_minutes', m.duration_minutes,
                   'learning_objectives', m.learning_objectives,
                   'video_url', m.video_url,
                   'resources', COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', r.id, 'name', r.name, 'resource_type', r.resource_type, 'content_kind', r.content_kind, 'mime_type', r.mime_type, 'size_bytes', r.size_bytes, 'metadata', r.metadata, 'external_url', CASE WHEN r.resource_type = 'file' THEN '/.netlify/functions/upload?resourceId=' || r.id ELSE r.external_url END) ORDER BY r.created_at) FROM resources r WHERE r.module_id = m.id), '[]'::JSONB)
                 ) ORDER BY m.position)
                 FROM modules m WHERE m.course_id = c.id AND m.published = TRUE
               ), '[]'::JSONB) AS module_content
        FROM courses c
        JOIN enrollments e ON e.course_id = c.id AND e.user_id = ${user.id}
        WHERE c.published = TRUE
        ORDER BY c.mandatory DESC, e.due_at NULLS LAST, c.title
      `,
      db.sql`SELECT full_name, email, matricule, department, job_title, location, COALESCE(profile_metadata ? 'avatar_storage_key', FALSE) AS has_avatar FROM users WHERE id = ${user.id} LIMIT 1`,
      db.sql`
        SELECT cert.certificate_number, cert.course_id, cert.score, cert.issued_at,
               c.code AS course_code, c.title AS course_title, c.category AS course_category,
               c.duration_minutes AS course_duration_minutes, cert.metadata
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
        status = CASE
          WHEN p.percent = 100 AND NOT EXISTS (
            SELECT 1 FROM quizzes q
            WHERE q.course_id = p.course_id AND q.published = TRUE AND q.archived_at IS NULL
              AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
                OR q.targeted = FALSE)
              AND NOT EXISTS (SELECT 1 FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = ${user.id} AND qa.passed = TRUE)
          ) THEN 'completed'
          WHEN p.percent > 0 THEN 'in_progress'
          ELSE e.status
        END,
        completed_at = CASE
          WHEN p.percent = 100 AND NOT EXISTS (
            SELECT 1 FROM quizzes q
            WHERE q.course_id = p.course_id AND q.published = TRUE AND q.archived_at IS NULL
              AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
                OR q.targeted = FALSE)
              AND NOT EXISTS (SELECT 1 FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = ${user.id} AND qa.passed = TRUE)
          ) THEN COALESCE(e.completed_at, NOW())
          ELSE e.completed_at
        END,
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
    const completion = await db.sql<{ course_id: string; progress_percent: number; published_quizzes: number; passed_quizzes: number; certificate_score: number | null; certificate_attempt_id: string | null }>`
      SELECT e.course_id, e.progress_percent,
             (SELECT COUNT(*)::INT FROM quizzes q WHERE q.course_id = e.course_id AND q.published = TRUE AND q.archived_at IS NULL
                AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = e.user_id)
                  OR q.targeted = FALSE)) AS published_quizzes,
             (SELECT COUNT(DISTINCT q.id)::INT FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.course_id = e.course_id AND q.published = TRUE AND q.archived_at IS NULL AND qa.user_id = e.user_id AND qa.passed = TRUE
                AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = e.user_id)
                  OR q.targeted = FALSE)) AS passed_quizzes,
             (SELECT qa.score FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.course_id = e.course_id AND q.published = TRUE AND q.archived_at IS NULL AND qa.user_id = e.user_id AND qa.passed = TRUE ORDER BY qa.submitted_at DESC LIMIT 1) AS certificate_score,
             (SELECT qa.id FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.course_id = e.course_id AND q.published = TRUE AND q.archived_at IS NULL AND qa.user_id = e.user_id AND qa.passed = TRUE ORDER BY qa.submitted_at DESC LIMIT 1) AS certificate_attempt_id
      FROM enrollments e
      JOIN modules m ON m.course_id = e.course_id
      WHERE e.user_id = ${user.id} AND m.id = ${moduleId}
      LIMIT 1
    `;
    const completedCourse = completion[0];
    const certificate = completedCourse && Number(completedCourse.progress_percent) === 100 && Number(completedCourse.passed_quizzes) >= Number(completedCourse.published_quizzes)
      ? await issueCompletionCertificate(db, user.id, completedCourse.course_id, completedCourse.certificate_score, completedCourse.certificate_attempt_id)
      : null;
    await db.sql`
      INSERT INTO activity_events (id, user_id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${user.id}, 'module.completed', 'module', ${moduleId}, 'Module terminé')
    `;
    return json({ ok: true, certificate });
  }

  if (action === "submit-quiz") {
    const quizId = String(body.quizId ?? "");
    const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, unknown> : {};
    const quiz = await db.sql<{ pass_threshold: number; course_id: string; title: string }>`
      SELECT q.pass_threshold, q.course_id, q.title
      FROM quizzes q
      JOIN enrollments e ON e.course_id = q.course_id AND e.user_id = ${user.id}
      WHERE q.id = ${quizId} AND q.published = TRUE AND q.archived_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
          OR q.targeted = FALSE
        )
      LIMIT 1
    `;
    if (!quiz[0]) return json({ error: "QCM introuvable" }, 404);
    const questions = await db.sql<{ id: string; question_type: string; correct_option: number; correct_answers: unknown; accepted_answers: unknown; points: number }>`
      SELECT id, question_type, correct_option, correct_answers, accepted_answers, points
      FROM quiz_questions WHERE quiz_id = ${quizId} ORDER BY position
    `;
    if (!questions.length) return json({ error: "Ce QCM ne contient aucune question" }, 400);
    let earnedPoints = 0;
    let availablePoints = 0;
    questions.forEach((question, index) => {
      const points = Math.max(1, Number(question.points ?? 1));
      const submitted = answers[question.id] ?? answers[String(index)];
      const expectedIndexes = numberArray(jsonArray(question.correct_answers).length ? jsonArray(question.correct_answers) : [question.correct_option]).sort((a, b) => a - b);
      let isCorrect = false;
      if (question.question_type === "short_text") {
        const accepted = jsonArray<string>(question.accepted_answers).map(normalizedAnswer);
        isCorrect = accepted.includes(normalizedAnswer(submitted));
      } else if (question.question_type === "multiple") {
        const submittedIndexes = numberArray(submitted).sort((a, b) => a - b);
        isCorrect = submittedIndexes.length === expectedIndexes.length && submittedIndexes.every((value, itemIndex) => value === expectedIndexes[itemIndex]);
      } else {
        isCorrect = Number(submitted) === expectedIndexes[0];
      }
      availablePoints += points;
      if (isCorrect) earnedPoints += points;
    });
    const score = Math.round((earnedPoints / Math.max(availablePoints, 1)) * 100);
    const passed = score >= quiz[0].pass_threshold;
    const attemptId = crypto.randomUUID();
    await db.sql`
      INSERT INTO quiz_attempts (id, quiz_id, user_id, score, answers, passed)
      VALUES (${attemptId}, ${quizId}, ${user.id}, ${score}, ${JSON.stringify(answers)}, ${passed})
    `;
    if (passed) {
      const validation = await db.sql<{ total_modules: number; completed_modules: number; published_quizzes: number; passed_quizzes: number }>`
        SELECT
          (SELECT COUNT(*)::INT FROM modules m WHERE m.course_id = ${quiz[0].course_id} AND m.published = TRUE) AS total_modules,
          (SELECT COUNT(DISTINCT m.id)::INT FROM modules m JOIN module_progress mp ON mp.module_id = m.id WHERE m.course_id = ${quiz[0].course_id} AND m.published = TRUE AND mp.user_id = ${user.id} AND mp.completed = TRUE) AS completed_modules,
          (SELECT COUNT(*)::INT FROM quizzes q WHERE q.course_id = ${quiz[0].course_id} AND q.published = TRUE AND q.archived_at IS NULL
            AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
              OR q.targeted = FALSE)) AS published_quizzes,
          (SELECT COUNT(DISTINCT q.id)::INT FROM quizzes q JOIN quiz_attempts qa ON qa.quiz_id = q.id WHERE q.course_id = ${quiz[0].course_id} AND q.published = TRUE AND q.archived_at IS NULL AND qa.user_id = ${user.id} AND qa.passed = TRUE
            AND (EXISTS (SELECT 1 FROM quiz_assignments assigned WHERE assigned.quiz_id = q.id AND assigned.user_id = ${user.id})
              OR q.targeted = FALSE)) AS passed_quizzes
      `;
      const state = validation[0];
      const courseValidated = Boolean(state)
        && Number(state.completed_modules) >= Number(state.total_modules)
        && Number(state.passed_quizzes) >= Number(state.published_quizzes);
      if (courseValidated) {
        await db.sql`
          UPDATE enrollments SET status = 'completed', progress_percent = 100,
            completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
          WHERE user_id = ${user.id} AND course_id = ${quiz[0].course_id}
        `;
      }
      const certificate = courseValidated ? await issueCompletionCertificate(db, user.id, quiz[0].course_id, score, attemptId) : null;
      return json({ ok: true, passed, score, certificate });
    }
    return json({ ok: true, passed, score });
  }

  if (!isStaff) return json({ error: "Accès administrateur requis" }, 403);

  if (action === "prepare-catalog-course") {
    const courseId = String(body.courseId ?? "");
    const category = String(body.category ?? "").trim();
    if (!courseId) return json({ error: "courseId requis" }, 400);
    const existing = await db.sql<{ id: string; title: string; description: string; lifecycle_status: string }>`
      SELECT id, title, description, lifecycle_status FROM courses WHERE id = ${courseId} LIMIT 1
    `;
    if (!existing[0]) return json({ error: "Formation du catalogue introuvable" }, 404);
    if (existing[0].lifecycle_status === "archived") return json({ error: "Cette formation est archivée" }, 409);
    await db.sql`
      UPDATE courses SET lifecycle_status = CASE WHEN lifecycle_status = 'catalog' THEN 'draft' ELSE lifecycle_status END,
        published = CASE WHEN lifecycle_status = 'catalog' THEN FALSE ELSE published END,
        category = CASE WHEN ${category} <> '' THEN ${category} ELSE category END,
        created_by = COALESCE(created_by, ${user.id}), updated_at = NOW()
      WHERE id = ${courseId}
    `;
    const modules = await db.sql<{ id: string }>`SELECT id FROM modules WHERE course_id = ${courseId} ORDER BY position LIMIT 1`;
    let moduleId = modules[0]?.id;
    if (!moduleId) {
      moduleId = `${courseId}-module-1`;
      await db.sql`
        INSERT INTO modules (id, course_id, position, title, description, content_type, duration_minutes, learning_objectives, lesson_content, published)
        VALUES (${moduleId}, ${courseId}, 1, 'Introduction et objectifs', ${existing[0].description ?? ""}, 'text', 15, '[]'::JSONB, ${JSON.stringify({ status: "draft" })}, TRUE)
      `;
    }
    if (existing[0].lifecycle_status === "catalog") {
      await db.sql`
        INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary)
        VALUES (${crypto.randomUUID()}, ${user.id}, 'course.prepared', 'course', ${courseId}, 'Parcours préparé depuis le catalogue')
      `;
    }
    return json({ ok: true, id: courseId, moduleId });
  }

  if (action === "save-course") {
    const courseId = String(body.courseId ?? "");
    const title = String(body.title ?? "").trim();
    if (!courseId || !title) return json({ error: "Formation et titre requis" }, 400);
    const durationMinutes = Math.max(0, Math.round(Number(body.durationMinutes ?? 0)));
    const rows = await db.sql<{ id: string }>`SELECT id FROM courses WHERE id = ${courseId} AND lifecycle_status <> 'catalog' LIMIT 1`;
    if (!rows[0]) return json({ error: "Préparez d’abord cette formation depuis le catalogue" }, 409);
    await db.sql`
      UPDATE courses SET title = ${title}, category = ${String(body.category ?? "Formation")},
        description = ${String(body.description ?? "")}, objective = ${String(body.objective ?? body.description ?? "")},
        audience = ${String(body.audience ?? "")}, duration_minutes = ${durationMinutes},
        mandatory = ${Boolean(body.mandatory)}, updated_at = NOW()
      WHERE id = ${courseId}
    `;
    return json({ ok: true });
  }

  if (action === "save-module") {
    const courseId = String(body.courseId ?? "");
    const requestedId = String(body.moduleId ?? "");
    const title = String(body.title ?? "").trim();
    const contentType = String(body.contentType ?? "text");
    const allowedContentTypes = new Set(["text", "video", "document", "audio", "scorm", "quiz"]);
    if (!courseId || !title) return json({ error: "Formation et titre du module requis" }, 400);
    if (!allowedContentTypes.has(contentType)) return json({ error: "Type de module invalide" }, 400);
    const courseRows = await db.sql<{ id: string }>`SELECT id FROM courses WHERE id = ${courseId} AND lifecycle_status <> 'catalog' LIMIT 1`;
    if (!courseRows[0]) return json({ error: "Formation en préparation introuvable" }, 404);
    const objectives = Array.isArray(body.objectives) ? body.objectives.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20) : [];
    const durationMinutes = Math.max(0, Math.round(Number(body.durationMinutes ?? 0)));
    const position = Math.max(1, Math.round(Number(body.position ?? 1)));
    let moduleId = requestedId;
    if (moduleId) {
      const moduleRows = await db.sql<{ id: string }>`SELECT id FROM modules WHERE id = ${moduleId} AND course_id = ${courseId} LIMIT 1`;
      if (!moduleRows[0]) return json({ error: "Module introuvable dans ce parcours" }, 404);
      await db.sql`
        UPDATE modules SET position = ${position}, title = ${title}, description = ${String(body.description ?? "")},
          content_type = ${contentType}, body = ${String(body.body ?? "")}, duration_minutes = ${durationMinutes},
          learning_objectives = ${JSON.stringify(objectives)}, published = ${body.published !== false}, updated_at = NOW()
        WHERE id = ${moduleId} AND course_id = ${courseId}
      `;
    } else {
      moduleId = crypto.randomUUID();
      await db.sql`
        INSERT INTO modules (id, course_id, position, title, description, content_type, body, duration_minutes, learning_objectives, lesson_content, published)
        VALUES (${moduleId}, ${courseId}, ${position}, ${title}, ${String(body.description ?? "")}, ${contentType}, ${String(body.body ?? "")}, ${durationMinutes}, ${JSON.stringify(objectives)}, ${JSON.stringify({ status: "draft" })}, ${body.published !== false})
      `;
    }
    await db.sql`UPDATE courses SET updated_at = NOW() WHERE id = ${courseId}`;
    return json({ ok: true, id: moduleId }, requestedId ? 200 : 201);
  }

  if (action === "add-resource-link" || action === "add-video-link") {
    const moduleId = String(body.moduleId ?? "");
    const externalUrl = String(body.url ?? "");
    const name = String(body.name ?? "Ressource externe").trim() || "Ressource externe";
    const requestedKind = action === "add-video-link" ? "video" : String(body.contentKind ?? "external");
    const contentKind = ["video", "audio", "external"].includes(requestedKind) ? requestedKind : "external";
    let parsed: URL;
    try { parsed = new URL(externalUrl); } catch { return json({ error: "Adresse du lien invalide" }, 400); }
    if (parsed.protocol !== "https:") return json({ error: "Une adresse HTTPS est requise" }, 400);
    const moduleRows = await db.sql<{ id: string }>`SELECT id FROM modules WHERE id = ${moduleId} LIMIT 1`;
    if (!moduleRows[0]) return json({ error: "Module introuvable" }, 404);
    const resourceId = crypto.randomUUID();
    if (contentKind === "video") await db.sql`UPDATE modules SET content_type = 'video', video_url = ${externalUrl}, updated_at = NOW() WHERE id = ${moduleId}`;
    await db.sql`
      INSERT INTO resources (id, module_id, name, resource_type, content_kind, external_url, uploaded_by)
      VALUES (${resourceId}, ${moduleId}, ${name}, 'link', ${contentKind}, ${externalUrl}, ${user.id})
    `;
    return json({ ok: true, resource: { id: resourceId, name, resource_type: "link", content_kind: contentKind, external_url: externalUrl } }, 201);
  }

  if (action === "publish-course") {
    const courseId = String(body.courseId ?? "");
    const [courseRows, moduleCount] = await Promise.all([
      db.sql<{ id: string }>`SELECT id FROM courses WHERE id = ${courseId} AND lifecycle_status <> 'catalog' LIMIT 1`,
      db.sql<{ count: number }>`SELECT COUNT(*)::INT AS count FROM modules WHERE course_id = ${courseId} AND published = TRUE`,
    ]);
    if (!courseRows[0]) return json({ error: "Formation en préparation introuvable" }, 404);
    if (!Number(moduleCount[0]?.count ?? 0)) return json({ error: "Ajoutez au moins un module avant la publication" }, 409);
    await db.sql`UPDATE courses SET published = TRUE, lifecycle_status = 'published', updated_at = NOW() WHERE id = ${courseId}`;
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${user.id}, 'course.published', 'course', ${courseId}, 'Formation publiée')
    `;
    return json({ ok: true });
  }

  if (action === "archive-course") {
    const courseId = String(body.courseId ?? "");
    if (!courseId) return json({ error: "Formation requise" }, 400);
    const rows = await db.sql<{ id: string }>`SELECT id FROM courses WHERE id = ${courseId} AND lifecycle_status <> 'catalog' LIMIT 1`;
    if (!rows[0]) return json({ error: "Formation introuvable" }, 404);
    await db.sql`UPDATE courses SET published = FALSE, lifecycle_status = 'archived', updated_at = NOW() WHERE id = ${courseId}`;
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${user.id}, 'course.archived', 'course', ${courseId}, 'Formation archivée')
    `;
    return json({ ok: true });
  }

  if (action === "set-quiz-published") {
    const quizId = String(body.quizId ?? "");
    const published = Boolean(body.published);
    if (!quizId) return json({ error: "Questionnaire requis" }, 400);
    const rows = await db.sql<{ id: string; course_id: string; question_count: number }>`
      SELECT q.id, q.course_id, COUNT(qq.id)::INT AS question_count
      FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
      WHERE q.id = ${quizId} AND q.archived_at IS NULL
      GROUP BY q.id
      LIMIT 1
    `;
    if (!rows[0]) return json({ error: "Questionnaire introuvable" }, 404);
    if (published && Number(rows[0].question_count) === 0) return json({ error: "Ajoutez au moins une question avant la publication" }, 409);
    await db.sql`UPDATE quizzes SET published = ${published}, updated_at = NOW() WHERE id = ${quizId}`;
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${published ? "quiz.published" : "quiz.unpublished"}, 'quiz', ${quizId}, ${published ? "QCM publié" : "QCM retiré de la publication"})
    `;
    return json({ ok: true, published });
  }

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
    const title = String(body.title ?? "Évaluation finale").trim();
    const threshold = Math.round(Number(body.threshold ?? 80));
    if (!title) return json({ error: "Titre du QCM requis" }, 400);
    if (threshold < 0 || threshold > 100) return json({ error: "Le seuil doit être compris entre 0 et 100 %" }, 400);
    const courseRows = await db.sql<{ id: string }>`SELECT id FROM courses WHERE id = ${courseId} AND lifecycle_status <> 'catalog' LIMIT 1`;
    if (!courseRows[0]) return json({ error: "Formation introuvable ou encore au stade catalogue" }, 404);
    const normalized = normalizeQuizQuestions(body.questions);
    if (!normalized.questions) return json({ error: normalized.error ?? "Questions invalides" }, 400);
    await persistQuizQuestions(db, { id, courseId, title, threshold, questions: normalized.questions, update: false });
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${user.id}, 'quiz.created', 'quiz', ${id}, 'QCM enregistré dans la base', ${JSON.stringify({ questionCount: normalized.questions.length, imported: Boolean(body.importedFileName), importedFileName: body.importedFileName ?? null })})
    `;
    return json({ ok: true, persisted: true, id, questionCount: normalized.questions.length }, 201);
  }

  if (action === "update-quiz") {
    const quizId = String(body.quizId ?? "");
    const title = String(body.title ?? "").trim();
    const threshold = Math.round(Number(body.threshold ?? 80));
    if (!quizId || !title) return json({ error: "Questionnaire et titre requis" }, 400);
    if (threshold < 0 || threshold > 100) return json({ error: "Le seuil doit être compris entre 0 et 100 %" }, 400);
    const quizRows = await db.sql<{ id: string; course_id: string; attempts: number }>`
      SELECT q.id, q.course_id, COUNT(qa.id)::INT AS attempts
      FROM quizzes q LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
      WHERE q.id = ${quizId} AND q.archived_at IS NULL
      GROUP BY q.id
      LIMIT 1
    `;
    if (!quizRows[0]) return json({ error: "Questionnaire introuvable" }, 404);
    const courseId = String(body.courseId ?? quizRows[0].course_id);
    if (courseId !== quizRows[0].course_id && Number(quizRows[0].attempts) > 0) return json({ error: "La formation ne peut plus être modifiée après une première participation" }, 409);
    const courseRows = await db.sql<{ id: string }>`SELECT id FROM courses WHERE id = ${courseId} AND lifecycle_status <> 'catalog' LIMIT 1`;
    if (!courseRows[0]) return json({ error: "Formation introuvable ou encore au stade catalogue" }, 404);
    const normalized = normalizeQuizQuestions(body.questions);
    if (!normalized.questions) return json({ error: normalized.error ?? "Questions invalides" }, 400);
    await persistQuizQuestions(db, { id: quizId, courseId, title, threshold, questions: normalized.questions, update: true });
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${user.id}, 'quiz.updated', 'quiz', ${quizId}, 'QCM modifié', ${JSON.stringify({ questionCount: normalized.questions.length })})
    `;
    return json({ ok: true, persisted: true, id: quizId, questionCount: normalized.questions.length });
  }

  if (action === "delete-quiz") {
    const quizId = String(body.quizId ?? "");
    if (!quizId) return json({ error: "Questionnaire requis" }, 400);
    const rows = await db.sql<{ id: string; title: string }>`SELECT id, title FROM quizzes WHERE id = ${quizId} AND archived_at IS NULL LIMIT 1`;
    if (!rows[0]) return json({ error: "Questionnaire introuvable" }, 404);
    await db.sql`UPDATE quizzes SET published = FALSE, archived_at = NOW(), updated_at = NOW() WHERE id = ${quizId}`;
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${user.id}, 'quiz.deleted', 'quiz', ${quizId}, 'QCM supprimé et archivé')
    `;
    return json({ ok: true, archived: true });
  }

  if (action === "create-training-group" || action === "update-training-group") {
    const requestedId = String(body.groupId ?? "");
    const groupId = action === "create-training-group" ? crypto.randomUUID() : requestedId;
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();
    const department = String(body.department ?? "").trim();
    const memberIds = Array.isArray(body.memberIds) ? Array.from(new Set(body.memberIds.map(String).filter(Boolean))).slice(0, 250) : [];
    if (!groupId || !name) return json({ error: "Nom du groupe requis" }, 400);
    if (!memberIds.length) return json({ error: "Sélectionnez au moins un apprenant" }, 400);
    const validMembers = await db.sql<{ id: string }>`SELECT id FROM users WHERE id = ANY(${memberIds}) AND role = 'learner' AND status = 'active'`;
    if (validMembers.length !== memberIds.length) return json({ error: "Un ou plusieurs apprenants sélectionnés sont introuvables ou inactifs" }, 400);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      if (action === "create-training-group") {
        await client.query(
          "INSERT INTO training_groups (id, name, description, department, created_by) VALUES ($1, $2, $3, $4, $5)",
          [groupId, name, description, department || null, user.id],
        );
      } else {
        const updated = await client.query(
          "UPDATE training_groups SET name = $1, description = $2, department = $3, updated_at = NOW() WHERE id = $4 AND status = 'active' RETURNING id",
          [name, description, department || null, groupId],
        );
        if (!updated.rowCount) throw new Error("Groupe introuvable");
        await client.query("DELETE FROM training_group_members WHERE group_id = $1", [groupId]);
      }
      for (const memberId of memberIds) {
        await client.query(
          "INSERT INTO training_group_members (group_id, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT (group_id, user_id) DO NOTHING",
          [groupId, memberId, user.id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${action === "create-training-group" ? "group.created" : "group.updated"}, 'training_group', ${groupId}, ${action === "create-training-group" ? "Groupe de formation créé" : "Groupe de formation modifié"}, ${JSON.stringify({ memberCount: memberIds.length, department: department || null })})
    `;
    return json({ ok: true, id: groupId, memberCount: memberIds.length }, action === "create-training-group" ? 201 : 200);
  }

  if (action === "delete-training-group") {
    const groupId = String(body.groupId ?? "");
    if (!groupId) return json({ error: "Groupe requis" }, 400);
    const rows = await db.sql<{ id: string }>`SELECT id FROM training_groups WHERE id = ${groupId} AND status = 'active' LIMIT 1`;
    if (!rows[0]) return json({ error: "Groupe introuvable" }, 404);
    await db.sql`UPDATE training_groups SET status = 'archived', updated_at = NOW() WHERE id = ${groupId}`;
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary)
      VALUES (${crypto.randomUUID()}, ${user.id}, 'group.deleted', 'training_group', ${groupId}, 'Groupe de formation supprimé')
    `;
    return json({ ok: true });
  }

  if (action === "assign-quiz") {
    const quizId = String(body.quizId ?? "");
    const targetType = String(body.targetType ?? "learner");
    const targetId = String(body.targetId ?? "");
    if (!quizId || !targetId || !["learner", "group"].includes(targetType)) return json({ error: "Questionnaire et destinataire requis" }, 400);
    const quizzes = await db.sql<{ id: string; course_id: string; title: string }>`SELECT id, course_id, title FROM quizzes WHERE id = ${quizId} AND archived_at IS NULL LIMIT 1`;
    if (!quizzes[0]) return json({ error: "Questionnaire introuvable" }, 404);
    const targets = targetType === "group"
      ? await db.sql<{ id: string }>`
          SELECT u.id FROM users u
          JOIN training_group_members tgm ON tgm.user_id = u.id
          JOIN training_groups tg ON tg.id = tgm.group_id
          WHERE tg.id = ${targetId} AND tg.status = 'active' AND u.role = 'learner' AND u.status = 'active'
        `
      : await db.sql<{ id: string }>`SELECT id FROM users WHERE id = ${targetId} AND role = 'learner' AND status = 'active' LIMIT 1`;
    if (!targets.length) return json({ error: targetType === "group" ? "Ce groupe ne contient aucun apprenant actif" : "Apprenant introuvable ou inactif" }, 404);
    const dueAt = body.dueAt ? String(body.dueAt) : null;
    const note = String(body.note ?? "").trim() || null;
    const groupId = targetType === "group" ? targetId : null;
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE quizzes SET published = TRUE, targeted = TRUE, updated_at = NOW() WHERE id = $1", [quizId]);
      for (const target of targets) {
        await client.query(
          `INSERT INTO enrollments (id, user_id, course_id, assigned_by, due_at, assignment_note, assignment_source)
           VALUES ($1, $2, $3, $4, $5, $6, 'admin')
           ON CONFLICT (user_id, course_id) DO UPDATE SET assigned_by = EXCLUDED.assigned_by,
             due_at = COALESCE(EXCLUDED.due_at, enrollments.due_at), assignment_note = COALESCE(EXCLUDED.assignment_note, enrollments.assignment_note), updated_at = NOW()`,
          [crypto.randomUUID(), target.id, quizzes[0].course_id, user.id, dueAt, note],
        );
        await client.query(
          `DELETE FROM quiz_assignments
           WHERE user_id = $1 AND quiz_id IN (SELECT id FROM quizzes WHERE course_id = $2 AND id <> $3)`,
          [target.id, quizzes[0].course_id, quizId],
        );
        await client.query(
          `INSERT INTO quiz_assignments (id, quiz_id, user_id, training_group_id, assigned_by, due_at, assignment_note, assignment_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (quiz_id, user_id) DO UPDATE SET training_group_id = EXCLUDED.training_group_id,
             assigned_by = EXCLUDED.assigned_by, due_at = EXCLUDED.due_at, assignment_note = EXCLUDED.assignment_note,
             assignment_source = EXCLUDED.assignment_source, assigned_at = NOW(), updated_at = NOW()`,
          [crypto.randomUUID(), quizId, target.id, groupId, user.id, dueAt, note, targetType === "group" ? "group" : "individual"],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await db.sql`
      INSERT INTO activity_events (id, actor_id, event_type, entity_type, entity_id, summary, metadata)
      VALUES (${crypto.randomUUID()}, ${user.id}, 'quiz.assigned', 'quiz', ${quizId}, 'QCM affecté aux apprenants', ${JSON.stringify({ targetType, targetId, learnerCount: targets.length, dueAt })})
    `;
    return json({ ok: true, assignedCount: targets.length, published: true });
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
