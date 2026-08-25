export type QuizQuestionType = "single" | "multiple" | "true_false" | "short_text";

export type DraftQuizQuestion = {
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  correctAnswers: number[];
  acceptedAnswers: string[];
  explanation: string;
  points: number;
};

export type QuizImportResult = {
  title?: string;
  courseId?: string;
  threshold?: number;
  questions: DraftQuizQuestion[];
  errors: string[];
};

const typeAliases: Record<string, QuizQuestionType> = {
  single: "single",
  choix_unique: "single",
  qcu: "single",
  multiple: "multiple",
  choix_multiple: "multiple",
  qcm: "multiple",
  true_false: "true_false",
  vrai_faux: "true_false",
  vrai_ou_faux: "true_false",
  short_text: "short_text",
  reponse_courte: "short_text",
  texte_court: "short_text",
};

function slug(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function arrayValue(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[|;]+/).map((item) => item.trim()).filter(Boolean);
}

function answerIndexes(value: unknown, optionCount: number) {
  const tokens = Array.isArray(value) ? value : text(value).split(/[|;,\s]+/);
  const indexes = tokens.map((token) => {
    if (typeof token === "number" && Number.isFinite(token)) return token;
    const normalized = text(token).toUpperCase();
    if (/^[A-F]$/.test(normalized)) return normalized.charCodeAt(0) - 65;
    if (/^[1-6]$/.test(normalized)) return Number(normalized) - 1;
    const numeric = Number(normalized);
    return Number.isInteger(numeric) ? numeric : -1;
  }).filter((index) => index >= 0 && index < optionCount);
  return Array.from(new Set(indexes));
}

export function emptyQuizQuestion(type: QuizQuestionType = "single"): DraftQuizQuestion {
  if (type === "true_false") return { type, prompt: "", options: ["Vrai", "Faux"], correctAnswers: [0], acceptedAnswers: [], explanation: "", points: 1 };
  if (type === "short_text") return { type, prompt: "", options: [], correctAnswers: [], acceptedAnswers: [""], explanation: "", points: 1 };
  return { type, prompt: "", options: ["", "", "", ""], correctAnswers: [0], acceptedAnswers: [], explanation: "", points: 1 };
}

function normalizeQuestion(raw: Record<string, unknown>, line: number): { question?: DraftQuizQuestion; errors: string[] } {
  const errors: string[] = [];
  const requestedType = slug(raw.type ?? raw.question_type ?? "single");
  const type = typeAliases[requestedType];
  if (!type) errors.push(`Ligne ${line} : type « ${text(raw.type ?? raw.question_type)} » non reconnu.`);

  const prompt = text(raw.prompt ?? raw.question ?? raw.intitule);
  if (!prompt) errors.push(`Ligne ${line} : la question est vide.`);

  const normalizedType = type ?? "single";
  let options = Array.isArray(raw.options)
    ? raw.options.map(text).filter(Boolean)
    : [raw.reponse_a, raw.reponse_b, raw.reponse_c, raw.reponse_d, raw.reponse_e, raw.reponse_f].map(text).filter(Boolean);
  if (normalizedType === "true_false") options = ["Vrai", "Faux"];
  if (normalizedType === "short_text") options = [];

  if ((normalizedType === "single" || normalizedType === "multiple") && (options.length < 2 || options.length > 6)) {
    errors.push(`Ligne ${line} : indiquez entre 2 et 6 réponses.`);
  }

  const rawCorrect = raw.correctAnswers ?? raw.correct_answers ?? raw.correct ?? raw.bonnes_reponses ?? raw.bonne_reponse;
  const correctAnswers = normalizedType === "short_text" ? [] : answerIndexes(rawCorrect, options.length);
  const acceptedAnswers = normalizedType === "short_text" ? arrayValue(raw.acceptedAnswers ?? raw.accepted_answers ?? rawCorrect) : [];

  if (normalizedType === "single" && correctAnswers.length !== 1) errors.push(`Ligne ${line} : une seule bonne réponse est requise (A à F).`);
  if (normalizedType === "multiple" && correctAnswers.length < 1) errors.push(`Ligne ${line} : indiquez au moins une bonne réponse, par exemple A|C.`);
  if (normalizedType === "true_false" && correctAnswers.length !== 1) errors.push(`Ligne ${line} : utilisez A pour Vrai ou B pour Faux.`);
  if (normalizedType === "short_text" && !acceptedAnswers.length) errors.push(`Ligne ${line} : indiquez au moins une réponse acceptée.`);

  const rawPoints = Number(raw.points ?? 1);
  const points = Number.isFinite(rawPoints) ? Math.round(rawPoints) : 1;
  if (points < 1 || points > 10) errors.push(`Ligne ${line} : les points doivent être compris entre 1 et 10.`);

  if (errors.length) return { errors };
  return {
    errors,
    question: {
      type: normalizedType,
      prompt,
      options,
      correctAnswers,
      acceptedAnswers,
      explanation: text(raw.explanation ?? raw.feedback),
      points,
    },
  };
}

function normalizePayload(payload: Record<string, unknown>, sourceLabel: string): QuizImportResult {
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  if (!rawQuestions.length) return { questions: [], errors: [`${sourceLabel} : aucune question trouvée.`] };
  const questions: DraftQuizQuestion[] = [];
  const errors: string[] = [];
  rawQuestions.slice(0, 100).forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      errors.push(`Question ${index + 1} : contenu invalide.`);
      return;
    }
    const result = normalizeQuestion(raw as Record<string, unknown>, index + 1);
    errors.push(...result.errors);
    if (result.question) questions.push(result.question);
  });
  if (rawQuestions.length > 100) errors.push("Seules les 100 premières questions ont été analysées.");
  return {
    title: text(payload.title) || undefined,
    courseId: text(payload.courseId ?? payload.course_id) || undefined,
    threshold: Number.isFinite(Number(payload.threshold)) ? Number(payload.threshold) : undefined,
    questions,
    errors,
  };
}

export async function importQuizFile(file: File): Promise<QuizImportResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "json") {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const payload = Array.isArray(parsed) ? { questions: parsed } : parsed as Record<string, unknown>;
      if (!payload || typeof payload !== "object") return { questions: [], errors: ["Le fichier JSON doit contenir un objet ou une liste de questions."] };
      return normalizePayload(payload, "Fichier JSON");
    } catch {
      return { questions: [], errors: ["Le fichier JSON est illisible ou mal formé."] };
    }
  }

  if (extension !== "xlsx") {
    return { questions: [], errors: ["Format non pris en charge. Utilisez JSON ou XLSX."] };
  }

  try {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const workbookResult = await readXlsxFile(file) as unknown;
    const sheetEntries = Array.isArray(workbookResult) && workbookResult.length && !Array.isArray(workbookResult[0]) && typeof workbookResult[0] === "object"
      ? workbookResult as Array<{ sheet?: string; data?: unknown[][] }>
      : [];
    const selectedSheet = sheetEntries.find((entry) => slug(entry.sheet) === "questions") ?? sheetEntries[0];
    const rows = (selectedSheet?.data ?? workbookResult) as unknown[][];
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0])) return { questions: [], errors: ["Le classeur ne contient aucune feuille exploitable."] };
    const headerIndex = rows.findIndex((row) => {
      const headers = row.map(slug);
      return headers.includes("type") && headers.includes("question") && headers.includes("bonnes_reponses");
    });
    if (headerIndex < 0) return { questions: [], errors: ["En-têtes introuvables. Conservez la ligne contenant type, question et bonnes_reponses."] };
    const headers = rows[headerIndex].map(slug);
    const normalizedRows = rows.slice(headerIndex + 1)
      .filter((row) => row.some((cell) => text(cell)))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    const questions: DraftQuizQuestion[] = [];
    const errors: string[] = [];
    normalizedRows.slice(0, 100).forEach((row, index) => {
      const result = normalizeQuestion(row, headerIndex + index + 2);
      errors.push(...result.errors);
      if (result.question) questions.push(result.question);
    });
    if (!normalizedRows.length) errors.push("La feuille Questions ne contient aucune ligne de données.");
    if (normalizedRows.length > 100) errors.push("Seules les 100 premières lignes ont été analysées.");
    return { questions, errors };
  } catch {
    return { questions: [], errors: ["Le fichier Excel est illisible. Vérifiez qu’il s’agit bien d’un classeur XLSX."] };
  }
}
