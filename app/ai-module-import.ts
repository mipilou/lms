import type { LessonBlock, LessonBlockType, LessonContent } from "./data";

export type AiModuleResource = {
  name: string;
  url: string;
  kind: "video" | "audio" | "document" | "external" | "drive";
};

export type ImportedAiModule = {
  title: string;
  summary: string;
  durationMinutes: number;
  objectives: string[];
  contentType: "text" | "video" | "document" | "audio" | "scorm" | "quiz";
  lessonContent: LessonContent;
  resources: AiModuleResource[];
};

export type AiModuleImportResult = {
  modules: ImportedAiModule[];
  warnings: string[];
};

const BLOCK_TYPES = new Set<LessonBlockType>(["hero", "text", "objectives", "steps", "callout", "case_study", "knowledge_check", "summary"]);
const CONTENT_TYPES = new Set<ImportedAiModule["contentType"]>(["text", "video", "document", "audio", "scorm", "quiz"]);
const RESOURCE_KINDS = new Set<AiModuleResource["kind"]>(["video", "audio", "document", "external", "drive"]);
const LAYOUTS = new Set<LessonContent["layout"]>(["signature", "atelier", "essentiel"]);

const text = (value: unknown, max = 5_000) => String(value ?? "").trim().slice(0, max);
const stringList = (value: unknown, maxItems = 20, maxLength = 500) => Array.isArray(value)
  ? value.map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems)
  : [];

function secureUrl(value: unknown, label: string) {
  const candidate = text(value, 2_000);
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new Error(`${label} : adresse URL invalide.`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} : une adresse HTTPS est requise.`);
  return parsed.toString();
}

function normalizeBlock(value: unknown, index: number): LessonBlock {
  if (!value || typeof value !== "object") throw new Error(`Bloc ${index + 1} : structure invalide.`);
  const raw = value as Record<string, unknown>;
  const type = text(raw.type, 40) as LessonBlockType;
  if (!BLOCK_TYPES.has(type)) throw new Error(`Bloc ${index + 1} : type « ${type || "vide"} » non accepté.`);
  const title = text(raw.title, 180) || (type === "hero" ? "Introduction" : `Section ${index + 1}`);
  const block: LessonBlock = {
    id: text(raw.id, 80) || `block-${crypto.randomUUID()}`,
    type,
    title,
  };
  const body = text(raw.body ?? raw.lead ?? raw.context, 12_000);
  if (body) block.body = body;
  const items = stringList(raw.items, 20, 700);
  if (items.length) block.items = items;
  const prompt = text(raw.prompt ?? raw.question, 1_500);
  if (prompt) block.prompt = prompt;
  const options = stringList(raw.options, 6, 500);
  if (options.length) block.options = options;
  const tone = text(raw.tone, 20);
  if (["info", "success", "warning"].includes(tone)) block.tone = tone as LessonBlock["tone"];
  if (Number.isInteger(Number(raw.correctAnswer))) block.correctAnswer = Math.max(0, Number(raw.correctAnswer));
  const explanation = text(raw.explanation, 2_000);
  if (explanation) block.explanation = explanation;
  if (type === "knowledge_check" && (!block.prompt || (block.options?.length ?? 0) < 2)) {
    throw new Error(`Bloc ${index + 1} : la vérification doit contenir une question et au moins deux réponses.`);
  }
  return block;
}

function normalizeModule(value: unknown, index: number): ImportedAiModule {
  if (!value || typeof value !== "object") throw new Error(`Module ${index + 1} : structure invalide.`);
  const raw = value as Record<string, unknown>;
  const title = text(raw.title, 220);
  if (!title) throw new Error(`Module ${index + 1} : titre requis.`);
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (!rawBlocks.length || rawBlocks.length > 30) throw new Error(`Module ${index + 1} : prévoyez entre 1 et 30 blocs pédagogiques.`);
  const layoutValue = text(raw.layout, 30) as LessonContent["layout"];
  const layout = LAYOUTS.has(layoutValue) ? layoutValue : "signature";
  const contentTypeValue = text(raw.contentType ?? raw.content_type, 30) as ImportedAiModule["contentType"];
  const contentType = CONTENT_TYPES.has(contentTypeValue) ? contentTypeValue : "text";
  const resources = (Array.isArray(raw.resources) ? raw.resources : []).slice(0, 25).map((item, resourceIndex): AiModuleResource => {
    if (!item || typeof item !== "object") throw new Error(`Module ${index + 1}, ressource ${resourceIndex + 1} : structure invalide.`);
    const resource = item as Record<string, unknown>;
    const kindValue = text(resource.kind, 30) as AiModuleResource["kind"];
    return {
      name: text(resource.name ?? resource.label, 220) || `Ressource ${resourceIndex + 1}`,
      url: secureUrl(resource.url, `Module ${index + 1}, ressource ${resourceIndex + 1}`),
      kind: RESOURCE_KINDS.has(kindValue) ? kindValue : "external",
    };
  });
  const blocks = rawBlocks.map(normalizeBlock);
  return {
    title,
    summary: text(raw.summary ?? raw.description, 5_000),
    durationMinutes: Math.min(1_440, Math.max(0, Math.round(Number(raw.durationMinutes ?? raw.duration_minutes ?? 15)))),
    objectives: stringList(raw.objectives, 20, 500),
    contentType,
    lessonContent: { schemaVersion: "walyah-lms-module-v1", layout, blocks },
    resources,
  };
}

export function parseAiModuleManifest(value: unknown): AiModuleImportResult {
  if (!value || typeof value !== "object") throw new Error("Le fichier doit contenir un objet JSON.");
  const root = value as Record<string, unknown>;
  const schemaVersion = text(root.schemaVersion, 80);
  if (schemaVersion !== "walyah-lms-module-v1") throw new Error("Version de format invalide. Utilisez « walyah-lms-module-v1 ».");
  const rawModules = Array.isArray(root.modules) ? root.modules : root.module ? [root.module] : [];
  if (!rawModules.length || rawModules.length > 20) throw new Error("Le fichier doit contenir entre 1 et 20 modules.");
  const modules = rawModules.map(normalizeModule);
  const warnings: string[] = [];
  modules.forEach((module, index) => {
    if (!module.summary) warnings.push(`Module ${index + 1} : aucun résumé fourni.`);
    if (!module.objectives.length) warnings.push(`Module ${index + 1} : aucun objectif fourni.`);
  });
  return { modules, warnings };
}

export async function importAiModuleFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Choisissez un fichier JSON conforme au modèle Walyah.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Le manifeste IA ne doit pas dépasser 2 Mo.");
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()) as unknown; } catch { throw new Error("Le fichier JSON ne peut pas être lu. Vérifiez les virgules, guillemets et accolades."); }
  return parseAiModuleManifest(parsed);
}
