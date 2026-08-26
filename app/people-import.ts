export const PEOPLE_IMPORT_MAX_ROWS = 500;

export type PersonImportRow = {
  rowNumber: number;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  hireDate: string;
  jobTitle: string;
  department: string;
  email: string;
};

export type PersonImportIssue = {
  rowNumber: number;
  message: string;
};

export type PeopleImportResult = {
  rows: PersonImportRow[];
  errors: PersonImportIssue[];
  warnings: PersonImportIssue[];
};

type CanonicalKey = keyof Omit<PersonImportRow, "rowNumber">;

const requiredKeys: CanonicalKey[] = ["matricule", "lastName", "firstName", "birthDate", "hireDate", "jobTitle"];

const headerAliases: Record<CanonicalKey, string[]> = {
  matricule: ["matricule", "numero_matricule", "n_matricule", "id_collaborateur", "employee_id"],
  lastName: ["nom", "nom_de_famille", "last_name"],
  firstName: ["prenom", "first_name"],
  birthDate: ["date_de_naissance", "date_naissance", "naissance", "birth_date"],
  hireDate: ["date_entree", "date_d_entree", "date_embauche", "date_d_embauche", "hire_date"],
  jobTitle: ["poste", "fonction", "intitule_du_poste", "job_title"],
  department: ["service", "departement", "department"],
  email: ["email", "e_mail", "adresse_email", "courriel"],
};

export const PEOPLE_IMPORT_COLUMNS = [
  { label: "Matricule", required: true },
  { label: "Nom", required: true },
  { label: "Prénom", required: true },
  { label: "Date de naissance", required: true },
  { label: "Date d’entrée", required: true },
  { label: "Poste", required: true },
  { label: "Service", required: false },
  { label: "E-mail", required: false },
] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizePeopleHeader(value: unknown) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canonicalKey(header: unknown): CanonicalKey | undefined {
  const normalized = normalizePeopleHeader(header);
  return (Object.keys(headerAliases) as CanonicalKey[]).find((key) => headerAliases[key].includes(normalized));
}

function validIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : "";
}

export function normalizePeopleDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return validIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const raw = text(value);
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const french = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (french) return validIsoDate(Number(french[3]), Number(french[2]), Number(french[1]));
  return "";
}

function validateCanonicalRecord(record: Record<string, unknown>, rowNumber: number) {
  const errors: PersonImportIssue[] = [];
  const warnings: PersonImportIssue[] = [];
  const matricule = text(record.matricule).toUpperCase();
  const lastName = text(record.lastName ?? record.last_name ?? record.nom);
  const firstName = text(record.firstName ?? record.first_name ?? record.prenom);
  const birthDate = normalizePeopleDate(record.birthDate ?? record.birth_date ?? record.date_de_naissance);
  const hireDate = normalizePeopleDate(record.hireDate ?? record.hire_date ?? record.date_entree);
  const jobTitle = text(record.jobTitle ?? record.job_title ?? record.poste);
  const department = text(record.department ?? record.service ?? record.departement);
  const email = text(record.email).toLowerCase();

  if (!matricule) errors.push({ rowNumber, message: "matricule manquant" });
  if (!lastName) errors.push({ rowNumber, message: "nom manquant" });
  if (!firstName) errors.push({ rowNumber, message: "prénom manquant" });
  if (!birthDate) errors.push({ rowNumber, message: "date de naissance invalide (utilisez JJ/MM/AAAA ou AAAA-MM-JJ)" });
  if (!hireDate) errors.push({ rowNumber, message: "date d’entrée invalide (utilisez JJ/MM/AAAA ou AAAA-MM-JJ)" });
  if (!jobTitle) errors.push({ rowNumber, message: "poste manquant" });
  if (matricule.length > 80) errors.push({ rowNumber, message: "matricule trop long (80 caractères maximum)" });
  if (lastName.length > 160 || firstName.length > 160) errors.push({ rowNumber, message: "nom ou prénom trop long" });
  if (jobTitle.length > 240 || department.length > 240) errors.push({ rowNumber, message: "poste ou service trop long" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ rowNumber, message: "adresse e-mail invalide" });
  if (birthDate && birthDate > new Date().toISOString().slice(0, 10)) errors.push({ rowNumber, message: "la date de naissance ne peut pas être future" });
  if (birthDate && hireDate && hireDate < birthDate) errors.push({ rowNumber, message: "la date d’entrée précède la date de naissance" });
  if (!department) warnings.push({ rowNumber, message: "service non renseigné : la fiche sera classée dans « Non renseigné »" });

  return {
    row: { rowNumber, matricule, lastName, firstName, birthDate, hireDate, jobTitle, department, email } satisfies PersonImportRow,
    errors,
    warnings,
  };
}

export function normalizeCanonicalPeopleRows(input: unknown[]): PeopleImportResult {
  const rows: PersonImportRow[] = [];
  const errors: PersonImportIssue[] = [];
  const warnings: PersonImportIssue[] = [];
  const seen = new Set<string>();
  const seenEmails = new Map<string, string>();
  input.slice(0, PEOPLE_IMPORT_MAX_ROWS).forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push({ rowNumber: index + 2, message: "ligne illisible" });
      return;
    }
    const raw = item as Record<string, unknown>;
    const rowNumber = Number(raw.rowNumber) || index + 2;
    const result = validateCanonicalRecord(raw, rowNumber);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (result.errors.length) return;
    if (seen.has(result.row.matricule)) {
      errors.push({ rowNumber, message: `matricule ${result.row.matricule} présent plusieurs fois dans le fichier` });
      return;
    }
    if (result.row.email && seenEmails.has(result.row.email) && seenEmails.get(result.row.email) !== result.row.matricule) {
      errors.push({ rowNumber, message: `adresse e-mail ${result.row.email} utilisée pour plusieurs matricules` });
      return;
    }
    seen.add(result.row.matricule);
    if (result.row.email) seenEmails.set(result.row.email, result.row.matricule);
    rows.push(result.row);
  });
  if (input.length > PEOPLE_IMPORT_MAX_ROWS) warnings.push({ rowNumber: PEOPLE_IMPORT_MAX_ROWS + 2, message: `seules les ${PEOPLE_IMPORT_MAX_ROWS} premières personnes ont été analysées` });
  return { rows, errors, warnings };
}

export function parsePeopleTable(table: unknown[][]): PeopleImportResult {
  if (!Array.isArray(table) || !table.length) return { rows: [], errors: [{ rowNumber: 0, message: "le fichier ne contient aucune ligne" }], warnings: [] };
  const headerIndex = table.slice(0, 12).findIndex((row) => {
    const keys = new Set(row.map(canonicalKey).filter(Boolean));
    return requiredKeys.every((key) => keys.has(key));
  });
  if (headerIndex < 0) {
    return {
      rows: [],
      errors: [{ rowNumber: 0, message: "en-têtes requis introuvables : Matricule, Nom, Prénom, Date de naissance, Date d’entrée et Poste" }],
      warnings: [],
    };
  }
  const keyByColumn = table[headerIndex].map(canonicalKey);
  const records = table.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => text(cell)))
    .map((row, index) => {
      const record: Record<string, unknown> = { rowNumber: headerIndex + index + 2 };
      keyByColumn.forEach((key, columnIndex) => { if (key) record[key] = row[columnIndex] ?? ""; });
      return record;
    });
  if (!records.length) return { rows: [], errors: [{ rowNumber: headerIndex + 2, message: "aucune personne sous la ligne d’en-tête" }], warnings: [] };
  return normalizeCanonicalPeopleRows(records);
}

export function parseCsvTable(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const textSource = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < textSource.length; index += 1) {
    const char = textSource[index];
    if (quoted) {
      if (char === '"' && textSource[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && !cell) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

export async function importPeopleExcelFile(file: File): Promise<PeopleImportResult> {
  if (file.name.split(".").pop()?.toLowerCase() !== "xlsx") {
    return { rows: [], errors: [{ rowNumber: 0, message: "format non pris en charge : utilisez un fichier XLSX" }], warnings: [] };
  }
  try {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file) as unknown[][];
    return parsePeopleTable(rows);
  } catch {
    return { rows: [], errors: [{ rowNumber: 0, message: "le classeur est illisible ou protégé" }], warnings: [] };
  }
}
