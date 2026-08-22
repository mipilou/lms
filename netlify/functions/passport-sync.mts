import { getDatabase } from "@netlify/database";

type PassportPayload = {
  eventType?: string;
  idempotencyKey?: string;
  data?: Record<string, unknown>;
};

const encoder = new TextEncoder();

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = process.env.PASSPORT_ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": origin && allowed && origin === allowed ? origin : "null",
    "Access-Control-Allow-Headers": "content-type,x-walyah-signature,x-walyah-timestamp",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(request: Request, data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders(request) });
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function expectedSignature(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return `sha256=${Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function verify(request: Request, body: string) {
  const secret = process.env.PASSPORT_WEBHOOK_SECRET;
  if (!secret) return { ok: false, status: 503, error: "Intégration passeport non configurée" };
  const timestamp = request.headers.get("x-walyah-timestamp") ?? "";
  const signature = request.headers.get("x-walyah-signature") ?? "";
  const parsedTimestamp = Number(timestamp);
  if (!parsedTimestamp || Math.abs(Date.now() - parsedTimestamp * 1000) > 5 * 60 * 1000) return { ok: false, status: 401, error: "Horodatage invalide ou expiré" };
  const expected = await expectedSignature(secret, timestamp, body);
  if (!constantTimeEqual(signature, expected)) return { ok: false, status: 401, error: "Signature invalide" };
  return { ok: true, status: 200, error: "" };
}

const handler = async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET" && request.method !== "POST") return json(request, { error: "Méthode non autorisée" }, 405);

  const rawBody = request.method === "POST" ? await request.text() : "";
  const verified = await verify(request, rawBody);
  if (!verified.ok) return json(request, { error: verified.error }, verified.status);
  const db = getDatabase();

  if (request.method === "GET") {
    const events = await db.sql`
      SELECT id, event_type, idempotency_key, subject_user_id, payload, occurred_at
      FROM integration_events
      WHERE integration = 'formation_passport' AND direction = 'outbound' AND status = 'pending'
      ORDER BY occurred_at
      LIMIT 100
    `;
    return json(request, { events });
  }

  let payload: PassportPayload;
  try {
    payload = JSON.parse(rawBody) as PassportPayload;
  } catch {
    return json(request, { error: "Corps JSON invalide" }, 400);
  }
  const eventType = String(payload.eventType ?? "");
  const idempotencyKey = String(payload.idempotencyKey ?? "");
  const data = payload.data ?? {};
  if (!eventType || !idempotencyKey) return json(request, { error: "eventType et idempotencyKey requis" }, 400);

  if (eventType === "events.acknowledge") {
    const keys = Array.isArray(data.keys) ? data.keys.map(String) : [];
    for (const key of keys.slice(0, 100)) {
      await db.sql`UPDATE integration_events SET status = 'processed', processed_at = NOW() WHERE integration = 'formation_passport' AND direction = 'outbound' AND idempotency_key = ${key}`;
    }
    return json(request, { ok: true, acknowledged: keys.length });
  }

  const existing = await db.sql`SELECT id, status FROM integration_events WHERE idempotency_key = ${idempotencyKey} LIMIT 1`;
  if (existing[0]) return json(request, { ok: true, duplicate: true });

  const matricule = data.matricule ? String(data.matricule) : null;
  const email = data.email ? String(data.email).toLowerCase() : null;
  const userRows = matricule
    ? await db.sql`SELECT id FROM users WHERE matricule = ${matricule} LIMIT 1`
    : email ? await db.sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1` : [];
  let subjectUserId = userRows[0]?.id ? String(userRows[0].id) : null;

  if (eventType === "employee.upsert") {
    if (!email) return json(request, { error: "email requis pour employee.upsert" }, 400);
    const fullName = String(data.fullName ?? email.split("@")[0]);
    if (subjectUserId) {
      await db.sql`
        UPDATE users SET email = ${email}, full_name = ${fullName}, matricule = COALESCE(${matricule}, matricule), phone = COALESCE(${data.phone ? String(data.phone) : null}, phone), department = COALESCE(${data.department ? String(data.department) : null}, department), job_title = COALESCE(${data.jobTitle ? String(data.jobTitle) : null}, job_title), manager_name = COALESCE(${data.managerName ? String(data.managerName) : null}, manager_name), location = COALESCE(${data.location ? String(data.location) : null}, location)
        WHERE id = ${subjectUserId}
      `;
    } else {
      subjectUserId = crypto.randomUUID();
      await db.sql`
        INSERT INTO users (id, email, full_name, role, matricule, phone, department, job_title, manager_name, location)
        VALUES (${subjectUserId}, ${email}, ${fullName}, 'learner', ${matricule}, ${data.phone ? String(data.phone) : null}, ${data.department ? String(data.department) : null}, ${data.jobTitle ? String(data.jobTitle) : null}, ${data.managerName ? String(data.managerName) : null}, ${data.location ? String(data.location) : null})
        ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, matricule = COALESCE(EXCLUDED.matricule, users.matricule), phone = COALESCE(EXCLUDED.phone, users.phone), department = COALESCE(EXCLUDED.department, users.department), job_title = COALESCE(EXCLUDED.job_title, users.job_title), manager_name = COALESCE(EXCLUDED.manager_name, users.manager_name), location = COALESCE(EXCLUDED.location, users.location)
      `;
      const created = await db.sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
      subjectUserId = created[0]?.id ? String(created[0].id) : subjectUserId;
    }
  }

  if (!subjectUserId) return json(request, { error: "Collaborateur introuvable : utilisez un matricule ou un e-mail connu" }, 404);

  const courseCode = data.courseCode ? String(data.courseCode) : null;
  const courseRows = courseCode ? await db.sql`SELECT id FROM courses WHERE code = ${courseCode} LIMIT 1` : [];
  const courseId = courseRows[0]?.id ? String(courseRows[0].id) : null;

  if (eventType === "training.requested") {
    await db.sql`
      INSERT INTO training_requests (id, user_id, course_id, title, reason, priority, status, source, history)
      VALUES (${crypto.randomUUID()}, ${subjectUserId}, ${courseId}, ${String(data.title ?? courseCode ?? "Demande de formation")}, ${data.reason ? String(data.reason) : null}, ${String(data.priority ?? "normal")}, 'submitted', 'passport', ${JSON.stringify([{ at: new Date().toISOString(), event: "submitted", source: "passport" }])})
    `;
  } else if (eventType === "course.assigned") {
    if (!courseId) return json(request, { error: "Formation introuvable" }, 404);
    await db.sql`
      INSERT INTO enrollments (id, user_id, course_id, due_at, assignment_note, assignment_source)
      VALUES (${crypto.randomUUID()}, ${subjectUserId}, ${courseId}, ${data.dueAt ? String(data.dueAt) : null}, 'Assignation reçue du passeport', 'passport')
      ON CONFLICT (user_id, course_id) DO UPDATE SET due_at = EXCLUDED.due_at, assignment_note = EXCLUDED.assignment_note, assignment_source = 'passport', updated_at = NOW()
    `;
  } else if (eventType === "training.completed") {
    if (!courseId) return json(request, { error: "Formation introuvable" }, 404);
    const score = Number(data.score ?? 0);
    await db.sql`
      INSERT INTO enrollments (id, user_id, course_id, status, progress_percent, completed_at, assignment_note, assignment_source)
      VALUES (${crypto.randomUUID()}, ${subjectUserId}, ${courseId}, 'completed', 100, NOW(), 'Résultat reçu du passeport', 'passport')
      ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'completed', progress_percent = 100, completed_at = NOW(), assignment_source = 'passport', updated_at = NOW()
    `;
    if (Boolean(data.certificate) || score > 0) {
      const number = String(data.certificateNumber ?? `WAL-PASS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
      await db.sql`
        INSERT INTO certificates (id, certificate_number, user_id, course_id, score, metadata)
        VALUES (${crypto.randomUUID()}, ${number}, ${subjectUserId}, ${courseId}, ${score || null}, ${JSON.stringify({ source: "formation_passport" })})
        ON CONFLICT (user_id, course_id) DO UPDATE SET score = EXCLUDED.score, issued_at = NOW(), metadata = EXCLUDED.metadata
      `;
    }
  } else if (eventType !== "employee.upsert") {
    return json(request, { error: "Type d’événement non pris en charge" }, 400);
  }

  await db.sql`
    INSERT INTO passport_connections (id, user_id, external_employee_id, match_key, sync_status, last_synced_at, updated_at)
    VALUES (${crypto.randomUUID()}, ${subjectUserId}, ${data.externalEmployeeId ? String(data.externalEmployeeId) : null}, ${matricule ? "matricule" : "email"}, 'connected', NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET external_employee_id = COALESCE(EXCLUDED.external_employee_id, passport_connections.external_employee_id), match_key = EXCLUDED.match_key, sync_status = 'connected', last_synced_at = NOW(), last_error = NULL, updated_at = NOW()
  `;
  await db.sql`
    INSERT INTO integration_events (id, integration, direction, event_type, idempotency_key, subject_user_id, payload, status, processed_at)
    VALUES (${crypto.randomUUID()}, 'formation_passport', 'inbound', ${eventType}, ${idempotencyKey}, ${subjectUserId}, ${JSON.stringify(data)}, 'processed', NOW())
  `;
  await db.sql`
    INSERT INTO activity_events (id, user_id, event_type, entity_type, entity_id, summary, metadata)
    VALUES (${crypto.randomUUID()}, ${subjectUserId}, ${eventType}, ${courseId ? "course" : "user"}, ${courseId ?? subjectUserId}, ${`Événement reçu du passeport : ${eventType}`}, ${JSON.stringify({ idempotencyKey })})
  `;
  return json(request, { ok: true, userId: subjectUserId, courseId });
};

export default handler;
