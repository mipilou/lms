import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";
import { getUser, verifyRequestOrigin } from "@netlify/identity";

const allowedTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
]);

const handler = async (request: Request) => {
  const identityUser = await getUser();
  if (!identityUser) return Response.json({ error: "Authentification requise" }, { status: 401 });
  const user = identityUser as unknown as { id: string; roles?: string[] };
  const roles = user.roles ?? [];
  const isStaff = roles.includes("admin") || roles.includes("super_admin");

  if (request.method === "GET") {
    const resourceId = new URL(request.url).searchParams.get("resourceId") ?? "";
    if (!resourceId) return Response.json({ error: "resourceId requis" }, { status: 400 });
    const db = getDatabase();
    const resources = isStaff ? await db.sql`
      SELECT id, storage_key, name, mime_type FROM resources WHERE id = ${resourceId} AND resource_type = 'file' LIMIT 1
    ` : await db.sql`
      SELECT r.id, r.storage_key, r.name, r.mime_type
      FROM resources r
      JOIN modules m ON m.id = r.module_id
      JOIN enrollments e ON e.course_id = m.course_id AND e.user_id = ${user.id}
      WHERE r.id = ${resourceId} AND r.resource_type = 'file'
      LIMIT 1
    `;
    const resource = resources[0];
    if (!resource?.storage_key) return Response.json({ error: "Ressource introuvable" }, { status: 404 });
    const store = getStore("walyah-lms-content");
    const stream = await store.get(String(resource.storage_key), { type: "stream" });
    if (!stream) return Response.json({ error: "Fichier introuvable" }, { status: 404 });
    const safeName = String(resource.name ?? "ressource").replace(/[\r\n"]/g, "-");
    return new Response(stream, { headers: { "Content-Type": String(resource.mime_type ?? "application/octet-stream"), "Content-Disposition": `attachment; filename="${safeName}"`, "Cache-Control": "private, no-store" } });
  }

  if (request.method !== "POST") return Response.json({ error: "Méthode non autorisée" }, { status: 405 });
  verifyRequestOrigin(request);
  if (!isStaff) return Response.json({ error: "Accès administrateur requis" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const moduleId = String(form.get("moduleId") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Fichier requis" }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return Response.json({ error: "La taille maximale est de 50 Mo" }, { status: 413 });
  if (!allowedTypes.has(file.type)) return Response.json({ error: "Format de fichier non autorisé" }, { status: 415 });

  const id = crypto.randomUUID();
  const storageKey = `${moduleId || "unassigned"}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const store = getStore("walyah-lms-content");
  await store.set(storageKey, file, { metadata: { originalName: file.name, moduleId, uploadedBy: user.id } });

  if (moduleId) {
    const db = getDatabase();
    await db.sql`
      INSERT INTO resources (id, module_id, name, resource_type, storage_key, mime_type, size_bytes, uploaded_by)
      VALUES (${id}, ${moduleId}, ${file.name}, ${"file"}, ${storageKey}, ${file.type}, ${file.size}, ${user.id})
    `;
  }

  return Response.json({ id, name: file.name, storageKey, size: file.size }, { status: 201 });
};

export default handler;
