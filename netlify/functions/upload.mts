import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";
import { getUser, verifyRequestOrigin } from "@netlify/identity";
import JSZip from "jszip";

const allowedExtensions = new Set([
  "pdf", "doc", "docx", "ppt", "pptx",
  "mp4", "webm", "mp3", "wav", "m4a", "ogg", "aac",
  "zip",
]);
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxResourceSize = 50 * 1024 * 1024;
const maxDirectResourceSize = 4 * 1024 * 1024;
const maxChunkSize = 3 * 1024 * 1024;
const maxChunkCount = Math.ceil(maxResourceSize / maxChunkSize);

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function contentKind(file: Pick<File, "name" | "type">) {
  const extension = extensionOf(file.name);
  if (extension === "zip") return "scorm";
  if (["ppt", "pptx"].includes(extension)) return "presentation";
  if (["mp4", "webm"].includes(extension) || file.type.startsWith("video/")) return "video";
  if (["mp3", "wav", "m4a", "ogg", "aac"].includes(extension) || file.type.startsWith("audio/")) return "audio";
  if (["pdf", "doc", "docx"].includes(extension)) return "document";
  return "";
}

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

async function inspectScormPackage(file: File) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true });
  } catch {
    throw new Error("Le package SCORM est illisible ou son archive ZIP est endommagée.");
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (!entries.length || entries.length > 1000) throw new Error("Le package SCORM doit contenir entre 1 et 1 000 fichiers.");
  if (entries.some((entry) => entry.name.startsWith("/") || entry.name.split("/").includes(".."))) throw new Error("Le package SCORM contient un chemin de fichier non sécurisé.");
  const uncompressedSize = entries.reduce((total, entry) => total + Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (uncompressedSize > 250 * 1024 * 1024) throw new Error("Le package SCORM dépasse 250 Mo après décompression.");
  const manifest = entries.find((entry) => entry.name.toLowerCase().endsWith("imsmanifest.xml"));
  if (!manifest) throw new Error("Package SCORM invalide : le fichier imsmanifest.xml est absent.");
  const manifestSize = Number((manifest as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
  if (manifestSize > 2 * 1024 * 1024) throw new Error("Le manifeste SCORM est anormalement volumineux.");
  const manifestText = await manifest.async("text");
  const versionText = manifestText.match(/<schemaversion[^>]*>([^<]+)<\/schemaversion>/i)?.[1]?.trim() ?? "";
  const version = /2004|1\.3/i.test(versionText) ? "SCORM 2004" : /1\.2/i.test(versionText) ? "SCORM 1.2" : "SCORM compatible";
  const launchPath = manifestText.match(/<resource\b[^>]*\bhref=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
  return { version, launchPath, entryCount: entries.length, manifestPath: manifest.name };
}

const handler = async (request: Request) => {
  const identityUser = await getUser();
  if (!identityUser) return Response.json({ error: "Authentification requise" }, { status: 401 });
  const user = identityUser as unknown as { id: string; roles?: string[] };
  const roles = user.roles ?? [];
  const isStaff = roles.includes("admin") || roles.includes("super_admin");

  if (request.method === "GET") {
    const url = new URL(request.url);
    const avatarId = url.searchParams.get("avatar") ?? "";
    if (avatarId) {
      const targetUserId = avatarId === "me" ? user.id : avatarId;
      if (!isStaff && targetUserId !== user.id) return Response.json({ error: "Accès à cette photo refusé" }, { status: 403 });
      const db = getDatabase();
      const rows = await db.sql`
        SELECT profile_metadata->>'avatar_storage_key' AS storage_key,
               profile_metadata->>'avatar_mime_type' AS mime_type
        FROM users WHERE id = ${targetUserId} LIMIT 1
      `;
      const avatar = rows[0];
      if (!avatar?.storage_key) return Response.json({ error: "Photo de profil introuvable" }, { status: 404 });
      const avatarStore = getStore("walyah-lms-avatars");
      const stream = await avatarStore.get(String(avatar.storage_key), { type: "stream" });
      if (!stream) return Response.json({ error: "Photo de profil introuvable" }, { status: 404 });
      return new Response(stream, { headers: { "Content-Type": String(avatar.mime_type ?? "image/jpeg"), "Content-Disposition": "inline", "Cache-Control": "private, max-age=300" } });
    }

    const resourceId = url.searchParams.get("resourceId") ?? "";
    if (!resourceId) return Response.json({ error: "resourceId requis" }, { status: 400 });
    const db = getDatabase();
    const resources = isStaff ? await db.sql`
      SELECT id, storage_key, name, mime_type, content_kind FROM resources WHERE id = ${resourceId} AND resource_type = 'file' LIMIT 1
    ` : await db.sql`
      SELECT r.id, r.storage_key, r.name, r.mime_type, r.content_kind
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
    const inline = ["document", "video", "audio"].includes(String(resource.content_kind));
    return new Response(stream, { headers: { "Content-Type": String(resource.mime_type ?? "application/octet-stream"), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }

  if (request.method === "DELETE") {
    if (!isStaff) return Response.json({ error: "Accès administrateur requis" }, { status: 403 });
    verifyRequestOrigin(request);
    const body = await request.json() as { resourceId?: string };
    const resourceId = String(body.resourceId ?? "");
    if (!resourceId) return Response.json({ error: "resourceId requis" }, { status: 400 });
    const db = getDatabase();
    const rows = await db.sql`SELECT storage_key FROM resources WHERE id = ${resourceId} AND resource_type = 'file' LIMIT 1`;
    if (!rows[0]) {
      await db.sql`DELETE FROM resources WHERE id = ${resourceId}`;
      return Response.json({ ok: true });
    }
    if (rows[0].storage_key) await getStore("walyah-lms-content").delete(String(rows[0].storage_key));
    await db.sql`DELETE FROM resources WHERE id = ${resourceId}`;
    return Response.json({ ok: true });
  }

  if (request.method !== "POST") return Response.json({ error: "Méthode non autorisée" }, { status: 405 });
  verifyRequestOrigin(request);

  if (request.headers.get("content-type")?.includes("application/json")) {
    if (!isStaff) return Response.json({ error: "Accès administrateur requis" }, { status: 403 });
    const body = await request.json() as { action?: string; uploadId?: string; moduleId?: string; fileName?: string; fileType?: string; chunkCount?: number; totalSize?: number };
    if (body.action !== "finalize-resource-upload") return Response.json({ error: "Action d’import inconnue" }, { status: 400 });
    const uploadId = String(body.uploadId ?? "");
    const moduleId = String(body.moduleId ?? "");
    const fileName = String(body.fileName ?? "");
    const fileType = String(body.fileType ?? "application/octet-stream");
    const chunkCount = Math.round(Number(body.chunkCount ?? 0));
    const totalSize = Math.round(Number(body.totalSize ?? 0));
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(uploadId) || !moduleId || !fileName) return Response.json({ error: "Informations d’import incomplètes" }, { status: 400 });
    if (totalSize < 1 || totalSize > maxResourceSize) return Response.json({ error: "La taille maximale est de 50 Mo" }, { status: 413 });
    if (chunkCount < 1 || chunkCount > maxChunkCount || chunkCount !== Math.ceil(totalSize / maxChunkSize)) return Response.json({ error: "Découpage du fichier invalide" }, { status: 400 });
    const extension = extensionOf(fileName);
    const kind = contentKind({ name: fileName, type: fileType });
    if (!allowedExtensions.has(extension) || !kind) return Response.json({ error: "Format autorisé : PDF, Word, PowerPoint, vidéo, audio ou package SCORM ZIP" }, { status: 415 });

    const db = getDatabase();
    const moduleRows = await db.sql`SELECT id FROM modules WHERE id = ${moduleId} LIMIT 1`;
    if (!moduleRows[0]) return Response.json({ error: "Module introuvable" }, { status: 404 });
    const partStore = getStore("walyah-lms-upload-parts");
    const partKeys = Array.from({ length: chunkCount }, (_, index) => `${user.id}/${uploadId}/${index}`);
    const parts: ArrayBuffer[] = [];
    for (const key of partKeys) {
      const part = await partStore.get(key, { type: "arrayBuffer", consistency: "strong" });
      if (!(part instanceof ArrayBuffer)) return Response.json({ error: "Un bloc du fichier est manquant. Relancez l’import." }, { status: 409 });
      parts.push(part);
    }
    const assembledSize = parts.reduce((sum, part) => sum + part.byteLength, 0);
    if (assembledSize !== totalSize) return Response.json({ error: "Le fichier reçu est incomplet. Relancez l’import." }, { status: 409 });
    const assembledFile = new File(parts, fileName, { type: fileType });
    let metadata: Record<string, unknown> = { chunkedUpload: true, chunkCount };
    if (kind === "scorm") {
      try {
        metadata = { ...metadata, ...await inspectScormPackage(assembledFile) };
      } catch (error) {
        await Promise.all(partKeys.map((key) => partStore.delete(key)));
        return Response.json({ error: error instanceof Error ? error.message : "Package SCORM invalide" }, { status: 415 });
      }
    }

    const id = crypto.randomUUID();
    const storageKey = `${moduleId}/${id}-${safeFileName(fileName)}`;
    await getStore("walyah-lms-content").set(storageKey, assembledFile, { metadata: { originalName: fileName, moduleId, uploadedBy: user.id, contentKind: kind, ...metadata } });
    await db.sql`
      INSERT INTO resources (id, module_id, name, resource_type, content_kind, storage_key, mime_type, size_bytes, metadata, uploaded_by)
      VALUES (${id}, ${moduleId}, ${fileName}, 'file', ${kind}, ${storageKey}, ${fileType}, ${totalSize}, ${JSON.stringify(metadata)}, ${user.id})
    `;
    if (["video", "audio", "scorm"].includes(kind)) await db.sql`UPDATE modules SET content_type = ${kind}, updated_at = NOW() WHERE id = ${moduleId}`;
    await Promise.all(partKeys.map((key) => partStore.delete(key)));
    return Response.json({ id, name: fileName, storageKey, size: totalSize, contentKind: kind, metadata }, { status: 201 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const purpose = String(form.get("purpose") ?? "resource");
  if (!(file instanceof File)) return Response.json({ error: "Fichier requis" }, { status: 400 });

  if (purpose === "avatar") {
    if (file.size > maxDirectResourceSize) return Response.json({ error: "La photo ne doit pas dépasser 4 Mo" }, { status: 413 });
    if (!allowedAvatarTypes.has(file.type)) return Response.json({ error: "Format autorisé : JPG, PNG ou WebP" }, { status: 415 });
    const storageKey = `${user.id}/avatar`;
    const avatarStore = getStore("walyah-lms-avatars");
    await avatarStore.set(storageKey, file, { metadata: { originalName: file.name, uploadedBy: user.id, purpose: "profile-avatar" } });
    const db = getDatabase();
    await db.sql`
      UPDATE users SET profile_metadata = COALESCE(profile_metadata, '{}'::JSONB) ||
        JSONB_BUILD_OBJECT('avatar_storage_key', ${storageKey}, 'avatar_mime_type', ${file.type}, 'avatar_updated_at', NOW()::TEXT)
      WHERE id = ${user.id}
    `;
    return Response.json({ ok: true, avatarUrl: "/.netlify/functions/upload?avatar=me" }, { status: 201 });
  }

  if (!isStaff) return Response.json({ error: "Accès administrateur requis" }, { status: 403 });
  const moduleId = String(form.get("moduleId") ?? "");
  if (!moduleId) return Response.json({ error: "Sélectionnez d’abord un module" }, { status: 400 });
  if (file.size > maxChunkSize && purpose === "resource-chunk") return Response.json({ error: "Bloc d’import trop volumineux" }, { status: 413 });
  if (file.size > maxResourceSize) return Response.json({ error: "La taille maximale est de 50 Mo" }, { status: 413 });
  const extension = extensionOf(file.name);
  const kind = contentKind(file);
  if (!allowedExtensions.has(extension) || !kind) return Response.json({ error: "Format autorisé : PDF, Word, PowerPoint, vidéo, audio ou package SCORM ZIP" }, { status: 415 });

  const db = getDatabase();
  const moduleRows = await db.sql`SELECT id FROM modules WHERE id = ${moduleId} LIMIT 1`;
  if (!moduleRows[0]) return Response.json({ error: "Module introuvable" }, { status: 404 });

  if (purpose === "resource-chunk") {
    const uploadId = String(form.get("uploadId") ?? "");
    const chunkIndex = Math.round(Number(form.get("chunkIndex") ?? -1));
    const chunkCount = Math.round(Number(form.get("chunkCount") ?? 0));
    const totalSize = Math.round(Number(form.get("totalSize") ?? 0));
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(uploadId) || chunkIndex < 0 || chunkIndex >= chunkCount || chunkCount < 1 || chunkCount > maxChunkCount) return Response.json({ error: "Bloc d’import invalide" }, { status: 400 });
    if (totalSize < 1 || totalSize > maxResourceSize || chunkCount !== Math.ceil(totalSize / maxChunkSize)) return Response.json({ error: "Découpage du fichier invalide" }, { status: 400 });
    const partKey = `${user.id}/${uploadId}/${chunkIndex}`;
    await getStore("walyah-lms-upload-parts").set(partKey, file, { metadata: { moduleId, fileName: file.name, chunkIndex, chunkCount, totalSize, uploadedBy: user.id } });
    return Response.json({ ok: true, chunkIndex }, { status: 201 });
  }

  if (file.size > maxDirectResourceSize) return Response.json({ error: "Utilisez l’import segmenté du studio pour les fichiers de plus de 4 Mo" }, { status: 413 });

  let metadata: Record<string, unknown> = {};
  if (kind === "scorm") {
    try {
      metadata = await inspectScormPackage(file);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Package SCORM invalide" }, { status: 415 });
    }
  }

  const id = crypto.randomUUID();
  const storageKey = `${moduleId}/${id}-${safeFileName(file.name)}`;
  const store = getStore("walyah-lms-content");
  await store.set(storageKey, file, { metadata: { originalName: file.name, moduleId, uploadedBy: user.id, contentKind: kind, ...metadata } });
  await db.sql`
    INSERT INTO resources (id, module_id, name, resource_type, content_kind, storage_key, mime_type, size_bytes, metadata, uploaded_by)
    VALUES (${id}, ${moduleId}, ${file.name}, 'file', ${kind}, ${storageKey}, ${file.type || "application/octet-stream"}, ${file.size}, ${JSON.stringify(metadata)}, ${user.id})
  `;
  if (["video", "audio", "scorm"].includes(kind)) await db.sql`UPDATE modules SET content_type = ${kind}, updated_at = NOW() WHERE id = ${moduleId}`;

  return Response.json({ id, name: file.name, storageKey, size: file.size, contentKind: kind, metadata }, { status: 201 });
};

export default handler;
