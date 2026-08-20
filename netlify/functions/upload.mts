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
  if (request.method !== "POST") return Response.json({ error: "Méthode non autorisée" }, { status: 405 });
  verifyRequestOrigin(request);
  const identityUser = await getUser();
  if (!identityUser) return Response.json({ error: "Authentification requise" }, { status: 401 });
  const user = identityUser as unknown as { id: string; roles: string[] };
  if (!user.roles.includes("admin")) return Response.json({ error: "Accès administrateur requis" }, { status: 403 });

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
