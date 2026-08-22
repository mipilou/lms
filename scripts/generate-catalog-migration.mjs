import { readFile, writeFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../app/catalogues.json", import.meta.url), "utf8"));
const courses = [...source.complete, ...source.medical];

const sqlString = (value) => value == null || value === "" ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const jsonValue = (value) => `'${JSON.stringify(value ?? []).replaceAll("'", "''")}'::JSONB`;
const slug = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const minutes = (value) => {
  const text = String(value ?? "").toLowerCase().replace(",", ".");
  const days = text.match(/(\d+(?:\.\d+)?)\s*(?:j\b|jour)/);
  if (days) return Math.round(Number(days[1]) * 420);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h\b|heure)/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const mins = text.match(/(\d+)\s*min/);
  return mins ? Number(mins[1]) : 60;
};

const rows = courses.map((course) => `  (${[
  sqlString(`catalog-${slug(course.code)}`), sqlString(course.code), sqlString(course.title), sqlString(`catalog-${slug(course.code)}`),
  sqlString(course.theme || course.axis || "Général"), sqlString(course.axis || "Général"), sqlString(course.audience || "À définir"),
  sqlString(course.source), sqlString(course.description || course.objective || ""), sqlString(course.need), sqlString(course.objective || course.description || ""),
  sqlString(course.methods), sqlString(course.benefit), jsonValue(course.program || []), String(minutes(course.duration)), "FALSE", "FALSE", sqlString("catalog"),
].join(", ")})`).join(",\n");

const migration = `-- Import structuré des deux catalogues transmis le 20 août 2026.\n-- 124 formations du catalogue complet + 20 formations médicales détaillées.\n\nINSERT INTO courses (id, code, title, slug, category, axis, audience, source_catalog, description, need, objective, methods, benefit, program, duration_minutes, mandatory, published, lifecycle_status)\nVALUES\n${rows}\nON CONFLICT (code) DO UPDATE SET\n  title = CASE WHEN courses.published THEN courses.title ELSE EXCLUDED.title END,\n  category = EXCLUDED.category,\n  axis = EXCLUDED.axis,\n  audience = EXCLUDED.audience,\n  source_catalog = EXCLUDED.source_catalog,\n  description = COALESCE(NULLIF(courses.description, ''), EXCLUDED.description),\n  need = COALESCE(EXCLUDED.need, courses.need),\n  objective = COALESCE(NULLIF(courses.objective, ''), EXCLUDED.objective),\n  methods = COALESCE(EXCLUDED.methods, courses.methods),\n  benefit = COALESCE(EXCLUDED.benefit, courses.benefit),\n  program = CASE WHEN jsonb_array_length(EXCLUDED.program) > 0 THEN EXCLUDED.program ELSE courses.program END,\n  duration_minutes = CASE WHEN courses.published THEN courses.duration_minutes ELSE EXCLUDED.duration_minutes END,\n  lifecycle_status = CASE WHEN courses.published THEN 'published' ELSE 'catalog' END,\n  updated_at = NOW();\n`;

await writeFile(new URL("../netlify/database/migrations/20260820000300_seed_2026_catalogues.sql", import.meta.url), migration, "utf8");
console.log(`Migration catalogue générée : ${courses.length} formations.`);
