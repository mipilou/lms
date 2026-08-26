"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Archive, ArrowLeft, Award, Bell, BookOpen, Check, CheckCircle2,
  Camera, ChevronDown, ChevronRight, Circle, CircleHelp, ClipboardCheck, Clock3, Download,
  Edit3, ExternalLink, Eye, EyeOff, FileAudio, FileQuestion, FileText, FileUp, FileVideo, Filter, GripVertical, Inbox, LayoutDashboard,
  KeyRound, LibraryBig, Link2, LockKeyhole, LogOut, Menu, MoreHorizontal, Play, Plus,
  Printer, Save, Search, Send, Settings, ShieldCheck, Sparkles, Table2, Trash2, TrendingUp,
  UploadCloud, UserCog, UserPlus, UserRound, UsersRound, Video, X,
} from "lucide-react";
import {
  catalogueTotals, courses, readyCourseByCode, trainingCatalogue, trainingThemeFor, trainingThemes,
  type CatalogCourse, type Course, type Learner, type LessonBlock, type LessonBlockType, type LessonContent,
} from "./data";
import { importAiModuleFile } from "./ai-module-import";
import { googleDriveConfigured, pickGoogleDriveFile } from "./google-drive-picker";
import { PEOPLE_IMPORT_COLUMNS, importPeopleExcelFile, parseCsvTable, parsePeopleTable, type PeopleImportResult, type PersonImportRow } from "./people-import";
import { emptyQuizQuestion, importQuizFile, type DraftQuizQuestion, type QuizQuestionType } from "./quiz-import";

export type Role = "learner" | "admin" | "super_admin";
type View = "dashboard" | "catalogue" | "catalog" | "certificates" | "users" | "trainings" | "quizzes" | "activity" | "settings";
export type Session = { name: string; email: string; initials: string; role: Role; authProvider: "netlify" | "sites" };

type CertificateRecord = {
  certificateNumber: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  score: number | null;
  issuedAt: string;
  courseCategory: string;
  courseDurationMinutes: number;
  learnerName?: string;
  learnerEmail?: string;
  matricule?: string;
  department?: string;
  jobTitle?: string;
  location?: string;
};

type ActivityRecord = { type: string; summary: string; occurredAt: string };
type LearnerProfile = { fullName: string; email: string; matricule: string; department: string; jobTitle: string; location: string; avatarUrl?: string };
type LearnerWorkspace = {
  loading: boolean;
  error: string;
  courses: Course[];
  certificates: CertificateRecord[];
  activity: ActivityRecord[];
  profile: LearnerProfile | null;
};

type AdminActivity = {
  id: string;
  name: string;
  initials: string;
  summary: string;
  detail: string;
  occurredAt: string;
  eventType: string;
  entityType: string;
  entityId: string;
  linkedCourseId: string;
  userId: string;
  email: string;
  matricule: string;
  department: string;
  jobTitle: string;
  status: string;
  lastLoginAt: string | null;
  hasAvatar: boolean;
};
type AdminAccount = { id: string; name: string; email: string; role: Role; status: string; lastLoginAt: string | null };
type RoleAudit = { id: string; actorName: string; targetName: string; previousRole: Role | null; newRole: Role; occurredAt: string };
type DepartmentInsight = { department: string; learners: number; activeLearners: number; averageProgress: number; completed: number };
type CourseInsight = { id: string; code: string; title: string; enrolled: number; completion: number };
type TrainingGroup = {
  id: string;
  name: string;
  description: string;
  department: string;
  memberCount: number;
  assignedQuizzes: number;
  memberIds: string[];
};
type QuizAdminRecord = {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  questionCount: number;
  threshold: number;
  published: boolean;
  participants: number;
  averageScore: number;
  assignedUsers: number;
  assignedGroups: number;
};
type GlobalSearchResult = {
  id: string;
  kind: "navigation" | "course" | "catalog" | "learner";
  title: string;
  subtitle: string;
  view?: View;
  entityId?: string;
  code?: string;
  learner?: Learner;
};
type AdminSnapshot = {
  learners: number;
  publishedCourses: number;
  certificates: number;
  loginsToday: number;
  overdue: number;
  completedEnrollments: number;
  inProgressEnrollments: number;
  assignedEnrollments: number;
  completionRate: number;
  inactiveUsers: number;
  activeUsers7d: number;
  activeUsersPeriod: number;
  certificatesPeriod: number;
  admins: number;
  superAdmins: number;
  passportConnected: number;
  integrationsPending: number;
  integrationsFailed: number;
  activities: AdminActivity[];
  loginSeries: number[];
  loginLabels: string[];
  departmentStats: DepartmentInsight[];
  coursePerformance: CourseInsight[];
  periodDays: number;
};

const EMPTY_ADMIN: AdminSnapshot = {
  learners: 0, publishedCourses: 0, certificates: 0, loginsToday: 0, overdue: 0,
  completedEnrollments: 0, inProgressEnrollments: 0, assignedEnrollments: 0,
  completionRate: 0, inactiveUsers: 0, activeUsers7d: 0, activeUsersPeriod: 0, certificatesPeriod: 0, admins: 0, superAdmins: 0,
  passportConnected: 0, integrationsPending: 0, integrationsFailed: 0,
  activities: [], loginSeries: [0, 0, 0, 0, 0, 0, 0], loginLabels: [], departmentStats: [], coursePerformance: [], periodDays: 30,
};

type IdentityCandidate = { email?: string; name?: string; roles?: string[]; userMetadata?: Record<string, unknown> };

const learnerNav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Mon tableau de bord", icon: LayoutDashboard },
  { id: "catalogue", label: "Mes formations", icon: BookOpen },
  { id: "certificates", label: "Mes certificats", icon: Award },
  { id: "settings", label: "Mon profil", icon: UserRound },
];

const adminNav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "users", label: "Apprenants", icon: UsersRound },
  { id: "trainings", label: "Formations", icon: LibraryBig },
  { id: "catalog", label: "Catalogues 2026", icon: BookOpen },
  { id: "quizzes", label: "QCM & évaluations", icon: ClipboardCheck },
  { id: "activity", label: "Connexions", icon: TrendingUp },
  { id: "settings", label: "Paramètres", icon: Settings },
];

const quizQuestions = [
  {
    question: "Quelle est la durée minimale recommandée pour une friction hydroalcoolique efficace ?",
    options: ["5 secondes", "10 secondes", "20 à 30 secondes", "Plus de 2 minutes"],
    answer: 2,
  },
  {
    question: "Dans quelle situation faut-il privilégier le lavage à l’eau et au savon ?",
    options: ["Avant chaque appel téléphonique", "Lorsque les mains sont visiblement souillées", "Après avoir utilisé un clavier", "Uniquement en fin de journée"],
    answer: 1,
  },
  {
    question: "Quel élément réduit l’efficacité de l’hygiène des mains ?",
    options: ["Des ongles courts", "Des avant-bras dégagés", "Le port de bagues et bracelets", "Une dose adaptée de produit"],
    answer: 2,
  },
  {
    question: "L’hygiène des mains doit notamment être réalisée…",
    options: ["Avant et après un contact patient", "Seulement après un soin invasif", "Une fois par vacation", "Uniquement si des gants ont été portés"],
    answer: 0,
  },
];

function moduleDraft(title: string): Course["moduleContent"][number] {
  return { title: `Introduction · ${title}`, type: "lesson", duration: "15 min", summary: "Présenter les objectifs, les attendus et le déroulé du parcours.", points: ["Comprendre les objectifs", "Identifier les acquis attendus", "Préparer la mise en pratique"] };
}

function catalogCourseDraft(item: CatalogCourse): Course {
  const normalizedCode = item.code.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    id: `catalog-${normalizedCode}`,
    code: item.code,
    title: item.title,
    category: trainingThemeFor(item).label,
    description: item.description ?? item.objective ?? item.theme,
    objective: item.objective ?? item.description ?? item.theme,
    audience: item.audience,
    source: item.source,
    duration: item.duration,
    modules: 0,
    completedModules: 0,
    progress: 0,
    status: "À commencer",
    accent: "coral",
    nextLesson: "Introduction et objectifs",
    moduleContent: [],
  };
}

function Modal({ title, children, onClose, wide = false, studio = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; studio?: boolean }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}><button className="modal-backdrop" aria-label="Fermer" onClick={onClose} /><section className={`modal-card ${wide ? "modal-wide" : ""} ${studio ? "modal-studio" : ""}`}><header><div><span className="eyebrow">Walyah Académie</span><h2>{title}</h2></div><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>{children}</section></div>;
}

function initialsFrom(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function roleFromClaims(roles: string[] | undefined): Role {
  if (roles?.includes("super_admin")) return "super_admin";
  if (roles?.includes("admin")) return "admin";
  return "learner";
}

function roleLabel(role: Role) {
  if (role === "super_admin") return "Super-administrateur";
  if (role === "admin") return "Administrateur";
  return "Apprenant";
}

function sessionFromIdentity(candidate: IdentityCandidate, fallbackEmail = "", fallbackName = ""): Session {
  const name = candidate.name || String(candidate.userMetadata?.full_name ?? "") || fallbackName || candidate.email || "Apprenant";
  return {
    name,
    email: candidate.email || fallbackEmail,
    initials: initialsFrom(name),
    role: roleFromClaims(candidate.roles),
    authProvider: "netlify",
  };
}

function authErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  if (normalized.includes("email not confirmed")) return "Votre adresse e-mail n’est pas encore confirmée. Ouvrez le dernier e-mail de confirmation reçu, puis revenez vous connecter.";
  if (normalized.includes("no user found") || normalized.includes("password invalid") || normalized.includes("invalid login credentials")) return "Adresse e-mail ou mot de passe incorrect. Vérifiez l’adresse utilisée et votre nouveau mot de passe.";
  if (normalized.includes("recovery") || normalized.includes("expired") || normalized.includes("token")) return "Ce lien de sécurité est invalide ou a expiré. Demandez un nouvel e-mail de réinitialisation.";
  return raw || "La connexion est momentanément impossible. Réessayez dans quelques instants.";
}

function avatarEndpoint(userId = "me", version?: number) {
  return `/.netlify/functions/upload?avatar=${encodeURIComponent(userId)}${version ? `&v=${version}` : ""}`;
}

function UserAvatar({ name, initials, src, className = "" }: { name: string; initials: string; src?: string; className?: string }) {
  return <span className={`avatar avatar-dark user-avatar ${className}`}>{src ? <Image src={src} alt={`Photo de ${name}`} fill sizes="72px" unoptimized /> : initials}</span>;
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Durée à définir";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${String(remaining).padStart(2, "0")}` : `${hours} h`;
}

function formatDate(value: unknown, fallback = "Non renseignée") {
  if (!value) return fallback;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("fr-FR");
}

function formatDateTime(value: unknown) {
  if (!value) return "Jamais";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Jamais";
  return `${date.toLocaleDateString("fr-FR")} · ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function activityCategory(eventType: string, entityType = "") {
  if (eventType.startsWith("login") || eventType.includes("session")) return "Accès";
  if (eventType.startsWith("course") || eventType.startsWith("module") || eventType.startsWith("certificate")) return "Formation";
  if (eventType.startsWith("quiz") || entityType === "quiz") return "Évaluation";
  if (eventType.startsWith("passport") || eventType.startsWith("integration")) return "Intégration";
  if (eventType.includes("role") || eventType.startsWith("user")) return "Gouvernance";
  return "Système";
}

function dateGroupLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date non renseignée";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const difference = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (difference === 0) return "Aujourd’hui";
  if (difference === 1) return "Hier";
  if (difference < 7) return "Cette semaine";
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);
}

function learnerFromActivity(activity: AdminActivity): Learner {
  const rawStatus = activity.status || "active";
  return {
    id: activity.userId,
    matricule: activity.matricule || "À renseigner",
    name: activity.name,
    initials: activity.initials,
    email: activity.email,
    phone: "À renseigner",
    avatarUrl: activity.hasAvatar ? avatarEndpoint(activity.userId) : undefined,
    department: activity.department || "Non renseigné",
    jobTitle: activity.jobTitle || "Non renseigné",
    manager: "À renseigner",
    hireDate: "À renseigner",
    location: "Non renseigné",
    progress: 0,
    completed: 0,
    assigned: 0,
    lastLogin: activity.lastLoginAt ? formatDate(activity.lastLoginAt) : "Jamais",
    lastLoginDetail: activity.lastLoginAt ? new Date(activity.lastLoginAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "",
    status: rawStatus === "inactive" ? "Inactif" : rawStatus === "suspended" ? "À relancer" : "Actif",
    passportStatus: "À connecter",
    trainings: [],
  };
}

function moduleType(value: unknown): Course["moduleContent"][number]["type"] {
  const type = String(value ?? "text");
  if (type === "video" || type === "document" || type === "audio" || type === "scorm" || type === "quiz") return type;
  return "lesson";
}

function parseModulePayload(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}

function lessonContentFromValue(value: unknown): LessonContent | undefined {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as unknown; } catch { return undefined; }
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const raw = parsed as Record<string, unknown>;
  const blocks = Array.isArray(raw.blocks) ? raw.blocks.filter((block): block is LessonBlock => Boolean(block && typeof block === "object" && typeof (block as Record<string, unknown>).type === "string")) : [];
  if (!blocks.length) return undefined;
  const layout = ["signature", "atelier", "essentiel"].includes(String(raw.layout)) ? String(raw.layout) as LessonContent["layout"] : "signature";
  return { schemaVersion: "walyah-lms-module-v1", layout, blocks };
}

function courseFromRow(row: Record<string, unknown>): Course {
  const id = String(row.id ?? `course-${String(row.code ?? "unknown")}`);
  const code = String(row.code ?? "");
  const template = courses.find((item) => item.id === id || item.code === code);
  const catalogueTemplate = trainingCatalogue.find((item) => item.code === code);
  const storedCategory = String(row.category ?? template?.category ?? "Formation");
  const category = catalogueTemplate && ["Softskills", "Hardskills"].includes(storedCategory) ? trainingThemeFor(catalogueTemplate).label : storedCategory;
  const payload = parseModulePayload(row.module_content);
  const moduleContent = payload.length ? payload.map((module, index) => {
    const objectives = Array.isArray(module.learning_objectives) ? module.learning_objectives.map(String) : [];
    const resources = Array.isArray(module.resources) ? (module.resources as Array<Record<string, unknown>>).map((resource) => ({ id: resource.id ? String(resource.id) : undefined, name: String(resource.name ?? "Ressource"), type: String(resource.resource_type ?? "file"), contentKind: String(resource.content_kind ?? "document"), url: resource.external_url ? String(resource.external_url) : undefined, sizeBytes: Number(resource.size_bytes ?? 0), metadata: resource.metadata && typeof resource.metadata === "object" ? resource.metadata as Record<string, unknown> : undefined })) : [];
    return {
      id: String(module.id ?? `${id}-module-${index + 1}`),
      title: String(module.title ?? `Module ${index + 1}`),
      type: moduleType(module.content_type),
      duration: formatDuration(Number(module.duration_minutes ?? 0)),
      summary: String(module.description ?? "Contenu pédagogique en préparation."),
      points: objectives,
      videoUrl: module.video_url ? String(module.video_url) : undefined,
      lessonContent: lessonContentFromValue(module.lesson_content),
      resources,
    };
  }) : (template?.moduleContent ?? []);
  const rawStatus = String(row.enrollment_status ?? "assigned");
  const status: Course["status"] = rawStatus === "completed" ? "Terminée" : rawStatus === "in_progress" ? "En cours" : "À commencer";
  const completedModules = Number(row.completed_modules ?? 0);
  const progress = Number(row.progress_percent ?? 0);
  const durationMinutes = Number(row.duration_minutes ?? 0);
  return {
    id,
    code: String(row.code ?? template?.code ?? "WA"),
    title: String(row.title ?? template?.title ?? "Formation"),
    category,
    description: String(row.description ?? template?.description ?? ""),
    objective: String(row.objective ?? template?.objective ?? ""),
    audience: String(row.audience ?? template?.audience ?? ""),
    source: String(row.source_catalog ?? template?.source ?? "Walyah Académie"),
    duration: durationMinutes ? formatDuration(durationMinutes) : (template?.duration ?? "Durée à définir"),
    modules: Number(row.module_count ?? moduleContent.length),
    completedModules,
    progress,
    status,
    mandatory: Boolean(row.mandatory ?? template?.mandatory),
    accent: template?.accent ?? (["teal", "blue", "violet", "amber", "coral"] as const)[id.length % 5],
    nextLesson: moduleContent[Math.min(completedModules, Math.max(moduleContent.length - 1, 0))]?.title ?? "Contenu à venir",
    dueDate: row.due_at ? formatDate(row.due_at) : undefined,
    moduleContent,
    quiz: row.quiz_id ? { id: String(row.quiz_id), title: String(row.quiz_title ?? "Évaluation finale"), threshold: Number(row.quiz_threshold ?? 80) } : template?.quiz,
  };
}

function usesNetlifyIdentity() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.endsWith(".netlify.app") || (
    window.location.protocol === "https:" &&
    !host.endsWith(".chatgpt.site") &&
    host !== "localhost" &&
    host !== "127.0.0.1"
  );
}

function AuthStory() {
  return <section className="auth-story" aria-label="Présentation de la plateforme">
    <div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" />
    <Brand light />
    <div className="auth-story-content">
      <span className="eyebrow eyebrow-light"><Sparkles size={14} /> Développer les compétences, simplement</span>
      <h1>La formation qui fait avancer toute votre équipe.</h1>
      <p>Centralisez les parcours, suivez les progrès et accompagnez chaque collaborateur depuis une seule plateforme claire et engageante.</p>
      <div className="auth-proof-grid"><div><strong>Affectations ciblées</strong><span>Chaque apprenant reçoit uniquement les parcours choisis.</span></div><div><strong>Suivi vérifiable</strong><span>Progression, résultats et connexions sont consolidés.</span></div><div><strong>Passeport connecté</strong><span>Les acquis peuvent être synchronisés entre les deux outils.</span></div></div>
    </div>
  </section>;
}

function AuthScreen({ onAuthenticated, initialMessage = "" }: { onAuthenticated: (session: Session) => void; initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const isNetlify = usesNetlifyIdentity();
      if (!isNetlify) {
        setMessage("La connexion sécurisée sera active sur votre domaine Netlify.");
        return;
      }
      const identity = await import("@netlify/identity");
      const authenticated = await identity.login(email.trim().toLowerCase(), password);
      onAuthenticated(sessionFromIdentity(authenticated as unknown as IdentityCandidate, email));
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const recoverPassword = async () => {
    setMessage("");
    if (!email.trim()) {
      setMessage("Saisissez d’abord votre adresse e-mail.");
      return;
    }
    if (!usesNetlifyIdentity()) {
      setMessage("La récupération du mot de passe sera active sur votre domaine Netlify.");
      return;
    }
    setLoading(true);
    try {
      const identity = await import("@netlify/identity");
      await identity.requestPasswordRecovery(email.trim().toLowerCase());
      setMessage("Un e-mail de réinitialisation vient de vous être envoyé.");
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <AuthStory />

      <section className="auth-panel">
        <div className="mobile-brand"><Brand /></div>
        <div className="auth-card">
          <div className="auth-heading"><span className="status-pill"><span /> Accès sécurisé</span><h2>Heureux de vous revoir</h2><p>Connectez-vous avec l’accès créé par votre administrateur.</p></div>
          <form onSubmit={submit}>
            <label className="field-label">Adresse e-mail<span className="input-wrap"><span className="at-icon">@</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@walyah-academie.com" required /></span></label>
            <label className="field-label"><span className="label-row"><span>Mot de passe</span><button type="button" className="text-button" onClick={recoverPassword} disabled={loading}>Mot de passe oublié ?</button></span><span className="input-wrap"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" minLength={8} required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Traitement…" : "Se connecter"}<ChevronRight size={18} /></button>
          </form>
          <p className="auth-switch">Première connexion ? Utilisez l’e-mail de création d’accès envoyé par Walyah Académie.</p>
          <div className="trust-note"><ShieldCheck size={17} /><span>Vos données et vos résultats sont protégés.</span></div>
        </div>
        <p className="auth-footer">© 2026 Walyah Académie · Confidentialité · Assistance</p>
      </section>
    </main>
  );
}

function PasswordResetScreen({ onComplete, onCancel }: { onComplete: (message: string) => void; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) { setMessage("Le nouveau mot de passe doit contenir au moins 8 caractères."); return; }
    if (password !== confirmation) { setMessage("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    try {
      const identity = await import("@netlify/identity");
      await identity.updateUser({ password });
      await identity.logout();
      onComplete("Votre mot de passe a été modifié. Connectez-vous maintenant avec votre nouveau mot de passe.");
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  return <main className="auth-page">
    <AuthStory />
    <section className="auth-panel">
      <div className="mobile-brand"><Brand /></div>
      <div className="auth-card reset-card">
        <div className="auth-heading"><span className="status-pill"><KeyRound size={14} /> Réinitialisation sécurisée</span><h2>Choisissez un nouveau mot de passe</h2><p>Le lien reçu a été vérifié. Définissez maintenant votre nouveau mot de passe avant d’accéder à l’application.</p></div>
        <form onSubmit={submit}>
          <label className="field-label">Nouveau mot de passe<span className="input-wrap"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          <label className="field-label">Confirmer le mot de passe<span className="input-wrap"><ShieldCheck size={18} /><input type={showPassword ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} autoComplete="new-password" required /></span></label>
          {message && <p className="form-message" role="alert">{message}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}<ChevronRight size={18} /></button>
          <button className="text-button reset-cancel" type="button" onClick={onCancel} disabled={loading}>Annuler et revenir à la connexion</button>
        </form>
      </div>
      <p className="auth-footer">© 2026 Walyah Académie · Accès sécurisé</p>
    </section>
  </main>;
}

function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <div className={`brand brand-logo ${light ? "brand-light" : ""} ${compact ? "brand-compact" : ""}`}><span className="brand-logo-shell"><Image className="brand-logo-image" src="/walyah-logo-transparent.png" alt="Walyah Académie" width={2048} height={2048} priority /></span></div>;
}

function Sidebar({ role, view, onView, open, onClose }: { role: Role; view: View; onView: (view: View) => void; open: boolean; onClose: () => void }) {
  const nav = role === "learner" ? learnerNav : adminNav;
  return <>
    {open && <button className="sidebar-backdrop" aria-label="Fermer le menu" onClick={onClose} />}
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-top"><Brand /><button className="icon-button close-sidebar" aria-label="Fermer le menu" onClick={onClose}><X size={20} /></button></div>
      <div className="workspace-badge"><span className="workspace-icon">WA</span><span><small>Espace sécurisé</small><strong>{roleLabel(role)}</strong></span><ChevronDown size={16} /></div>
      <nav className="sidebar-nav" aria-label="Navigation principale"><span className="nav-label">Navigation</span>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { onView(item.id); onClose(); }}><Icon size={19} strokeWidth={1.9} /><span>{item.label}</span></button>; })}</nav>
      <div className="sidebar-support"><div className="support-icon"><CircleHelp size={20} /></div><strong>Besoin d’aide ?</strong><p>Notre équipe vous accompagne.</p><button>Contacter le support</button></div>
      <div className="sidebar-version"><span className="online-dot" /> Services opérationnels <small>v1.0</small></div>
    </aside>
  </>;
}

function Topbar({ session, avatarUrl, assignedCourses, onMenu, onLogout, onSearchResult }: { session: Session; avatarUrl?: string; assignedCourses: Course[]; onMenu: () => void; onLogout: () => void; onSearchResult: (result: GlobalSearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [remoteResults, setRemoteResults] = useState<GlobalSearchResult[]>([]);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLFormElement>(null);
  const isLearner = session.role === "learner";

  const localIndex = useMemo<GlobalSearchResult[]>(() => {
    const nav = (isLearner ? learnerNav : adminNav).map((item) => ({ id: `nav-${item.id}`, kind: "navigation" as const, title: item.label, subtitle: "Ouvrir cette rubrique", view: item.id }));
    if (isLearner) return [...nav, ...assignedCourses.map((course) => ({ id: `course-${course.id}`, kind: "course" as const, title: course.title, subtitle: `${course.code} · ${course.category} · ${course.progress} %`, entityId: course.id, code: course.code }))];
    const catalogue = trainingCatalogue.map((item) => ({ id: `catalog-${item.code}`, kind: "catalog" as const, title: item.title, subtitle: `${item.code} · ${trainingThemeFor(item).label}`, code: item.code }));
    return [...nav, ...catalogue];
  }, [assignedCourses, isLearner]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setMobileOpen(true); setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === "Escape") { setOpen(false); setMobileOpen(false); inputRef.current?.blur(); }
    };
    const outside = (event: PointerEvent) => { if (!containerRef.current?.contains(event.target as Node)) { setOpen(false); setMobileOpen(false); } };
    window.addEventListener("keydown", shortcut); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", shortcut); document.removeEventListener("pointerdown", outside); };
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (isLearner || normalized.length < 2 || !usesNetlifyIdentity()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/.netlify/functions/lms-data?scope=search&q=${encodeURIComponent(normalized)}`, { signal: controller.signal }).then(async (response) => {
        const data = await response.json() as { results?: Array<Record<string, unknown>>; error?: string };
        if (!response.ok) throw new Error(data.error || "Recherche indisponible");
        setRemoteQuery(normalized.toLocaleLowerCase("fr"));
        setRemoteResults((data.results ?? []).map((item): GlobalSearchResult => {
          const kind = String(item.kind ?? "course") as GlobalSearchResult["kind"];
          const learner = kind === "learner" ? {
            id: String(item.entityId), matricule: String(item.matricule ?? "À renseigner"), name: String(item.title ?? "Apprenant"), initials: initialsFrom(String(item.title ?? "Apprenant")), email: String(item.email ?? ""), phone: "À renseigner", avatarUrl: Boolean(item.hasAvatar) ? avatarEndpoint(String(item.entityId)) : undefined,
            department: String(item.department ?? "Non renseigné"), jobTitle: String(item.jobTitle ?? "Non renseigné"), manager: "À renseigner", hireDate: "À renseigner", location: String(item.location ?? "Non renseigné"), progress: Number(item.progress ?? 0), completed: Number(item.completed ?? 0), assigned: Number(item.assigned ?? 0), lastLogin: item.lastLoginAt ? formatDate(item.lastLoginAt) : "Jamais", lastLoginDetail: item.lastLoginAt ? new Date(String(item.lastLoginAt)).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "", status: "Actif" as const, passportStatus: "À connecter" as const, trainings: [],
          } : undefined;
          return { id: `${kind}-${String(item.entityId ?? item.code)}`, kind, title: String(item.title ?? "Résultat"), subtitle: String(item.subtitle ?? ""), entityId: item.entityId ? String(item.entityId) : undefined, code: item.code ? String(item.code) : undefined, learner };
        }));
      }).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setRemoteResults([]); }).finally(() => setSearching(false));
    }, 260);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [isLearner, query]);

  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const localResults = normalizedQuery ? localIndex.filter((item) => `${item.title} ${item.subtitle} ${item.code ?? ""}`.toLocaleLowerCase("fr").includes(normalizedQuery)).slice(0, 8) : localIndex.filter((item) => item.kind === "navigation").slice(0, 7);
  const results = [...(remoteQuery === normalizedQuery ? remoteResults : []), ...localResults].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 10);
  const choose = (result: GlobalSearchResult) => { onSearchResult(result); setQuery(""); setOpen(false); setMobileOpen(false); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (results[0]) choose(results[0]); else setOpen(true); };
  const resultIcon = (kind: GlobalSearchResult["kind"]) => kind === "learner" ? <UserRound size={17} /> : kind === "navigation" ? <LayoutDashboard size={17} /> : kind === "catalog" ? <BookOpen size={17} /> : <LibraryBig size={17} />;

  return <header className="topbar">
    <button className="icon-button mobile-menu" aria-label="Ouvrir le menu" onClick={onMenu}><Menu size={21} /></button>
    <form ref={containerRef} className={`global-search ${mobileOpen ? "is-mobile-open" : ""}`} role="search" onSubmit={submit}>
      <button className="global-search-submit" type="submit" aria-label="Lancer la recherche"><Search size={18} /></button>
      <input ref={inputRef} aria-label="Rechercher" value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={isLearner ? "Rechercher une formation…" : "Apprenant, formation, rubrique…"} autoComplete="off" />
      {query ? <button className="global-search-clear" type="button" aria-label="Effacer la recherche" onClick={() => { setQuery(""); inputRef.current?.focus(); }}><X size={15} /></button> : <kbd>⌘ K</kbd>}
      {open && <div className="global-search-results" role="listbox" aria-label="Résultats de recherche"><header><span>{query ? "Résultats" : "Accès rapides"}</span><small>{searching ? "Recherche dans la base…" : `${results.length} proposition${results.length > 1 ? "s" : ""}`}</small></header>{results.length ? results.map((result) => <button type="button" role="option" aria-selected="false" key={result.id} onClick={() => choose(result)}><span className={`search-result-icon kind-${result.kind}`}>{resultIcon(result.kind)}</span><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><ChevronRight size={15} /></button>) : <div className="search-empty"><Search size={20} /><span>Aucun résultat. Essayez un nom, un code ou une thématique.</span></div>}</div>}
    </form>
    <div className="topbar-brand"><Brand compact /></div>
    <div className="topbar-actions"><button className="icon-button mobile-search-button" aria-label="Rechercher" onClick={() => { setMobileOpen(true); setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0); }}><Search size={19} /></button><div className="profile-chip"><UserAvatar name={session.name} initials={session.initials} src={avatarUrl} /><span className="profile-copy"><strong>{session.name}</strong><small>{roleLabel(session.role)}</small></span><button className="icon-button" aria-label="Se déconnecter" title="Se déconnecter" onClick={onLogout}><LogOut size={18} /></button></div><button className="icon-button notification-button" aria-label="Ouvrir les notifications" title="Notifications"><Bell size={20} /></button></div>
  </header>;
}

function ProgressRing({ value, size = 72 }: { value: number; size?: number }) {
  return <span className="progress-ring" style={{ width: size, height: size, background: `conic-gradient(var(--teal) ${value * 3.6}deg, #e8eeec 0deg)` }}><span>{value}%</span></span>;
}

function CourseVisual({ course, compact = false }: { course: Course; compact?: boolean }) {
  return <div className={`course-visual tone-${course.accent} ${compact ? "compact" : ""}`}><span className="visual-grid" /><span className="course-category">{course.category}</span>{course.mandatory && <span className="mandatory-chip"><ShieldCheck size={12} /> Obligatoire</span>}<div className="visual-icon"><BookOpen size={compact ? 28 : 34} /></div></div>;
}

function CourseCard({ course, onOpen }: { course: Course; onOpen: (course: Course) => void }) {
  return <article className="course-card"><CourseVisual course={course} compact /><div className="course-card-body"><div className="course-card-meta"><span><Clock3 size={14} /> {course.duration}</span><span>{course.modules} modules</span></div><h3>{course.title}</h3><p>{course.description}</p><div className="progress-row"><span>Progression</span><strong>{course.progress}%</strong></div><div className="linear-progress"><span style={{ width: `${course.progress}%` }} /></div><button className={course.progress === 100 ? "card-button completed" : "card-button"} onClick={() => onOpen(course)}>{course.progress === 100 ? <><CheckCircle2 size={17} /> Revoir la formation</> : course.progress > 0 ? <><Play size={16} fill="currentColor" /> Continuer</> : <>Commencer <ChevronRight size={17} /></>}</button></div></article>;
}

function LearnerDashboard({ name, workspace, onView, onCourse }: { name: string; workspace: LearnerWorkspace; onView: (view: View) => void; onCourse: (course: Course) => void }) {
  const firstName = name.split(" ").filter(Boolean)[0] || "à vous";
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  if (workspace.loading) return <section className="empty-state"><span className="empty-icon"><Clock3 size={30} /></span><h1>Chargement de votre espace…</h1><p>Nous vérifions les formations qui vous ont été attribuées.</p></section>;
  if (workspace.courses.length === 0) return <>
    <section className="page-heading learner-heading"><div><span className="eyebrow">{dateLabel}</span><h1>Bonjour {firstName} <span>👋</span></h1><p>Bienvenue dans votre espace personnel de formation.</p></div></section>
    {workspace.error && <div className="form-message" role="alert">{workspace.error}</div>}
    <section className="panel learner-empty-state"><span className="empty-icon"><Inbox size={30} /></span><span className="eyebrow">Espace prêt</span><h2>Aucune formation ne vous a encore été assignée</h2><p>Votre administrateur ajoutera progressivement les modules adaptés à votre parcours. Ils apparaîtront ici automatiquement.</p><div className="empty-state-metrics"><span><strong>0</strong> formation assignée</span><span><strong>0</strong> certificat</span><span><strong>0 %</strong> de progression</span></div></section>
  </>;
  const activeCourses = workspace.courses.filter((course) => course.status !== "Terminée");
  const nextCourse = activeCourses[0] ?? workspace.courses[0];
  const completed = workspace.courses.filter((course) => course.status === "Terminée").length;
  const globalProgress = workspace.courses.length ? Math.round(workspace.courses.reduce((total, course) => total + course.progress, 0) / workspace.courses.length) : 0;
  return <>
    <section className="page-heading learner-heading"><div><span className="eyebrow">{dateLabel}</span><h1>Bonjour {firstName} <span>👋</span></h1><p>Retrouvez uniquement les parcours qui vous ont été assignés.</p></div></section>
    <section className="learner-hero"><div className="hero-copy"><span className="eyebrow eyebrow-light"><Sparkles size={14} /> {nextCourse.progress > 0 ? "À poursuivre" : "Prochaine formation"}</span><h2>{nextCourse.title}</h2><p>{nextCourse.nextLesson}</p><div className="hero-progress"><div><span style={{ width: `${nextCourse.progress}%` }} /></div><strong>{nextCourse.progress} %</strong></div><button className="light-button" onClick={() => onCourse(nextCourse)}><Play size={17} fill="currentColor" /> {nextCourse.progress > 0 ? "Reprendre le cours" : "Commencer"}</button></div><div className="hero-orbit" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="hero-emblem"><ShieldCheck size={52} strokeWidth={1.5} /></span><span className="float-card float-card-one"><CheckCircle2 size={18} /> {nextCourse.completedModules} module{nextCourse.completedModules > 1 ? "s" : ""} validé{nextCourse.completedModules > 1 ? "s" : ""}</span><span className="float-card float-card-two"><Clock3 size={18} /> {nextCourse.modules} modules au total</span></div></section>
    <section className="metric-grid learner-metrics">
      <article className="metric-card"><div className="metric-icon tone-teal-soft"><TrendingUp size={21} /></div><div><span>Progression globale</span><strong>{globalProgress} %</strong><small>Calculée sur vos affectations</small></div><ProgressRing value={globalProgress} size={58} /></article>
      <article className="metric-card"><div className="metric-icon tone-blue-soft"><BookOpen size={21} /></div><div><span>Formations en cours</span><strong>{activeCourses.length}</strong><small>sur {workspace.courses.length} assignée{workspace.courses.length > 1 ? "s" : ""}</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-violet-soft"><Award size={21} /></div><div><span>Certificats obtenus</span><strong>{workspace.certificates.length}</strong><small>{completed} parcours terminé{completed > 1 ? "s" : ""}</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-coral-soft"><ClipboardCheck size={21} /></div><div><span>Prochaine échéance</span><strong className="date-metric">{nextCourse.dueDate ?? "Non définie"}</strong><small>{nextCourse.code}</small></div></article>
    </section>
    <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Votre parcours</span><h2>Formations en cours</h2></div><button className="text-button strong" onClick={() => onView("catalogue")}>Voir toutes les formations <ChevronRight size={16} /></button></div><div className="course-grid">{activeCourses.slice(0, 3).map((course) => <CourseCard key={course.id} course={course} onOpen={onCourse} />)}</div></section>
    <section className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">Traçabilité</span><h3>Votre activité récente</h3></div></div>{workspace.activity.length ? <ul className="learner-activity">{workspace.activity.slice(0, 5).map((activity, index) => <li key={`${activity.occurredAt}-${index}`}><span className={`activity-dot ${index % 2 ? "violet" : "teal"}`} /><div><strong>{activity.summary}</strong><span>{formatDateTime(activity.occurredAt)}</span></div></li>)}</ul> : <div className="table-empty"><Clock3 size={22} /><strong>Aucune activité enregistrée</strong><span>Votre historique apparaîtra après le début d’une formation.</span></div>}</section>
  </>;
}

function useAdminWorkspace(period = 30) {
  const [metrics, setMetrics] = useState<AdminSnapshot>(EMPTY_ADMIN);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [roleAudit, setRoleAudit] = useState<RoleAudit[]>([]);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch(`/.netlify/functions/lms-data?scope=admin&period=${period}`).then(async (response) => {
      const data = await response.json() as { error?: string; totals?: Record<string, number>; recentActivity?: Array<Record<string, unknown>>; dailyLogins?: Array<Record<string, unknown>>; departmentStats?: Array<Record<string, unknown>>; courseStats?: Array<Record<string, unknown>>; accounts?: Array<Record<string, unknown>>; roleAudit?: Array<Record<string, unknown>>; periodDays?: number };
      if (!response.ok) throw new Error(data.error || "Chargement impossible");
      return data;
    }).then((data) => {
      const totals = data.totals ?? {};
      const loginMap = new Map((data.dailyLogins ?? []).map((item) => [String(item.day), Number(item.count ?? 0)]));
      const periodDays = Number(data.periodDays ?? period);
      const loginLabels: string[] = [];
      const loginSeries = Array.from({ length: periodDays }, (_, offset) => {
        const day = new Date(); day.setDate(day.getDate() - (periodDays - 1 - offset));
        loginLabels.push(day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));
        return loginMap.get(day.toISOString().slice(0, 10)) ?? 0;
      });
      setMetrics({
        learners: Number(totals.learners ?? 0), publishedCourses: Number(totals.published_courses ?? 0), certificates: Number(totals.certificates ?? 0),
        loginsToday: Number(totals.logins_today ?? 0), overdue: Number(totals.overdue ?? 0), completedEnrollments: Number(totals.completed_enrollments ?? 0),
        inProgressEnrollments: Number(totals.in_progress_enrollments ?? 0), assignedEnrollments: Number(totals.assigned_enrollments ?? 0),
        completionRate: Number(totals.completion_rate ?? 0), inactiveUsers: Number(totals.inactive_users ?? 0), activeUsers7d: Number(totals.active_users_7d ?? 0),
        activeUsersPeriod: Number(totals.active_users_period ?? 0), certificatesPeriod: Number(totals.certificates_period ?? 0),
        admins: Number(totals.admins ?? 0), superAdmins: Number(totals.super_admins ?? 0), passportConnected: Number(totals.passport_connected ?? 0),
        integrationsPending: Number(totals.integrations_pending ?? 0), integrationsFailed: Number(totals.integrations_failed ?? 0), loginSeries, loginLabels, periodDays,
        departmentStats: (data.departmentStats ?? []).map((item) => ({ department: String(item.department ?? "Non renseigné"), learners: Number(item.learners ?? 0), activeLearners: Number(item.active_learners ?? 0), averageProgress: Number(item.average_progress ?? 0), completed: Number(item.completed ?? 0) })),
        coursePerformance: (data.courseStats ?? []).map((item) => ({ id: String(item.id), code: String(item.code ?? "WA"), title: String(item.title ?? "Formation"), enrolled: Number(item.enrolled ?? 0), completion: Number(item.completion_rate ?? 0) })).sort((left, right) => right.enrolled - left.enrolled || right.completion - left.completion).slice(0, 6),
        activities: (data.recentActivity ?? []).map((item) => { const name = String(item.full_name ?? item.email ?? "Utilisateur"); return {
          id: String(item.id ?? `${item.occurred_at}-${item.event_type}`), name, initials: initialsFrom(name), summary: String(item.summary ?? "Activité enregistrée"), detail: String(item.entity_title ?? activityCategory(String(item.event_type ?? ""), String(item.entity_type ?? ""))), occurredAt: String(item.occurred_at ?? ""),
          eventType: String(item.event_type ?? "event"), entityType: String(item.entity_type ?? ""), entityId: String(item.entity_id ?? ""), linkedCourseId: String(item.linked_course_id ?? ""), userId: String(item.user_id ?? ""), email: String(item.email ?? ""), matricule: String(item.matricule ?? ""), department: String(item.department ?? ""), jobTitle: String(item.job_title ?? ""), status: String(item.status ?? "active"), lastLoginAt: item.last_login_at ? String(item.last_login_at) : null, hasAvatar: Boolean(item.has_avatar),
        }; }),
      });
      setAccounts((data.accounts ?? []).map((item) => ({ id: String(item.id), name: String(item.full_name ?? item.email ?? "Utilisateur"), email: String(item.email ?? ""), role: roleFromClaims([String(item.role ?? "learner")]), status: String(item.status ?? "active"), lastLoginAt: item.last_login_at ? String(item.last_login_at) : null })));
      setRoleAudit((data.roleAudit ?? []).map((item) => ({ id: String(item.id), actorName: String(item.actor_name ?? "Administration"), targetName: String(item.target_name ?? "Utilisateur"), previousRole: item.previous_role ? roleFromClaims([String(item.previous_role)]) : null, newRole: roleFromClaims([String(item.new_role)]), occurredAt: String(item.occurred_at ?? "") })));
    }).catch(() => { setMetrics(EMPTY_ADMIN); setLoadError("Les indicateurs n’ont pas pu être chargés depuis la base Netlify."); }).finally(() => setLoading(false));
  }, [period]);
  return { metrics, accounts, setAccounts, roleAudit, loading, loadError };
}

function BusinessInsights({ metrics, period, onPeriod, onView }: { metrics: AdminSnapshot; period: number; onPeriod: (period: number) => void; onView: (view: View) => void }) {
  const maximum = Math.max(...metrics.loginSeries, 1);
  const points = metrics.loginSeries.map((value, index) => {
    const x = metrics.loginSeries.length <= 1 ? 0 : (index / (metrics.loginSeries.length - 1)) * 100;
    const y = 38 - (value / maximum) * 32;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const totalAssignments = metrics.completedEnrollments + metrics.inProgressEnrollments + metrics.assignedEnrollments + metrics.overdue;
  const completionShare = totalAssignments ? Math.round((metrics.completedEnrollments / totalAssignments) * 100) : 0;
  const inProgressShare = totalAssignments ? Math.round((metrics.inProgressEnrollments / totalAssignments) * 100) : 0;
  const overdueShare = totalAssignments ? Math.max(0, 100 - completionShare - inProgressShare) : 0;
  const engagementRate = metrics.learners ? Math.round((metrics.activeUsersPeriod / metrics.learners) * 100) : 0;
  const maxDepartmentLearners = Math.max(...metrics.departmentStats.map((item) => item.learners), 1);
  const topDepartment = [...metrics.departmentStats].sort((left, right) => right.averageProgress - left.averageProgress)[0];
  return <section className="bi-workbench" aria-label="Insights de pilotage">
    <header className="bi-toolbar"><div><span className="eyebrow">Analyse décisionnelle</span><h2>Insights formation</h2><p>Les indicateurs se recalculent selon la période choisie.</p></div><div className="period-switch" aria-label="Période d’analyse">{[7, 30, 90].map((days) => <button key={days} className={period === days ? "active" : ""} onClick={() => onPeriod(days)}>{days} jours</button>)}</div></header>
    <div className="bi-grid">
      <article className="panel bi-trend-card"><div className="panel-heading"><div><span className="eyebrow">Engagement</span><h3>Connexions dans le temps</h3></div><span className="bi-big-value">{metrics.activeUsersPeriod}<small>actifs</small></span></div><div className="line-chart"><svg viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label={`Évolution des connexions sur ${period} jours`}><defs><linearGradient id={`login-area-${period}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c31f32" stopOpacity=".3" /><stop offset="100%" stopColor="#c31f32" stopOpacity="0" /></linearGradient></defs><polygon points={`0,42 ${points} 100,42`} fill={`url(#login-area-${period})`} /><polyline points={points} fill="none" stroke="#c31f32" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg><div><span>{metrics.loginLabels[0] ?? "Début"}</span><strong>{engagementRate} % des apprenants actifs</strong><span>{metrics.loginLabels.at(-1) ?? "Aujourd’hui"}</span></div></div></article>
      <article className="panel bi-status-card"><div className="panel-heading"><div><span className="eyebrow">Portefeuille</span><h3>État des affectations</h3></div><button className="text-button strong" onClick={() => onView("users")}>Analyser</button></div><div className="stacked-progress" aria-label="Répartition des affectations"><span className="complete" style={{ width: `${completionShare}%` }} /><span className="current" style={{ width: `${inProgressShare}%` }} /><span className="late" style={{ width: `${overdueShare}%` }} /></div><div className="bi-legend"><span><i className="complete" /><strong>{metrics.completedEnrollments}</strong><small>Terminées</small></span><span><i className="current" /><strong>{metrics.inProgressEnrollments}</strong><small>En cours</small></span><span><i className="late" /><strong>{metrics.overdue}</strong><small>À relancer</small></span></div><div className="bi-certificate-note"><Award size={18} /><span><strong>{metrics.certificatesPeriod} certificat{metrics.certificatesPeriod > 1 ? "s" : ""} sur la période</strong><small>{metrics.certificates} délivrés au total</small></span></div></article>
      <article className="panel bi-department-card"><div className="panel-heading"><div><span className="eyebrow">Comparaison</span><h3>Services les plus représentés</h3></div><span className="count-badge">Top {Math.min(metrics.departmentStats.length, 5)}</span></div>{metrics.departmentStats.length ? <div className="department-bars">{metrics.departmentStats.slice(0, 5).map((item) => <button key={item.department} onClick={() => onView("users")}><span><strong>{item.department}</strong><small>{item.learners} apprenant{item.learners > 1 ? "s" : ""} · {item.averageProgress} % moyen</small></span><i><b style={{ width: `${Math.max(4, (item.learners / maxDepartmentLearners) * 100)}%` }} /></i></button>)}</div> : <div className="table-empty"><TrendingUp size={21} /><strong>Données en attente</strong><span>Les services apparaîtront après la création des profils.</span></div>}</article>
    </div>
    <div className="insight-callouts"><article><TrendingUp size={18} /><span><small>Engagement</small><strong>{engagementRate >= 70 ? "Dynamique solide" : engagementRate >= 40 ? "Participation à renforcer" : "Relances recommandées"}</strong><p>{metrics.activeUsersPeriod} apprenant{metrics.activeUsersPeriod > 1 ? "s" : ""} actif{metrics.activeUsersPeriod > 1 ? "s" : ""} sur {metrics.learners}.</p></span></article><article><Award size={18} /><span><small>Certification</small><strong>{metrics.certificatesPeriod ? "Résultats enregistrés" : "Aucune délivrance récente"}</strong><p>{metrics.certificatesPeriod} certificat{metrics.certificatesPeriod > 1 ? "s" : ""} généré{metrics.certificatesPeriod > 1 ? "s" : ""} sur {period} jours.</p></span></article><article><UsersRound size={18} /><span><small>Meilleur avancement</small><strong>{topDepartment?.department ?? "À calculer"}</strong><p>{topDepartment ? `${topDepartment.averageProgress} % de progression moyenne.` : "Les données se consolident automatiquement."}</p></span></article></div>
  </section>;
}

function DashboardViewSwitcher({ value, onChange }: { value: "superadmin" | "admin" | "learner"; onChange: (value: "superadmin" | "admin" | "learner") => void }) {
  return <section className="dashboard-view-switcher"><span><Eye size={17} /><strong>Visualiser un autre espace</strong><small>La prévisualisation ne modifie pas vos droits.</small></span><div><button className={value === "superadmin" ? "active" : ""} onClick={() => onChange("superadmin")}><ShieldCheck size={15} /> Super-admin</button><button className={value === "admin" ? "active" : ""} onClick={() => onChange("admin")}><UserCog size={15} /> Administrateur</button><button className={value === "learner" ? "active" : ""} onClick={() => onChange("learner")}><UserRound size={15} /> Apprenant</button></div></section>;
}

function AdminDashboard({ onView, onActivity, embedded = false }: { onView: (view: View) => void; onActivity: (activity: AdminActivity) => void; embedded?: boolean }) {
  const [period, setPeriod] = useState(30);
  const { metrics, loading, loadError } = useAdminWorkspace(period);
  return <>
    <section className="page-heading"><div><span className="eyebrow">{embedded ? "Prévisualisation du rôle" : "Pilotage opérationnel"}</span><h1>Tableau de bord administrateur</h1><p>Affectez les formations, suivez les progrès et relancez les apprenants au bon moment.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => onView("users")}><UserPlus size={17} /> Gérer les apprenants</button><button className="primary-button" onClick={() => onView("trainings")}><BookOpen size={17} /> Nouvelle formation</button></div></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="metric-grid admin-metrics">
      <article className="metric-card admin-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Apprenants inscrits</span><strong>{loading ? "…" : metrics.learners}</strong><small>Comptes réels dans la base</small></div><span className="mini-label">{metrics.publishedCourses} parcours publiés</span></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-blue-soft"><TrendingUp size={21} /></div><div><span>Taux de complétion</span><strong>{metrics.completionRate} %</strong><small>Sur les affectations réelles</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-violet-soft"><Award size={21} /></div><div><span>Certificats délivrés</span><strong>{metrics.certificates}</strong><small>Historique consolidé</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-coral-soft"><CircleHelp size={21} /></div><div><span>À relancer</span><strong>{metrics.overdue}</strong><small className="warning">Échéance dépassée</small></div></article>
    </section>
    <BusinessInsights metrics={metrics} period={period} onPeriod={setPeriod} onView={onView} />
    <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">En direct</span><h3>Activité récente</h3></div><button className="text-button strong" onClick={() => onView("activity")}>Tout afficher <ChevronRight size={15} /></button></div>{metrics.activities.length ? <div className="activity-list">{metrics.activities.slice(0, 8).map((activity) => <button className="activity-item clickable-activity" key={activity.id} onClick={() => onActivity(activity)}><span className="avatar avatar-teal">{activity.initials}</span><div className="activity-copy"><p><strong>{activity.name}</strong></p><span>{activity.summary}</span></div><span className="activity-detail">{activity.detail}</span><time>{formatDateTime(activity.occurredAt)}</time><ChevronRight size={16} /></button>)}</div> : <div className="table-empty"><TrendingUp size={22} /><strong>Aucune activité enregistrée</strong><span>Les événements apparaîtront après les premières affectations.</span></div>}</section>
  </>;
}

function RoleControl({ account, onUpdated }: { account: AdminAccount; onUpdated: (account: AdminAccount) => void }) {
  const [role, setRole] = useState<Role>(account.role);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const save = async () => {
    if (role === account.role) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/.netlify/functions/user-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-role", userId: account.id, role }) });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "Mise à jour impossible");
      onUpdated({ ...account, role });
      setMessage("Rôle enregistré");
    } catch (error) { setRole(account.role); setMessage(error instanceof Error ? error.message : "Mise à jour impossible"); }
    finally { setSaving(false); }
  };
  return <div className="role-control"><select aria-label={`Rôle de ${account.name}`} value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="learner">Apprenant</option><option value="admin">Administrateur</option><option value="super_admin">Super-administrateur</option></select><button className="secondary-button" onClick={save} disabled={saving || role === account.role}>{saving ? "…" : "Appliquer"}</button>{message && <small>{message}</small>}</div>;
}

function SuperAdminDashboard({ onView, onActivity }: { onView: (view: View) => void; onActivity: (activity: AdminActivity) => void }) {
  const [previewRole, setPreviewRole] = useState<"superadmin" | "admin" | "learner">("superadmin");
  const [period, setPeriod] = useState(30);
  const { metrics, accounts, setAccounts, roleAudit, loading, loadError } = useAdminWorkspace(period);
  const updateAccount = (updated: AdminAccount) => setAccounts((current) => current.map((account) => account.id === updated.id ? updated : account));
  const switcher = <DashboardViewSwitcher value={previewRole} onChange={setPreviewRole} />;
  if (previewRole === "admin") return <>{switcher}<div className="dashboard-preview-banner"><Eye size={17} /><span><strong>Vue administrateur</strong><small>Vous voyez le rendu opérationnel tout en conservant vos droits de super-administrateur.</small></span></div><AdminDashboard onView={onView} onActivity={onActivity} embedded /></>;
  if (previewRole === "learner") return <>{switcher}<div className="dashboard-preview-banner"><Eye size={17} /><span><strong>Vue apprenant</strong><small>Aperçu sécurisé d’un espace avant toute affectation de formation.</small></span></div><LearnerDashboard name="Apprenant" workspace={{ loading: false, error: "", courses: [], certificates: [], activity: [], profile: null }} onView={onView} onCourse={() => undefined} /></>;
  return <>
    {switcher}
    <section className="page-heading"><div><span className="eyebrow">Gouvernance de la plateforme</span><h1>Tableau de bord super-administrateur</h1><p>Contrôlez les accès, la santé des intégrations et l’activité globale du LMS.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => onView("activity")}><TrendingUp size={17} /> Consulter les journaux</button><button className="primary-button" onClick={() => onView("users")}><UsersRound size={17} /> Ouvrir les apprenants</button></div></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="metric-grid admin-metrics superadmin-metrics">
      <article className="metric-card admin-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Apprenants</span><strong>{loading ? "…" : metrics.learners}</strong><small>{metrics.activeUsers7d} actif{metrics.activeUsers7d > 1 ? "s" : ""} sur 7 jours</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-blue-soft"><UserCog size={21} /></div><div><span>Administrateurs</span><strong>{metrics.admins}</strong><small>Gestion opérationnelle</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-violet-soft"><ShieldCheck size={21} /></div><div><span>Super-administrateurs</span><strong>{metrics.superAdmins}</strong><small>Gouvernance sensible</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-coral-soft"><Link2 size={21} /></div><div><span>Passeports connectés</span><strong>{metrics.passportConnected}</strong><small>{metrics.integrationsPending} événement{metrics.integrationsPending > 1 ? "s" : ""} en attente</small></div></article>
    </section>
    <BusinessInsights metrics={metrics} period={period} onPeriod={setPeriod} onView={onView} />
    <section className="governance-grid">
      <article className="panel access-governance"><div className="panel-heading"><div><span className="eyebrow">Contrôle des droits</span><h3>Comptes et rôles</h3></div><span className="count-badge">{accounts.length} compte{accounts.length > 1 ? "s" : ""}</span></div>{accounts.length ? <div className="account-role-list">{accounts.map((account) => <div key={account.id}><UserAvatar name={account.name} initials={initialsFrom(account.name)} /><span><strong>{account.name}</strong><small>{account.email} · dernière connexion {formatDateTime(account.lastLoginAt)}</small></span><RoleControl account={account} onUpdated={updateAccount} /></div>)}</div> : <div className="table-empty"><UserCog size={22} /><strong>{loading ? "Chargement des comptes…" : "Aucun compte enregistré"}</strong></div>}</article>
      <article className="panel platform-health"><div className="panel-heading"><div><span className="eyebrow">Interopérabilité</span><h3>État des services</h3></div><ShieldCheck size={20} /></div><div className="health-list"><span><i className="health-ok" /><span><strong>Authentification</strong><small>Rôles vérifiés côté serveur</small></span><b>Opérationnelle</b></span><span><i className={metrics.integrationsFailed ? "health-alert" : "health-ok"} /><span><strong>Passeport de formation</strong><small>{metrics.integrationsPending} en attente · {metrics.integrationsFailed} en erreur</small></span><b>{metrics.integrationsFailed ? "À contrôler" : "Opérationnel"}</b></span><span><i className="health-ok" /><span><strong>Base de données</strong><small>{metrics.publishedCourses} parcours publiés</small></span><b>Connectée</b></span></div></article>
    </section>
    <section className="panel audit-panel"><div className="panel-heading"><div><span className="eyebrow">Traçabilité</span><h3>Derniers changements de rôle</h3></div></div>{roleAudit.length ? <div className="audit-list">{roleAudit.map((entry) => <div key={entry.id}><span className="activity-dot violet" /><span><strong>{entry.targetName}</strong><small>{entry.previousRole ? roleLabel(entry.previousRole) : "Aucun rôle"} → {roleLabel(entry.newRole)} · par {entry.actorName}</small></span><time>{formatDateTime(entry.occurredAt)}</time></div>)}</div> : <div className="table-empty"><ShieldCheck size={22} /><strong>Aucun changement de rôle enregistré</strong><span>Les modifications effectuées ici seront historisées.</span></div>}</section>
  </>;
}

function CatalogueView({ assignedCourses, loading, onCourse }: { assignedCourses: Course[]; loading: boolean; onCourse: (course: Course) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const categories = ["Toutes", ...Array.from(new Set(assignedCourses.map((course) => course.category)))];
  const filtered = assignedCourses.filter((course) => {
    const matchesCategory = category === "Toutes" || course.category === category;
    const haystack = `${course.title} ${course.description} ${course.category}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });
  const grouped = Array.from(new Set(filtered.map((course) => course.category))).sort().map((categoryName) => ({ categoryName, items: filtered.filter((course) => course.category === categoryName) }));
  return <>
    <section className="page-heading"><div><span className="eyebrow">Votre bibliothèque</span><h1>Mes formations</h1><p>Retrouvez vos parcours, vos échéances et les modules déjà validés.</p></div><span className="count-badge">{filtered.length} formation{filtered.length > 1 ? "s" : ""}</span></section>
    <section className="catalogue-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans mes formations…" /></label><div className="filter-pills"><Filter size={16} />{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    {loading ? <section className="empty-state compact-empty"><Clock3 size={28} /><h2>Chargement de vos formations…</h2></section> : filtered.length ? <div className="learner-category-list">{grouped.map((group) => <section className="learner-course-category" key={group.categoryName}><div className="section-heading"><div><span className="eyebrow">Catégorie</span><h2>{group.categoryName}</h2></div><span className="count-badge">{group.items.length} parcours</span></div><div className="course-grid catalogue-grid">{group.items.map((course) => <CourseCard key={course.id} course={course} onOpen={onCourse} />)}</div></section>)}</div> : <section className="empty-state compact-empty"><span className="empty-icon"><Inbox size={28} /></span><h2>{assignedCourses.length ? "Aucun résultat" : "Aucune formation assignée"}</h2><p>{assignedCourses.length ? "Essayez un autre mot-clé ou retirez le filtre actif." : "Seuls les parcours attribués par un administrateur apparaîtront dans cet espace."}</p></section>}
  </>;
}

function themeIcon(themeId: string) {
  if (themeId === "ai") return <Sparkles size={18} />;
  if (themeId === "cyber" || themeId === "quality") return <ShieldCheck size={18} />;
  if (themeId === "patient") return <UsersRound size={18} />;
  if (themeId === "clinical") return <ClipboardCheck size={18} />;
  if (themeId === "management") return <UserCog size={18} />;
  if (themeId === "administration") return <Table2 size={18} />;
  if (themeId === "safety") return <CircleHelp size={18} />;
  if (themeId === "hospitality") return <Award size={18} />;
  if (themeId === "softskills") return <TrendingUp size={18} />;
  return themeId === "it" ? <Settings size={18} /> : <BookOpen size={18} />;
}

function FullCatalogueView({ onCourse, focusCode, onFocusHandled }: { onCourse: (course: Course) => void; focusCode?: string; onFocusHandled?: () => void }) {
  const [query, setQuery] = useState("");
  const [themeId, setThemeId] = useState("all");
  const [source, setSource] = useState("Tous les catalogues");
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<CatalogCourse | null>(null);
  const [preparing, setPreparing] = useState<{ course: Course; catalog: CatalogCourse } | null>(null);
  const [catalogStates, setCatalogStates] = useState<Record<string, { id: string; lifecycle: string }>>({});
  const sources = ["Tous les catalogues", ...Array.from(new Set(trainingCatalogue.map((item) => item.source)))];
  const themeOrder = new Map(trainingThemes.map((theme, index) => [theme.id, index]));
  const filtered = trainingCatalogue.filter((item) => {
    const theme = trainingThemeFor(item);
    const haystack = `${item.code} ${item.title} ${theme.label} ${theme.description} ${item.theme} ${item.audience} ${item.description ?? ""} ${item.objective ?? ""}`.toLowerCase();
    return (themeId === "all" || theme.id === themeId) && (source === "Tous les catalogues" || item.source === source) && haystack.includes(query.trim().toLowerCase());
  }).sort((left, right) => (themeOrder.get(trainingThemeFor(left).id) ?? 99) - (themeOrder.get(trainingThemeFor(right).id) ?? 99) || left.title.localeCompare(right.title, "fr"));
  const themeCounts = trainingThemes.map((theme) => ({ ...theme, count: trainingCatalogue.filter((course) => trainingThemeFor(course).id === theme.id).length })).filter((theme) => theme.count > 0);
  const overviewMode = themeId === "all" && !query.trim() && source === "Tous les catalogues";
  const visibleCodes = new Set(filtered.slice(0, limit).map((item) => item.code));
  const groupedCatalogue = trainingThemes.map((theme) => {
    const matches = filtered.filter((item) => trainingThemeFor(item).id === theme.id);
    return { ...theme, total: matches.length, items: overviewMode ? matches.slice(0, 4) : matches.filter((item) => visibleCodes.has(item.code)) };
  }).filter((theme) => theme.items.length > 0);

  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=catalog").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { courses?: Array<Record<string, unknown>> }) => {
      setCatalogStates(Object.fromEntries((data.courses ?? []).map((item) => [String(item.code), { id: String(item.id), lifecycle: String(item.lifecycle_status ?? "catalog") }])));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!focusCode) return;
    const frame = window.requestAnimationFrame(() => {
      const match = trainingCatalogue.find((item) => item.code === focusCode);
      if (match) { setSelected(match); setThemeId(trainingThemeFor(match).id); setQuery(""); setLimit(24); }
      onFocusHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusCode, onFocusHandled]);

  return <>
    <section className="page-heading catalogue-heading"><div><span className="eyebrow">Offre Walyah Académie 2026</span><h1>Catalogues par thématique</h1><p>Les formations sont regroupées par grands domaines pour retrouver rapidement un parcours IT, santé, management, hygiène, IA ou cybersécurité.</p></div><div className="catalogue-downloads"><span className="count-badge"><BookOpen size={15} /> {catalogueTotals.all} formations intégrées</span><a className="secondary-button" href="/catalogues/catalogue-walyah-academie-2026-complet.pdf" target="_blank" rel="noreferrer"><FileText size={15} /> Catalogue complet</a><a className="secondary-button" href="/catalogues/catalogue-formations-medicales-2026.pdf" target="_blank" rel="noreferrer"><FileText size={15} /> Catalogue médical</a></div></section>
    <section className="catalogue-insights"><article><strong>{catalogueTotals.all}</strong><span>formations indexées</span></article><article><strong>{themeCounts.length}</strong><span>domaines thématiques</span></article><article><strong>2</strong><span>catalogues 2026</span></article><article><strong>{courses.length}</strong><span>parcours scénarisés</span></article></section>
    <section className="catalogue-category-index thematic-index" aria-label="Thématiques de formation">
      <button className={themeId === "all" ? "active" : ""} onClick={() => { setThemeId("all"); setLimit(24); }}><span><LibraryBig size={18} /></span><strong>Toutes les thématiques</strong><small>{trainingCatalogue.length} formations</small><em>Vue d’ensemble des domaines</em></button>
      {themeCounts.map((theme) => <button key={theme.id} className={`${themeId === theme.id ? "active" : ""} theme-${theme.id}`} onClick={() => { setThemeId(theme.id); setLimit(24); }}><span>{themeIcon(theme.id)}</span><strong>{theme.label}</strong><small>{theme.count} formation{theme.count > 1 ? "s" : ""}</small><em>{theme.description}</em></button>)}
    </section>
    <section className="catalogue-toolbar admin-catalogue-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} placeholder="Rechercher : IT, soins, Excel, management…" /></label><select aria-label="Filtrer par thématique" value={themeId} onChange={(event) => { setThemeId(event.target.value); setLimit(24); }}><option value="all">Toutes les thématiques</option>{themeCounts.map((theme) => <option value={theme.id} key={theme.id}>{theme.label}</option>)}</select><select aria-label="Filtrer par catalogue" value={source} onChange={(event) => { setSource(event.target.value); setLimit(24); }}>{sources.map((item) => <option key={item}>{item}</option>)}</select><span>{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span></section>
    {filtered.length ? <>{groupedCatalogue.map((group) => <section className={`catalogue-category-section theme-section theme-${group.id}`} key={group.id}><header><div><span className="category-emblem">{themeIcon(group.id)}</span><span><small>Thématique de formation</small><h2>{group.label}</h2><p>{group.description}</p></span></div><div className="category-section-actions"><strong>{overviewMode ? `${group.items.length} sur ${group.total}` : `${group.total} formation${group.total > 1 ? "s" : ""}`}</strong>{overviewMode && group.total > group.items.length && <button className="text-button strong" onClick={() => { setThemeId(group.id); setLimit(24); }}>Voir toute la thématique <ChevronRight size={14} /></button>}</div></header><div className="master-catalogue-grid">{group.items.map((item) => { const ready = readyCourseByCode.get(item.code); const lifecycle = catalogStates[item.code]?.lifecycle; return <button className="catalogue-entry" key={item.code} onClick={() => setSelected(item)}><div><span className="course-code">{item.code}</span>{ready || lifecycle === "published" ? <span className="status-tag status-actif">Prêt dans le LMS</span> : lifecycle === "draft" ? <span className="status-tag status-relancer">En préparation</span> : <span className="status-tag status-draft">Catalogue</span>}</div><h2>{item.title}</h2><p>{item.objective ?? item.description}</p><footer><span><Clock3 size={14} /> {item.duration}</span><span>{trainingThemeFor(item).label}</span><ChevronRight size={17} /></footer></button>; })}</div></section>)}{!overviewMode && limit < filtered.length && <div className="load-more"><button className="secondary-button" onClick={() => setLimit(Math.min(limit + 24, filtered.length))}>Afficher 24 formations de plus</button></div>}</> : <section className="empty-state compact-empty"><Search size={28} /><h2>Aucune formation trouvée</h2><p>Modifiez la thématique, le catalogue ou essayez un terme plus général.</p></section>}
    {selected && <Modal title={`${selected.code} · ${selected.title}`} onClose={() => setSelected(null)} wide><div className="catalogue-detail"><div className="catalogue-detail-meta"><span>{trainingThemeFor(selected).label}</span><span><Clock3 size={14} /> {selected.duration}</span><span><UsersRound size={14} /> {selected.audience}</span></div>{selected.need && <section><span className="form-section-title">Besoin professionnel</span><p>{selected.need}</p></section>}<section><span className="form-section-title">Objectif</span><p>{selected.objective ?? selected.description}</p></section>{selected.program?.length ? <section><span className="form-section-title">Programme proposé</span><ol>{selected.program.map((item) => <li key={item}>{item}</li>)}</ol></section> : <section><span className="form-section-title">Public ou métier d’origine</span><p>{selected.theme}</p></section>}{selected.methods && <section><span className="form-section-title">Méthodes pédagogiques</span><p>{selected.methods}</p></section>}{selected.benefit && <section><span className="form-section-title">Bénéfice attendu</span><p>{selected.benefit}</p></section>}<footer><div><small>Source</small><strong>{selected.source}</strong></div>{readyCourseByCode.has(selected.code) ? <button className="primary-button" onClick={() => { const ready = readyCourseByCode.get(selected.code); if (ready) onCourse(ready); }}><Play size={16} /> Ouvrir le parcours</button> : <button className="primary-button" onClick={() => { const draft = catalogCourseDraft(selected); const remote = catalogStates[selected.code]; if (remote?.id) draft.id = remote.id; setCatalogStates((current) => ({ ...current, [selected.code]: { id: draft.id, lifecycle: "draft" } })); setPreparing({ course: draft, catalog: selected }); setSelected(null); }}><Plus size={16} /> {catalogStates[selected.code]?.lifecycle === "draft" ? "Continuer la préparation" : "Préparer ce parcours"}</button>}</footer></div></Modal>}
    {preparing && <ManageContentModal course={preparing.course} catalogSeed={preparing.catalog} onClose={() => setPreparing(null)} onPublished={() => setCatalogStates((current) => ({ ...current, [preparing.catalog.code]: { id: preparing.course.id, lifecycle: "published" } }))} />}
  </>;
}

function LessonBlocks({ content }: { content: LessonContent }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  return <section className={`learner-lesson-blocks layout-${content.layout}`}>{content.blocks.map((block) => {
    if (block.type === "hero") return <article className="learner-block learner-hero" key={block.id}><span className="eyebrow">Module interactif</span><h2>{block.title}</h2>{block.body && <p>{block.body}</p>}</article>;
    if (block.type === "callout") return <article className={`learner-block learner-callout tone-${block.tone ?? "info"}`} key={block.id}><CircleHelp size={20} /><div><h3>{block.title}</h3>{block.body && <p>{block.body}</p>}</div></article>;
    if (block.type === "case_study") return <article className="learner-block learner-case" key={block.id}><span><ClipboardCheck size={21} /></span><div><small>Cas pratique</small><h3>{block.title}</h3>{block.body && <p>{block.body}</p>}{block.prompt && <strong>{block.prompt}</strong>}</div></article>;
    if (block.type === "knowledge_check") {
      const selected = answers[block.id];
      const answered = selected !== undefined;
      return <article className="learner-block learner-check" key={block.id}><span className="eyebrow">Vérification rapide</span><h3>{block.prompt || block.title}</h3><div>{(block.options ?? []).map((option, index) => <button className={answered ? index === block.correctAnswer ? "correct" : selected === index ? "incorrect" : "" : ""} key={`${block.id}-${option}`} onClick={() => setAnswers((current) => ({ ...current, [block.id]: index }))} disabled={answered}><span>{String.fromCharCode(65 + index)}</span>{option}{answered && index === block.correctAnswer && <Check size={15} />}</button>)}</div>{answered && <p className={selected === block.correctAnswer ? "check-feedback success" : "check-feedback warning"}>{selected === block.correctAnswer ? "Bonne réponse. " : "Réponse à revoir. "}{block.explanation}</p>}</article>;
    }
    const items = block.items ?? [];
    return <article className={`learner-block learner-${block.type}`} key={block.id}><span className="eyebrow">{block.type === "steps" ? "Méthode" : block.type === "summary" ? "Synthèse" : block.type === "objectives" ? "Objectifs" : "Contenu"}</span><h3>{block.title}</h3>{block.body && <p>{block.body}</p>}{items.length > 0 && (block.type === "steps" ? <ol>{items.map((item, index) => <li key={`${block.id}-${item}`}><span>{index + 1}</span>{item}</li>)}</ol> : <ul>{items.map((item) => <li key={`${block.id}-${item}`}><Check size={15} />{item}</li>)}</ul>)}</article>;
  })}</section>;
}

function CourseDetail({ course, onBack, onQuiz, onCertificate }: { course: Course; onBack: () => void; onQuiz: () => void; onCertificate: () => void }) {
  const [activeModule, setActiveModule] = useState(Math.max(1, Math.min(course.completedModules + 1, course.modules)));
  const [completedModules, setCompletedModules] = useState(course.completedModules);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [certificateReady, setCertificateReady] = useState(false);
  const activeContent = course.moduleContent[activeModule - 1] ?? course.moduleContent[0];
  const markComplete = async () => {
    if (!activeContent) return;
    setSaving(true); setNotice("");
    let generatedCertificate = false;
    if (usesNetlifyIdentity()) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete-module", moduleId: activeContent.id ?? `${course.id}-module-${activeModule}` }) });
        const data = await response.json() as { error?: string; certificate?: { certificate_number?: string } | null };
        if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
        if (data.certificate) { generatedCertificate = true; setCertificateReady(true); }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Enregistrement impossible");
        setSaving(false);
        return;
      }
    }
    const next = Math.max(completedModules, activeModule);
    setCompletedModules(next);
    setNotice(next >= course.modules
      ? generatedCertificate || certificateReady ? "Formation validée. Votre progression finale a bien été enregistrée." : course.quiz ? "Tous les modules sont terminés. Validez maintenant l’évaluation finale pour obtenir votre certificat." : "Formation validée. Votre progression finale a bien été enregistrée."
      : "Module validé. Votre progression a bien été enregistrée.");
    setSaving(false);
    window.setTimeout(() => setNotice(""), 3000);
    if (activeModule < course.modules) setActiveModule(activeModule + 1);
  };
  const progress = Math.round((completedModules / course.modules) * 100);
  if (!activeContent) return <><button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Retour à mes formations</button><section className="empty-state"><span className="empty-icon"><Inbox size={28} /></span><h1>Contenu en préparation</h1><p>L’administrateur n’a pas encore publié de module dans ce parcours.</p></section></>;
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Retour à mes formations</button>
    <section className="course-detail-heading"><div><span className={`detail-icon tone-${course.accent}`}><BookOpen size={27} /></span><div><span className="eyebrow">{course.category} · {course.duration}</span><h1>{course.title}</h1><p>{course.description}</p></div></div><div className="detail-progress"><ProgressRing value={progress} size={70} /><span>{completedModules} / {course.modules} modules</span></div></section>
    {notice && <div className="success-banner" role="status"><CheckCircle2 size={18} /> <span>{notice}{certificateReady && <small> Votre certificat nominatif est disponible.</small>}</span>{certificateReady && <button className="text-button strong" onClick={onCertificate}><Award size={15} /> Voir le certificat</button>}</div>}
    <section className="course-player-grid">
      <div className="course-main-column">
        <div className="video-player"><span className="video-grid" /><div className="video-badge">{activeContent.type === "video" ? <Video size={15} /> : <FileText size={15} />} {activeContent.type === "video" ? "Vidéo" : activeContent.type === "case" ? "Étude de cas" : activeContent.type === "quiz" ? "Évaluation" : "Cours"} · {activeContent.duration}</div>{activeContent.videoUrl ? <a className="play-button" href={activeContent.videoUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir la vidéo"><Play size={34} fill="currentColor" /></a> : <span className="play-button play-button-disabled" aria-label="Aucun média publié"><FileText size={30} /></span>}<div className="video-caption"><small>Module {activeModule}</small><strong>{activeContent.title}</strong></div></div>
        {activeContent.lessonContent ? <><LessonBlocks content={activeContent.lessonContent} /><div className="lesson-completion-bar"><span><CheckCircle2 size={18} /><span><strong>Vous avez parcouru ce module</strong><small>Validez-le pour enregistrer votre progression.</small></span></span><button className="primary-button" onClick={markComplete} disabled={saving}><CheckCircle2 size={17} /> {saving ? "Enregistrement…" : "Marquer comme terminé"}</button></div></> : <article className="panel lesson-content"><div className="panel-heading"><div><span className="eyebrow">À retenir</span><h3>Objectifs de ce module</h3></div>{activeContent.videoUrl && <a className="resource-link" href={activeContent.videoUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ouvrir la vidéo</a>}</div><p>{activeContent.summary}</p>{activeContent.points.length ? <ul>{activeContent.points.map((point) => <li key={point}><Check size={15} /> {point}</li>)}</ul> : <p className="muted-copy">Les objectifs détaillés seront ajoutés par l’équipe pédagogique.</p>}<div className="lesson-actions"><button className="primary-button" onClick={markComplete} disabled={saving}><CheckCircle2 size={17} /> {saving ? "Enregistrement…" : "Marquer comme terminé"}</button></div></article>}
        <article className="panel resources-panel"><div className="panel-heading"><div><span className="eyebrow">Documents</span><h3>Ressources du module</h3></div></div>{activeContent.resources?.length ? <div className="resource-list">{activeContent.resources.map((resource, index) => resource.url ? <a key={`${resource.name}-${index}`} href={resource.url} target="_blank" rel="noreferrer"><span className="resource-icon link"><Link2 size={19} /></span><span><strong>{resource.name}</strong><small>{resource.type}</small></span><ExternalLink size={17} /></a> : <div key={`${resource.name}-${index}`}><span className="resource-icon pdf"><FileText size={19} /></span><span><strong>{resource.name}</strong><small>{resource.type}</small></span></div>)}</div> : <div className="table-empty"><FileText size={22} /><strong>Aucune ressource jointe</strong><span>Les documents publiés par l’administrateur apparaîtront ici.</span></div>}</article>
      </div>
      <aside className="module-sidebar panel"><div className="module-sidebar-head"><span className="eyebrow">Sommaire</span><h3>{course.modules} modules</h3><div className="linear-progress"><span style={{ width: `${progress}%` }} /></div><small>{progress} % complété</small></div><div className="module-list">{course.moduleContent.map((item, index) => { const number = index + 1; const done = number <= completedModules; const active = number === activeModule; return <button key={item.id ?? `${course.id}-${number}`} className={active ? "active" : ""} onClick={() => setActiveModule(number)}><span className={done ? "module-status done" : "module-status"}>{done ? <Check size={14} /> : number}</span><span><small>Module {number} · {item.duration}</small><strong>{item.title}</strong></span>{active && <Play size={14} fill="currentColor" />}</button>; })}</div>{course.quiz && <div className="quiz-callout"><span><FileQuestion size={20} /></span><div><strong>{course.quiz.title}</strong><p>Seuil de réussite : {course.quiz.threshold} %</p></div><button onClick={onQuiz}>Démarrer le QCM</button></div>}</aside>
    </section>
  </>;
}

type LearnerQuizQuestion = { id: string; prompt: string; options: string[]; type: QuizQuestionType; points: number; previewAnswer?: number };

function QuizView({ course, onBack, onCertificate }: { course: Course; onBack: () => void; onCertificate: () => void }) {
  const previewQuestions: LearnerQuizQuestion[] = quizQuestions.map((question, index) => ({ id: String(index), prompt: question.question, options: question.options, type: "single", points: 1, previewAnswer: question.answer }));
  const [questions, setQuestions] = useState<LearnerQuizQuestion[]>(previewQuestions);
  const [quizTitle, setQuizTitle] = useState(course.quiz?.title ?? "Évaluation finale");
  const [threshold, setThreshold] = useState(course.quiz?.threshold ?? 80);
  const [quizLoading, setQuizLoading] = useState(() => usesNetlifyIdentity());
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [passed, setPassed] = useState(false);
  const [certificateGenerated, setCertificateGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultError, setResultError] = useState("");

  useEffect(() => {
    if (!usesNetlifyIdentity() || !course.quiz?.id) return;
    void fetch(`/.netlify/functions/lms-data?scope=quiz&quizId=${encodeURIComponent(course.quiz.id)}`).then(async (response) => {
      const data = await response.json() as { error?: string; quiz?: Record<string, unknown>; questions?: Array<Record<string, unknown>> };
      if (!response.ok) throw new Error(data.error || "Chargement de l’évaluation impossible");
      const loaded = (data.questions ?? []).map((item): LearnerQuizQuestion => {
        let options: string[] = [];
        if (Array.isArray(item.options)) options = item.options.map(String);
        else if (typeof item.options === "string") { try { const parsed = JSON.parse(item.options) as unknown; if (Array.isArray(parsed)) options = parsed.map(String); } catch { options = []; } }
        return { id: String(item.id), prompt: String(item.prompt ?? "Question"), options, type: String(item.question_type ?? "single") as QuizQuestionType, points: Number(item.points ?? 1) };
      });
      if (!loaded.length) throw new Error("Ce questionnaire ne contient aucune question publiée.");
      setQuestions(loaded);
      setQuizTitle(String(data.quiz?.title ?? course.quiz?.title ?? "Évaluation finale"));
      setThreshold(Number(data.quiz?.pass_threshold ?? course.quiz?.threshold ?? 80));
    }).catch((error) => setResultError(error instanceof Error ? error.message : "Chargement impossible")).finally(() => setQuizLoading(false));
  }, [course.quiz?.id, course.quiz?.threshold, course.quiz?.title]);

  const question = questions[step];
  const currentAnswer = question ? answers[question.id] : undefined;
  const hasAnswer = (item: LearnerQuizQuestion) => item.type === "multiple" ? Array.isArray(answers[item.id]) && (answers[item.id] as unknown[]).length > 0 : item.type === "short_text" ? String(answers[item.id] ?? "").trim().length > 0 : Number.isInteger(answers[item.id]);
  const selectOption = (item: LearnerQuizQuestion, index: number) => {
    if (item.type !== "multiple") { setAnswers((current) => ({ ...current, [item.id]: index })); return; }
    const selected = Array.isArray(answers[item.id]) ? answers[item.id] as number[] : [];
    setAnswers((current) => ({ ...current, [item.id]: selected.includes(index) ? selected.filter((value) => value !== index) : [...selected, index] }));
  };
  const finishQuiz = async () => {
    setSubmitting(true); setResultError("");
    let nextScore = Math.round((questions.reduce((total, item) => total + (item.previewAnswer !== undefined && answers[item.id] === item.previewAnswer ? item.points : 0), 0) / Math.max(questions.reduce((total, item) => total + item.points, 0), 1)) * 100);
    let nextPassed = nextScore >= threshold;
    let generated = false;
    if (usesNetlifyIdentity() && course.quiz?.id) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit-quiz", quizId: course.quiz.id, answers }) });
        const data = await response.json() as { error?: string; score?: number; passed?: boolean; certificate?: { certificate_number?: string } | null };
        if (!response.ok) throw new Error(data.error || "Validation impossible");
        nextScore = Number(data.score ?? 0); nextPassed = Boolean(data.passed); generated = Boolean(data.certificate);
      } catch (caught) { setResultError(caught instanceof Error ? caught.message : "Validation impossible"); setSubmitting(false); return; }
    } else generated = nextPassed;
    setFinalScore(nextScore); setPassed(nextPassed); setCertificateGenerated(generated); setFinished(true); setSubmitting(false);
  };
  if (finished) return <section className="quiz-result"><span className={`result-emblem ${passed ? "success" : "retry"}`}>{passed ? <Award size={44} /> : <FileQuestion size={44} />}</span><span className="eyebrow">Résultat de l’évaluation</span><h1>{certificateGenerated ? "Bravo, formation validée !" : passed ? "Évaluation réussie" : "Encore un petit effort"}</h1><p>Vous avez obtenu <strong>{finalScore} %</strong>. Le seuil de réussite est fixé à {threshold} %.</p>{certificateGenerated ? <div className="neutral-note"><Award size={18} /><span><strong>Certificat généré automatiquement</strong><small>Il reprend votre identité, la formation validée, le résultat et un numéro unique.</small></span></div> : passed ? <div className="neutral-note"><Clock3 size={18} /><span><strong>Résultat enregistré</strong><small>Terminez les autres modules ou évaluations du parcours pour déclencher le certificat.</small></span></div> : null}<div className="result-actions"><button className="secondary-button" onClick={() => { setFinished(false); setStep(0); setAnswers({}); }}>Recommencer</button><button className="primary-button" onClick={certificateGenerated ? onCertificate : onBack}>{certificateGenerated ? "Voir mon certificat" : "Retour à la formation"}</button></div></section>;
  if (quizLoading || !question) return <section className="empty-state"><Clock3 size={28} /><h1>{quizLoading ? "Chargement de l’évaluation…" : "Évaluation indisponible"}</h1><p>{resultError || "Aucune question n’est disponible pour le moment."}</p><button className="secondary-button" onClick={onBack}>Retour à la formation</button></section>;
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Quitter l’évaluation</button>
    {resultError && <div className="form-message" role="alert">{resultError}</div>}
    <section className="quiz-shell"><header><div><span className="eyebrow">{quizTitle}</span><h1>{course.title}</h1><small>Seuil de réussite : {threshold} %</small></div><div className="quiz-counter"><strong>{step + 1}</strong><span>/ {questions.length}</span></div></header><div className="quiz-progress"><span style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div><article className="quiz-question"><small>Question {step + 1} · {question.points} point{question.points > 1 ? "s" : ""}</small><h2>{question.prompt}</h2>{question.type === "short_text" ? <label className="short-answer-field"><span>Votre réponse</span><textarea rows={4} value={String(currentAnswer ?? "")} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Saisissez une réponse concise…" /></label> : <div className="answer-list">{question.options.map((option, index) => { const selected = question.type === "multiple" ? Array.isArray(currentAnswer) && currentAnswer.includes(index) : currentAnswer === index; return <button key={`${option}-${index}`} className={selected ? "selected" : ""} onClick={() => selectOption(question, index)}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{selected ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>; })}</div>}{question.type === "multiple" && <p className="quiz-helper">Plusieurs réponses peuvent être correctes.</p>}</article><footer><button className="secondary-button" disabled={step === 0 || submitting} onClick={() => setStep(step - 1)}>Question précédente</button>{step < questions.length - 1 ? <button className="primary-button" disabled={!hasAnswer(question)} onClick={() => setStep(step + 1)}>Question suivante <ChevronRight size={17} /></button> : <button className="primary-button" disabled={!questions.every(hasAnswer) || submitting} onClick={() => void finishQuiz()}>{submitting ? "Validation…" : "Valider mes réponses"} <Check size={17} /></button>}</footer></section>
  </>;
}

function CertificateModal({ certificate, profile, fallbackName, fallbackEmail, onClose }: { certificate: CertificateRecord; profile: LearnerProfile | null; fallbackName: string; fallbackEmail: string; onClose: () => void }) {
  const learnerName = certificate.learnerName || profile?.fullName || fallbackName;
  const learnerMatricule = certificate.matricule || profile?.matricule;
  const learnerDetails = [certificate.jobTitle || profile?.jobTitle, certificate.department || profile?.department, certificate.location || profile?.location].filter(Boolean).join(" · ");
  return <Modal title={`Certificat ${certificate.certificateNumber}`} onClose={onClose} wide><div className="certificate-preview-shell"><article className="print-certificate"><span className="certificate-corner top-left" /><span className="certificate-corner bottom-right" /><header><Image src="/walyah-logo-transparent.png" alt="Walyah Académie" width={250} height={110} priority /><span>Centre de formation professionnelle</span></header><div className="certificate-title"><small>Certificat de fin de formation</small><h1>Certificat de réussite</h1><p>Walyah Académie atteste que</p></div><section className="certificate-learner"><h2>{learnerName}</h2><p>{learnerMatricule ? `Matricule ${learnerMatricule}` : certificate.learnerEmail || fallbackEmail}</p><span>{learnerDetails}</span></section><section className="certificate-course"><p>a suivi et validé avec succès la formation</p><h3>{certificate.courseTitle}</h3><div><span><small>Code</small><strong>{certificate.courseCode}</strong></span><span><small>Catégorie</small><strong>{certificate.courseCategory || "Formation professionnelle"}</strong></span><span><small>Durée</small><strong>{formatDuration(certificate.courseDurationMinutes)}</strong></span><span><small>Résultat</small><strong>{certificate.score === null ? "Validé" : `${certificate.score} %`}</strong></span></div></section><footer><span><small>Délivré le</small><strong>{formatDate(certificate.issuedAt)}</strong></span><span className="certificate-seal"><Award size={31} /><b>Walyah<br />Académie</b></span><span className="certificate-signature"><i>Direction de l’Académie</i><small>Validation électronique</small></span></footer><div className="certificate-verification"><ShieldCheck size={14} /> Certificat nominatif n° {certificate.certificateNumber}</div></article><footer className="certificate-actions"><span><ShieldCheck size={17} /> Document nominatif généré après validation de la formation.</span><div><button className="secondary-button" onClick={onClose}>Fermer</button><button className="primary-button" onClick={() => window.print()}><Printer size={16} /> Imprimer / enregistrer en PDF</button></div></footer></div></Modal>;
}

function CertificatesView({ session, profile, certificates, loading }: { session: Session; profile: LearnerProfile | null; certificates: CertificateRecord[]; loading: boolean }) {
  const [selected, setSelected] = useState<CertificateRecord | null>(null);
  const name = profile?.fullName || session.name;
  return <><section className="page-heading"><div><span className="eyebrow">Vos réussites</span><h1>Mes certificats</h1><p>Consultez, imprimez ou enregistrez en PDF vos certificats nominatifs.</p></div><span className="count-badge"><Award size={15} /> {certificates.length} certificat{certificates.length > 1 ? "s" : ""}</span></section>{loading ? <section className="empty-state compact-empty"><Clock3 size={28} /><h2>Chargement des certificats…</h2></section> : certificates.length ? <div className="certificate-grid">{certificates.map((certificate) => <article className="certificate-card" key={certificate.certificateNumber}><div className="certificate-top"><span className="certificate-mark"><Award size={28} /></span><span className="certificate-number">N° {certificate.certificateNumber}</span></div><span className="eyebrow">Certificat de fin de formation</span><h2>{certificate.courseTitle}</h2><p>Délivré à <strong>{name}</strong> le {formatDate(certificate.issuedAt)}.</p><div className="certificate-score"><span>Résultat final</span><strong>{certificate.score === null ? "Validé" : `${certificate.score} %`}</strong></div><button className="secondary-button" onClick={() => setSelected(certificate)}><Eye size={16} /> Afficher le certificat</button></article>)}</div> : <section className="empty-state compact-empty"><span className="empty-icon"><Award size={28} /></span><h2>Aucun certificat disponible</h2><p>Un certificat nominatif sera créé automatiquement après validation complète d’une formation.</p></section>}{selected && <CertificateModal certificate={selected} profile={profile} fallbackName={session.name} fallbackEmail={session.email} onClose={() => setSelected(null)} />}</>;
}

function UsersView({ onLearner }: { onLearner: (learner: Learner) => void }) {
  const [items, setItems] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tous");
  const [service, setService] = useState("Tous les services");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { learners?: Array<Record<string, unknown>> }) => {
      const rows = data.learners ?? [];
      setItems(rows.map((row) => {
        const name = String(row.full_name ?? row.email ?? "Apprenant");
        const assigned = Number(row.assigned ?? 0);
        const completed = Number(row.completed ?? 0);
        const rawStatus = String(row.status ?? "active");
        return {
          id: String(row.id), matricule: String(row.matricule ?? "À renseigner"), name, initials: initialsFrom(name), email: String(row.email ?? ""), phone: "À renseigner",
          avatarUrl: Boolean(row.has_avatar) ? avatarEndpoint(String(row.id)) : undefined,
          department: String(row.department ?? "Non renseigné"), jobTitle: String(row.job_title ?? "Non renseigné"), manager: "À renseigner", hireDate: "À renseigner", location: String(row.location ?? "Non renseigné"),
          progress: Number(row.progress ?? 0), completed, assigned, lastLogin: row.last_login_at ? new Date(String(row.last_login_at)).toLocaleDateString("fr-FR") : "Jamais", lastLoginDetail: row.last_login_at ? new Date(String(row.last_login_at)).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "",
          status: rawStatus === "inactive" ? "Inactif" : rawStatus === "suspended" ? "À relancer" : "Actif", passportStatus: "À connecter", trainings: [],
        } satisfies Learner;
      }));
    }).catch(() => setLoadError("Les apprenants n’ont pas pu être chargés. Réessayez après avoir vérifié la base Netlify.")).finally(() => setLoading(false));
  }, []);
  const services = Array.from(new Set(items.map((learner) => learner.department || "Non renseigné"))).sort((left, right) => left.localeCompare(right, "fr"));
  const filtered = items.filter((learner) => (status === "Tous" || learner.status === status) && (service === "Tous les services" || learner.department === service) && `${learner.name} ${learner.matricule} ${learner.email} ${learner.department}`.toLowerCase().includes(query.toLowerCase()));
  const serviceGroups = Array.from(new Set(filtered.map((learner) => learner.department || "Non renseigné"))).sort((left, right) => left.localeCompare(right, "fr")).map((department) => ({ department, learners: filtered.filter((learner) => (learner.department || "Non renseigné") === department) }));
  const exportCsv = () => {
    const rows = [["Nom", "Email", "Service", "Progression", "Formations terminées", "Dernière connexion", "Statut"], ...filtered.map((item) => [item.name, item.email, item.department, `${item.progress}%`, `${item.completed}/${item.assigned}`, `${item.lastLogin} ${item.lastLoginDetail}`, item.status])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "suivi-apprenants-walyah.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const renderLearnerRow = (learner: Learner) => <tr className="clickable-row" key={learner.id} onClick={() => onLearner(learner)}><td><button className="person-cell person-button"><UserAvatar name={learner.name} initials={learner.initials} src={learner.avatarUrl} /><span><strong>{learner.name}</strong><small>{learner.matricule} · {learner.email}</small></span></button></td><td>{learner.jobTitle}</td><td><span className="table-progress"><span><i style={{ width: `${learner.progress}%` }} /></span><strong>{learner.progress} %</strong></span></td><td><strong>{learner.completed}</strong> / {learner.assigned}</td><td><strong>{learner.lastLogin}</strong><small>{learner.lastLoginDetail}</small></td><td><span className={`status-tag status-${learner.status.toLowerCase().replace("à ", "").replace(" ", "-")}`}>{learner.status}</span></td><td><button className="icon-button" aria-label={`Ouvrir la fiche de ${learner.name}`} onClick={(event) => { event.stopPropagation(); onLearner(learner); }}><ChevronRight size={18} /></button></td></tr>;
  return <>
    <section className="page-heading"><div><span className="eyebrow">Gestion des utilisateurs</span><h1>Apprenants par service</h1><p>Retrouvez chaque collaborateur dans sa rubrique métier et constituez des groupes de formation transverses.</p></div><div className="heading-actions"><button className="secondary-button" onClick={exportCsv}><Download size={17} /> Exporter le suivi</button><button className="secondary-button" onClick={() => setGroupsOpen(true)}><UsersRound size={17} /> Groupes de formation</button><button className="secondary-button" onClick={() => setImportOpen(true)}><FileUp size={17} /> Importer une liste</button><button className="primary-button" onClick={() => setInviteOpen(true)}><UserPlus size={17} /> Créer un accès</button></div></section>
    {invited.length > 0 && <div className="success-banner"><CheckCircle2 size={18} /> {invited.length} accès apprenant{invited.length > 1 ? "s" : ""} créé{invited.length > 1 ? "s" : ""} ou relié{invited.length > 1 ? "s" : ""} pendant cette session.</div>}
    {notice && <div className="success-banner" role="status"><CheckCircle2 size={18} /> {notice}</div>}
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="panel service-directory"><header><div><span className="eyebrow">Répertoire métier</span><h2>Rubriques par service</h2></div><span className="count-badge">{services.length} service{services.length > 1 ? "s" : ""}</span></header><div className="service-filter-cards"><button className={service === "Tous les services" ? "active" : ""} onClick={() => setService("Tous les services")}><UsersRound size={18} /><span><strong>Tous les services</strong><small>{items.length} apprenant{items.length > 1 ? "s" : ""}</small></span></button>{services.map((department) => { const count = items.filter((learner) => learner.department === department).length; return <button key={department} className={service === department ? "active" : ""} onClick={() => setService(department)}><LibraryBig size={18} /><span><strong>{department}</strong><small>{count} apprenant{count > 1 ? "s" : ""}</small></span></button>; })}</div></section>
    <section className="panel table-panel"><div className="table-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, matricule, e-mail, fonction…" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Tous</option><option>Actif</option><option>À relancer</option><option>Inactif</option></select><span>{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span></div></section>
    {serviceGroups.length ? <div className="learner-service-sections">{serviceGroups.map((group) => <section className="panel learner-service-section" key={group.department}><header><span className="service-section-icon"><UsersRound size={20} /></span><div><span className="eyebrow">Service</span><h2>{group.department}</h2></div><span className="count-badge">{group.learners.length} personne{group.learners.length > 1 ? "s" : ""}</span></header><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Apprenant</th><th>Fonction</th><th>Progression</th><th>Formations</th><th>Dernière connexion</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{group.learners.map(renderLearnerRow)}</tbody></table></div></section>)}</div> : <section className="panel table-empty service-empty">{loading ? <Clock3 size={22} /> : <UsersRound size={22} />}<strong>{loading ? "Chargement des apprenants…" : "Aucun apprenant dans cette rubrique"}</strong><span>{loading ? "Veuillez patienter." : "Modifiez les filtres ou créez un nouvel accès apprenant."}</span></section>}
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvited={(email) => { setInvited([...invited, email]); setInviteOpen(false); }} />}
    {importOpen && <PeopleImportModal onClose={() => setImportOpen(false)} onImported={(message) => { setNotice(message); setImportOpen(false); }} />}
    {groupsOpen && <TrainingGroupsModal learners={items} onClose={() => setGroupsOpen(false)} onChanged={(message) => setNotice(message)} />}
  </>;
}

function TrainingGroupsModal({ learners, onClose, onChanged }: { learners: Learner[]; onClose: () => void; onChanged: (message: string) => void }) {
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [memberFilter, setMemberFilter] = useState("Tous les services");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const departments = Array.from(new Set(learners.map((learner) => learner.department))).filter(Boolean).sort((left, right) => left.localeCompare(right, "fr"));

  const loadGroups = useCallback(async () => {
    if (!usesNetlifyIdentity()) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/.netlify/functions/lms-data?scope=groups");
      const data = await response.json() as { groups?: Array<Record<string, unknown>>; members?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok) throw new Error(data.error || "Chargement des groupes impossible");
      const members = data.members ?? [];
      setGroups((data.groups ?? []).map((group) => ({
        id: String(group.id), name: String(group.name ?? "Groupe"), description: String(group.description ?? ""), department: String(group.department ?? ""),
        memberCount: Number(group.member_count ?? 0), assignedQuizzes: Number(group.assigned_quizzes ?? 0),
        memberIds: members.filter((member) => String(member.group_id) === String(group.id)).map((member) => String(member.id)),
      })));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chargement des groupes impossible"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void loadGroups(), 0); return () => window.clearTimeout(timer); }, [loadGroups]);

  const resetForm = () => { setEditingId(""); setName(""); setDescription(""); setDepartment(""); setMemberFilter("Tous les services"); setMemberIds([]); setError(""); };
  const editGroup = (group: TrainingGroup) => { setEditingId(group.id); setName(group.name); setDescription(group.description); setDepartment(group.department); setMemberFilter(group.department || "Tous les services"); setMemberIds(group.memberIds); setError(""); };
  const toggleMember = (learnerId: string) => setMemberIds((current) => current.includes(learnerId) ? current.filter((id) => id !== learnerId) : [...current, learnerId]);
  const visibleLearners = learners.filter((learner) => memberFilter === "Tous les services" || learner.department === memberFilter);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!memberIds.length) { setError("Sélectionnez au moins un apprenant."); return; }
    setSaving(true);
    try {
      if (usesNetlifyIdentity()) {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: editingId ? "update-training-group" : "create-training-group", groupId: editingId || undefined, name, description, department, memberIds }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Enregistrement du groupe impossible");
      }
      onChanged(`Le groupe « ${name} » a été ${editingId ? "mis à jour" : "créé"} avec ${memberIds.length} apprenant${memberIds.length > 1 ? "s" : ""}.`);
      resetForm(); await loadGroups();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement du groupe impossible"); }
    finally { setSaving(false); }
  };
  const removeGroup = async (group: TrainingGroup) => {
    if (!window.confirm(`Supprimer le groupe « ${group.name} » ? Les résultats déjà enregistrés seront conservés.`)) return;
    setError("");
    try {
      if (usesNetlifyIdentity()) {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-training-group", groupId: group.id }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Suppression impossible");
      }
      setGroups((current) => current.filter((item) => item.id !== group.id));
      if (editingId === group.id) resetForm();
      onChanged(`Le groupe « ${group.name} » a été supprimé.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible"); }
  };

  return <Modal title="Groupes de formation" onClose={onClose} wide><div className="training-group-workspace"><section className="training-group-list"><header><div><span className="eyebrow">Cohortes</span><h3>Groupes enregistrés</h3></div><button className="secondary-button compact-action" onClick={resetForm}><Plus size={15} /> Nouveau groupe</button></header>{loading ? <div className="studio-inline-empty"><Clock3 size={20} /><span>Chargement des groupes…</span></div> : groups.length ? groups.map((group) => <article key={group.id} className={editingId === group.id ? "active" : ""}><span className="group-emblem"><UsersRound size={19} /></span><span><strong>{group.name}</strong><small>{group.department || "Multi-services"} · {group.memberCount} membre{group.memberCount > 1 ? "s" : ""}</small><small>{group.assignedQuizzes} QCM affecté{group.assignedQuizzes > 1 ? "s" : ""}</small></span><button className="icon-button" aria-label={`Modifier ${group.name}`} onClick={() => editGroup(group)}><Edit3 size={16} /></button><button className="icon-button danger-icon" aria-label={`Supprimer ${group.name}`} onClick={() => void removeGroup(group)}><Trash2 size={16} /></button></article>) : <div className="studio-inline-empty"><UsersRound size={20} /><span>Aucun groupe de formation créé.</span></div>}</section><form className="training-group-editor modal-form" onSubmit={submit}><div><span className="eyebrow">{editingId ? "Modification" : "Nouveau groupe"}</span><h3>{editingId ? "Mettre à jour le groupe" : "Composer un groupe"}</h3><p>Un groupe peut réunir plusieurs personnes d’un même service ou de services différents.</p></div><label>Nom du groupe<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Cohorte Accueil — septembre" required /></label><label>Service de référence<select value={department} onChange={(event) => { setDepartment(event.target.value); setMemberFilter(event.target.value || "Tous les services"); }}><option value="">Multi-services</option>{departments.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>Description<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Objectif ou contexte du groupe…" /></label><div className="group-member-picker"><header><span><strong>Membres sélectionnés</strong><small>{memberIds.length} personne{memberIds.length > 1 ? "s" : ""}</small></span><select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}><option>Tous les services</option>{departments.map((item) => <option value={item} key={item}>{item}</option>)}</select></header><div>{visibleLearners.map((learner) => <label key={learner.id} className={memberIds.includes(learner.id) ? "selected" : ""}><input type="checkbox" checked={memberIds.includes(learner.id)} onChange={() => toggleMember(learner.id)} /><UserAvatar name={learner.name} initials={learner.initials} src={learner.avatarUrl} /><span><strong>{learner.name}</strong><small>{learner.department} · {learner.jobTitle}</small></span></label>)}{!visibleLearners.length && <div className="studio-inline-empty"><Inbox size={18} /><span>Aucun apprenant dans ce service.</span></div>}</div></div>{error && <p className="form-message" role="alert">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Fermer</button>{editingId && <button type="button" className="secondary-button" onClick={resetForm}>Annuler la modification</button>}<button type="submit" className="primary-button" disabled={saving}><Save size={16} /> {saving ? "Enregistrement…" : editingId ? "Mettre à jour" : "Créer le groupe"}</button></footer></form></div></Modal>;
}

function LearnerProfileView({ learner: initialLearner, onBack }: { learner: Learner; onBack: () => void }) {
  const [learner, setLearner] = useState(initialLearner);
  const [assignOpen, setAssignOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [timeline, setTimeline] = useState<Array<{ title: string; detail: string; occurredAt: string }>>([]);
  const [passportLastSync, setPassportLastSync] = useState("Jamais");
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch(`/.netlify/functions/lms-data?scope=learner&id=${encodeURIComponent(initialLearner.id)}`).then((response) => response.ok ? response.json() : Promise.reject()).then((data: { profile?: Record<string, unknown>; enrollments?: Array<Record<string, unknown>>; attempts?: Array<Record<string, unknown>>; certificates?: Array<Record<string, unknown>>; logins?: Array<Record<string, unknown>>; activity?: Array<Record<string, unknown>>; passport?: Record<string, unknown> | null }) => {
      const profile = data.profile;
      if (!profile) return;
      const certificateByCourse = new Map((data.certificates ?? []).map((item) => [String(item.course_id), item]));
      const scoreByCourse = new Map((data.attempts ?? []).filter((item) => Boolean(item.passed)).map((item) => [String(item.course_id ?? ""), Number(item.score ?? 0)]));
      const trainings: Learner["trainings"] = (data.enrollments ?? []).map((item) => {
        const rawStatus = String(item.status ?? "assigned");
        const status = rawStatus === "completed" ? "Terminée" : rawStatus === "overdue" ? "En retard" : rawStatus === "in_progress" ? "En cours" : "À commencer";
        const courseId = String(item.course_id);
        const certificate = certificateByCourse.get(courseId);
        return { courseId, code: String(item.code ?? "WA"), title: String(item.title ?? "Formation"), status, progress: Number(item.progress_percent ?? 0), completedModules: Number(item.completed_modules ?? 0), modules: Number(item.modules ?? 0), assignedAt: formatDate(item.assigned_at), dueDate: item.due_at ? formatDate(item.due_at) : undefined, completedAt: item.completed_at ? formatDate(item.completed_at) : undefined, score: certificate?.score !== undefined && certificate?.score !== null ? Number(certificate.score) : scoreByCourse.get(courseId), certificate: certificate?.certificate_number ? String(certificate.certificate_number) : undefined };
      });
      const completed = trainings.filter((item) => item.status === "Terminée").length;
      const progress = trainings.length ? Math.round(trainings.reduce((sum, item) => sum + item.progress, 0) / trainings.length) : 0;
      const rawStatus = String(profile.status ?? "active");
      const name = String(profile.full_name ?? initialLearner.name);
      setLearner({ ...initialLearner, name, initials: initialsFrom(name), matricule: String(profile.matricule ?? initialLearner.matricule), email: String(profile.email ?? initialLearner.email), phone: String(profile.phone ?? "À renseigner"), avatarUrl: Boolean(profile.has_avatar) ? avatarEndpoint(initialLearner.id) : undefined, department: String(profile.department ?? "Non renseigné"), jobTitle: String(profile.job_title ?? "Non renseigné"), manager: String(profile.manager_name ?? "À renseigner"), hireDate: profile.hire_date ? formatDate(profile.hire_date) : "À renseigner", location: String(profile.location ?? "Non renseigné"), status: rawStatus === "inactive" ? "Inactif" : rawStatus === "suspended" ? "À relancer" : "Actif", progress, completed, assigned: trainings.length, passportStatus: data.passport?.sync_status === "connected" ? "Synchronisé" : "À connecter", trainings });
      setPassportLastSync(data.passport?.last_synced_at ? formatDateTime(data.passport.last_synced_at) : "Jamais");
      const activityItems = (data.activity ?? []).map((item) => ({ title: String(item.summary ?? "Activité enregistrée"), detail: String(item.event_type ?? "Événement de formation"), occurredAt: String(item.occurred_at ?? "") }));
      const loginItems = (data.logins ?? []).map((item) => ({ title: String(item.event_type ?? "login") === "login" ? "Connexion réussie" : String(item.event_type), detail: "Accès à la plateforme", occurredAt: String(item.occurred_at ?? "") }));
      setTimeline([...activityItems, ...loginItems].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 20));
    }).catch(() => setNotice("La fiche n’a pas pu être chargée depuis la base Netlify."));
  }, [initialLearner]);
  const downloadRecord = () => {
    const rows = [["Matricule", learner.matricule], ["Nom", learner.name], ["Email", learner.email], ["Service", learner.department], [], ["Code", "Formation", "Statut", "Progression", "Score", "Certificat"], ...learner.trainings.map((item) => [item.code, item.title, item.status, `${item.progress}%`, item.score ? `${item.score}%` : "", item.certificate ?? ""])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `fiche-formation-${learner.matricule}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const requestPassportSync = async () => {
    if (!usesNetlifyIdentity()) { setNotice("La passerelle passeport est prête et sera activée avec les variables Netlify."); return; }
    try {
      const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request-passport-sync", userId: learner.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Synchronisation impossible");
      setNotice("La demande de synchronisation a été placée dans la file du passeport.");
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Synchronisation impossible"); }
    window.setTimeout(() => setNotice(""), 3500);
  };
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Retour aux apprenants</button>
    {notice && <div className="success-banner"><CheckCircle2 size={18} /> {notice}</div>}
    <section className="learner-profile-hero"><div className="profile-identity"><UserAvatar name={learner.name} initials={learner.initials} src={learner.avatarUrl} className="profile-avatar" /><div><div className="profile-title-row"><h1>{learner.name}</h1><span className={`status-tag status-${learner.status.toLowerCase().replace("à ", "").replace(" ", "-")}`}>{learner.status}</span></div><p>{learner.jobTitle} · {learner.department}</p><span>{learner.matricule} · {learner.email}</span></div></div><div className="heading-actions"><button className="secondary-button" onClick={downloadRecord}><Download size={17} /> Exporter la fiche</button><button className="primary-button" onClick={() => setAssignOpen(true)}><Plus size={17} /> Assigner une formation</button></div></section>
    <section className="learner-profile-metrics"><article><ProgressRing value={learner.progress} size={66} /><span><strong>Progression globale</strong><small>{learner.completed} formation{learner.completed > 1 ? "s" : ""} terminée{learner.completed > 1 ? "s" : ""} sur {learner.assigned}</small></span></article><article><Award size={25} /><span><strong>{learner.trainings.filter((item) => item.certificate).length} certificat{learner.trainings.filter((item) => item.certificate).length > 1 ? "s" : ""}</strong><small>Attestations disponibles</small></span></article><article><Clock3 size={25} /><span><strong>{learner.lastLogin} · {learner.lastLoginDetail}</strong><small>Dernière connexion</small></span></article><article><Link2 size={25} /><span><strong>{learner.passportStatus}</strong><small>Passeport de formation</small></span></article></section>
    <section className="learner-profile-grid"><article className="panel profile-details"><div className="panel-heading"><div><span className="eyebrow">Dossier collaborateur</span><h3>Informations générales</h3></div><Edit3 size={18} /></div><dl><div><dt>Matricule</dt><dd>{learner.matricule}</dd></div><div><dt>Fonction</dt><dd>{learner.jobTitle}</dd></div><div><dt>Service</dt><dd>{learner.department}</dd></div><div><dt>Responsable</dt><dd>{learner.manager}</dd></div><div><dt>Site</dt><dd>{learner.location}</dd></div><div><dt>Date d’entrée</dt><dd>{learner.hireDate}</dd></div><div><dt>Téléphone</dt><dd>{learner.phone}</dd></div><div><dt>E-mail</dt><dd>{learner.email}</dd></div></dl></article><article className="panel passport-panel"><div className="panel-heading"><div><span className="eyebrow">Interopérabilité</span><h3>Passeport de formation</h3></div><span className={`status-tag ${learner.passportStatus === "Synchronisé" ? "status-actif" : "status-relancer"}`}>{learner.passportStatus}</span></div><p>Le LMS prépare les événements d’assignation, de progression, de réussite et de certificat. La correspondance utilise d’abord le matricule, puis l’e-mail.</p><div className="passport-keys"><span><small>Clé principale</small><strong>{learner.matricule}</strong></span><span><small>Dernière synchronisation</small><strong>{passportLastSync}</strong></span></div><button className="secondary-button" onClick={requestPassportSync}><Link2 size={16} /> {learner.passportStatus === "Synchronisé" ? "Synchroniser maintenant" : "Connecter le passeport"}</button></article></section>
    <section className="panel training-history"><div className="panel-heading"><div><span className="eyebrow">Traçabilité individuelle</span><h3>Éléments de formation réalisés et assignés</h3></div><span className="count-badge">{learner.trainings.length} parcours</span></div>{learner.trainings.length ? <div className="training-records">{learner.trainings.map((item) => <article key={`${learner.id}-${item.code}`}><div className="record-main"><span className="course-code">{item.code}</span><div><h4>{item.title}</h4><p>Assignée le {item.assignedAt}{item.dueDate ? ` · échéance ${item.dueDate}` : ""}</p></div></div><div className="record-progress"><div><span style={{ width: `${item.progress}%` }} /></div><strong>{item.progress} %</strong><small>{item.completedModules}/{item.modules} modules</small></div><div className="record-result"><span className={`status-tag ${item.status === "Terminée" ? "status-actif" : item.status === "En retard" ? "status-relancer" : "status-active"}`}>{item.status}</span>{item.score !== undefined && <strong>QCM {item.score} %</strong>}{item.certificate && <span className="text-button strong"><Award size={15} /> {item.certificate}</span>}</div></article>)}</div> : <div className="table-empty"><Inbox size={22} /><strong>Aucune formation assignée</strong><span>Utilisez le bouton « Assigner une formation » pour construire progressivement ce parcours.</span></div>}</section>
    <section className="panel learner-timeline"><div className="panel-heading"><div><span className="eyebrow">Activité récente</span><h3>Connexions et événements</h3></div></div>{timeline.length ? <ol>{timeline.map((item, index) => <li key={`${item.occurredAt}-${index}`}><span className={`activity-dot ${index % 3 === 0 ? "teal" : index % 3 === 1 ? "violet" : "blue"}`} /><div><strong>{item.title}</strong><p>{item.detail} · {formatDateTime(item.occurredAt)}</p></div></li>)}</ol> : <div className="table-empty"><Clock3 size={22} /><strong>Aucun événement enregistré</strong><span>Les connexions, affectations et résultats apparaîtront ici.</span></div>}</section>
    {assignOpen && <AssignTrainingModal learner={learner} onClose={() => setAssignOpen(false)} onAssigned={(course) => { setAssignOpen(false); setNotice(`${course.title} a été assignée à ${learner.name}.`); window.setTimeout(() => setNotice(""), 3500); }} />}
  </>;
}

function AssignTrainingModal({ learner, onClose, onAssigned }: { learner: Learner; onClose: () => void; onAssigned: (course: Course) => void }) {
  const [courseId, setCourseId] = useState(courses[0].id);
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const course = courses.find((item) => item.id === courseId) ?? courses[0];
    if (!usesNetlifyIdentity()) { onAssigned(course); return; }
    setLoading(true);
    try {
      const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign-course", userId: learner.id, courseId, dueAt: dueAt || null, note }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Assignation impossible");
      onAssigned(course);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Assignation impossible"); }
    finally { setLoading(false); }
  };
  return <Modal title={`Assigner une formation à ${learner.name}`} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Parcours publié<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.title}</option>)}</select></label><label>Date limite<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><label>Consigne pour l’apprenant<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Objectif, contexte ou priorité…" /></label>{error && <p className="form-message" role="alert">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={loading}><Send size={16} /> {loading ? "Assignation…" : "Assigner le parcours"}</button></footer></form></Modal>;
}

function PeopleImportModal({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [source, setSource] = useState<"excel" | "google_sheets">("excel");
  const [preview, setPreview] = useState<PeopleImportResult | null>(null);
  const [sourceReference, setSourceReference] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resetPreview = (nextSource: "excel" | "google_sheets") => {
    setSource(nextSource); setPreview(null); setSourceReference(""); setError("");
  };

  const selectExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError(""); setSourceReference(file.name);
    const result = await importPeopleExcelFile(file);
    setPreview(result); setBusy(false);
  };

  const pickPrivateSheet = async () => {
    setBusy(true); setError(""); setPreview(null);
    try {
      const file = await pickGoogleDriveFile();
      if (file.mimeType !== "application/vnd.google-apps.spreadsheet") throw new Error("Sélectionnez une feuille Google Sheets, pas un document ou un fichier Excel.");
      if (!file.accessToken) throw new Error("L’autorisation Google Drive n’a pas été transmise.");
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fcsv`, {
        headers: { Authorization: `Bearer ${file.accessToken}`, Accept: "text/csv" },
      });
      if (!response.ok) throw new Error("Google Drive n’a pas pu exporter cette feuille. Vérifiez vos droits de lecture.");
      if (Number(response.headers.get("content-length") ?? 0) > 3_000_000) throw new Error("Cette feuille dépasse la taille maximale autorisée (3 Mo).");
      const csv = await response.text();
      if (new TextEncoder().encode(csv).byteLength > 3_000_000) throw new Error("Cette feuille dépasse la taille maximale autorisée (3 Mo).");
      setPreview(parsePeopleTable(parseCsvTable(csv)));
      setSourceReference(file.url || file.name);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sélection Google Sheets impossible"); }
    finally { setBusy(false); }
  };

  const previewSheet = async () => {
    setError(""); setPreview(null);
    if (!sheetUrl.trim()) { setError("Collez d’abord l’adresse de votre feuille Google Sheets."); return; }
    if (!usesNetlifyIdentity()) { setError("La lecture sécurisée de Google Sheets sera disponible sur votre domaine Netlify."); return; }
    setBusy(true);
    try {
      const response = await fetch("/.netlify/functions/user-admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview-google-sheet", url: sheetUrl.trim() }),
      });
      const data = await response.json() as PeopleImportResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "Lecture de la feuille impossible");
      setPreview({ rows: data.rows ?? [], errors: data.errors ?? [], warnings: data.warnings ?? [] });
      setSourceReference(sheetUrl.trim());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Lecture de la feuille impossible"); }
    finally { setBusy(false); }
  };

  const confirmImport = async () => {
    if (!preview?.rows.length || preview.errors.length) return;
    if (!usesNetlifyIdentity()) { setError("L’import en base sera disponible sur votre domaine Netlify."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/.netlify/functions/user-admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-import-people", source, sourceReference, rows: preview.rows }),
      });
      const data = await response.json() as { error?: string; imported?: number; created?: number; updated?: number; errors?: Array<{ rowNumber: number; message: string }> };
      if (!response.ok) {
        if (data.errors?.length) setPreview((current) => current ? { ...current, errors: data.errors ?? [] } : current);
        throw new Error(data.error || "Import impossible");
      }
      const imported = data.imported ?? preview.rows.length;
      onImported(`${imported} fiche${imported > 1 ? "s" : ""} ajoutée${imported > 1 ? "s" : ""} à l’annuaire RH · ${data.created ?? 0} nouvelle${(data.created ?? 0) > 1 ? "s" : ""}, ${data.updated ?? 0} mise${(data.updated ?? 0) > 1 ? "s" : ""} à jour. Aucun compte ni formation n’a été créé automatiquement.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Import impossible"); }
    finally { setBusy(false); }
  };

  const renderPreviewRow = (row: PersonImportRow) => <tr key={`${row.matricule}-${row.rowNumber}`}><td><strong>{row.matricule}</strong></td><td>{row.lastName}</td><td>{row.firstName}</td><td>{formatDate(row.birthDate)}</td><td>{formatDate(row.hireDate)}</td><td>{row.jobTitle}</td><td>{row.department || "Non renseigné"}</td></tr>;
  const canImport = Boolean(preview?.rows.length) && !preview?.errors.length && !busy;

  return <Modal title="Importer une liste de collaborateurs" onClose={onClose} wide><div className="people-import-workspace">
    <nav className="invite-source-tabs" aria-label="Source de la liste"><button className={source === "excel" ? "active" : ""} onClick={() => resetPreview("excel")}><FileUp size={16} /> Fichier Excel</button><button className={source === "google_sheets" ? "active" : ""} onClick={() => resetPreview("google_sheets")}><Table2 size={16} /> Google Sheets</button></nav>
    <section className="people-import-body"><div className="people-import-intro"><div><span className="eyebrow">Annuaire RH</span><h3>Contrôlez la liste avant de l’enregistrer</h3><p>Chaque matricule est unique. Si une personne existe déjà, sa fiche est mise à jour au lieu d’être dupliquée.</p></div><a className="secondary-button" href="/modeles/import-personnes-walyah.xlsx" download><Download size={16} /> Modèle Excel</a></div>
      <div className="import-column-guide"><strong>Colonnes attendues</strong><div>{PEOPLE_IMPORT_COLUMNS.map((column) => <span className={column.required ? "required" : "optional"} key={column.label}>{column.label}<small>{column.required ? "requis" : "facultatif"}</small></span>)}</div></div>
      {source === "excel" ? <label className={`people-import-dropzone ${busy ? "busy" : ""}`}><UploadCloud size={28} /><span><strong>{busy ? "Analyse du classeur…" : sourceReference || "Déposez ou sélectionnez votre fichier XLSX"}</strong><small>Première feuille · 500 personnes maximum · dates JJ/MM/AAAA ou AAAA-MM-JJ</small></span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void selectExcel(event)} disabled={busy} /></label> : <div className="google-sheet-import"><div className="google-sheet-picker"><div className="neutral-note"><Table2 size={18} /><span><strong>Feuille privée dans votre Drive</strong><small>Le sélecteur Google ouvre votre Drive et lit uniquement la feuille choisie. Le jeton d’accès reste dans votre navigateur.</small></span></div><button type="button" className="secondary-button" onClick={() => void pickPrivateSheet()} disabled={busy || !googleDriveConfigured()}><Table2 size={16} /> {googleDriveConfigured() ? "Choisir dans Google Drive" : "Google Drive non configuré"}</button></div><label>Ou coller le lien d’une feuille partagée<div><input type="url" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0" /><button type="button" className="primary-button" onClick={() => void previewSheet()} disabled={busy}>{busy ? "Lecture…" : "Analyser le lien"}</button></div><small>Pour un lien : Partager → Toute personne disposant du lien → Lecteur.</small></label></div>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {preview && <section className="people-import-preview"><header><span><strong>{preview.rows.length}</strong><small>lignes valides</small></span><span className={preview.errors.length ? "metric-error" : "metric-ok"}><strong>{preview.errors.length}</strong><small>erreurs</small></span><span className={preview.warnings.length ? "metric-warning" : "metric-ok"}><strong>{preview.warnings.length}</strong><small>avertissements</small></span></header>{preview.errors.length ? <div className="import-issue-list error-list"><strong>À corriger avant l’import</strong>{preview.errors.slice(0, 8).map((issue, index) => <span key={`${issue.rowNumber}-${index}`}><X size={14} /> {issue.rowNumber ? `Ligne ${issue.rowNumber} : ` : ""}{issue.message}</span>)}{preview.errors.length > 8 && <small>+ {preview.errors.length - 8} autres erreurs</small>}</div> : null}{preview.warnings.length ? <div className="import-issue-list warning-list"><strong>Informations à vérifier</strong>{preview.warnings.slice(0, 5).map((issue, index) => <span key={`${issue.rowNumber}-${index}`}><CircleHelp size={14} /> Ligne {issue.rowNumber} : {issue.message}</span>)}</div> : null}{preview.rows.length ? <div className="data-table-wrap import-preview-table"><table className="data-table"><thead><tr><th>Matricule</th><th>Nom</th><th>Prénom</th><th>Naissance</th><th>Entrée</th><th>Poste</th><th>Service</th></tr></thead><tbody>{preview.rows.slice(0, 8).map(renderPreviewRow)}</tbody></table>{preview.rows.length > 8 && <p>Prévisualisation des 8 premières lignes · {preview.rows.length - 8} autres personnes prêtes.</p>}</div> : null}</section>}
      <footer className="people-import-actions"><span><ShieldCheck size={16} /> L’import crée des fiches RH en attente, jamais des comptes ou des affectations automatiques.</span><div><button className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" onClick={() => void confirmImport()} disabled={!canImport}><UploadCloud size={16} /> {busy ? "Enregistrement…" : `Importer ${preview?.rows.length || ""} personne${(preview?.rows.length ?? 0) > 1 ? "s" : ""}`}</button></div></footer>
    </section>
  </div></Modal>;
}

type PassportEmployee = {
  id: string;
  matricule: string;
  email: string;
  fullName: string;
  department: string;
  jobTitle: string;
  employmentStatus: string;
  provisioningStatus: string;
  lastSyncedAt: string;
  lastError: string;
};

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: (email: string) => void }) {
  const [mode, setMode] = useState<"passport" | "manual">("passport");
  const [directory, setDirectory] = useState<PassportEmployee[]>([]);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(() => usesNetlifyIdentity());
  const [creatingId, setCreatingId] = useState("");
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("Accueil");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDirectory = useCallback(async () => {
    await Promise.resolve();
    setError("");
    if (!usesNetlifyIdentity()) { setDirectoryLoading(false); setError("L’annuaire synchronisé sera disponible sur votre domaine Netlify."); return; }
    setDirectoryLoading(true);
    try {
      const response = await fetch("/.netlify/functions/user-admin?scope=passport-directory");
      const data = await response.json() as { employees?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok) throw new Error(data.error || "Chargement de l’annuaire impossible");
      setDirectory((data.employees ?? []).map((item) => ({
        id: String(item.id), matricule: String(item.matricule ?? "À renseigner"), email: String(item.email ?? ""),
        fullName: String(item.full_name ?? "Collaborateur"), department: String(item.department ?? "Non renseigné"),
        jobTitle: String(item.job_title ?? "Fonction non renseignée"), employmentStatus: String(item.employment_status ?? "active"),
        provisioningStatus: String(item.provisioning_status ?? "pending"), lastSyncedAt: String(item.last_synced_at ?? ""),
        lastError: String(item.last_error ?? ""),
      })));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chargement de l’annuaire impossible"); }
    finally { setDirectoryLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDirectory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDirectory]);

  const createFromPassport = async (employee: PassportEmployee) => {
    setError(""); setCreatingId(employee.id);
    try {
      const accessEmail = employee.email || emailDrafts[employee.id] || "";
      if (!accessEmail) throw new Error("Renseignez l’adresse e-mail professionnelle de cette personne.");
      const response = await fetch("/.netlify/functions/user-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite-passport-employee", directoryId: employee.id, email: accessEmail }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Création de l’accès impossible");
      onInvited(accessEmail);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Création de l’accès impossible"); setCreatingId(""); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!usesNetlifyIdentity()) { setError("L’envoi sécurisé des invitations sera actif sur votre domaine Netlify."); return; }
    setLoading(true);
    try {
      const response = await fetch("/.netlify/functions/user-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite-learner", email, fullName: name, department }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Invitation impossible");
      onInvited(email);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Invitation impossible"); }
    finally { setLoading(false); }
  };
  const filteredDirectory = directory.filter((employee) => `${employee.fullName} ${employee.matricule} ${employee.email} ${employee.department} ${employee.jobTitle}`.toLowerCase().includes(directoryQuery.toLowerCase()));
  const statusLabel = (status: string) => status === "pending" ? "À créer" : status === "invited" ? "Invitation envoyée" : status === "active" ? "Accès actif" : status === "blocked" ? "Inactif RH" : "À vérifier";
  return <Modal title="Créer un accès apprenant" onClose={onClose} wide><div className="invite-workspace">
    <nav className="invite-source-tabs" aria-label="Source du collaborateur"><button className={mode === "passport" ? "active" : ""} onClick={() => { setMode("passport"); setError(""); }}><Link2 size={16} /> Depuis le Passeport</button><button className={mode === "manual" ? "active" : ""} onClick={() => { setMode("manual"); setError(""); }}><Edit3 size={16} /> Saisie exceptionnelle</button></nav>
    {mode === "passport" ? <section className="passport-directory"><div className="directory-heading"><div><span className="eyebrow">Annuaire RH synchronisé</span><h3>Sélectionnez un nouveau collaborateur</h3><p>Les informations viennent du Passeport, d’un fichier Excel ou de Google Sheets. La création envoie seulement son accès LMS ; aucune formation n’est affectée automatiquement.</p></div><button className="secondary-button" onClick={() => void loadDirectory()} disabled={directoryLoading}><TrendingUp size={16} /> Actualiser</button></div><label className="directory-search"><Search size={17} /><input value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} placeholder="Nom, matricule, e-mail, service ou fonction…" /></label>{error && <p className="form-message" role="alert">{error}</p>}{directoryLoading ? <div className="directory-empty"><Clock3 size={23} /><strong>Synchronisation de l’annuaire…</strong></div> : filteredDirectory.length ? <div className="passport-employee-list">{filteredDirectory.map((employee) => {
      const canCreate = employee.employmentStatus === "active" && ["pending", "error"].includes(employee.provisioningStatus);
      const accessEmail = employee.email || emailDrafts[employee.id] || "";
      return <article key={employee.id} className={canCreate ? "candidate-ready" : ""}><UserAvatar name={employee.fullName} initials={initialsFrom(employee.fullName)} /><span className="employee-main"><strong>{employee.fullName}</strong><small>{employee.jobTitle} · {employee.department}</small><small>{employee.matricule}{employee.email ? ` · ${employee.email}` : " · e-mail à renseigner"}</small></span><span className={`status-tag ${employee.provisioningStatus === "active" ? "status-actif" : employee.provisioningStatus === "pending" ? "status-draft" : "status-relancer"}`}>{statusLabel(employee.provisioningStatus)}</span>{canCreate && employee.email ? <button className="primary-button compact-action" onClick={() => void createFromPassport(employee)} disabled={Boolean(creatingId)}><UserPlus size={15} /> {creatingId === employee.id ? "Création…" : "Créer l’accès"}</button> : canCreate ? <span className="employee-email-provision"><input type="email" value={accessEmail} onChange={(event) => setEmailDrafts((current) => ({ ...current, [employee.id]: event.target.value }))} placeholder="e-mail professionnel" aria-label={`E-mail de ${employee.fullName}`} /><button className="primary-button compact-action" onClick={() => void createFromPassport(employee)} disabled={Boolean(creatingId) || !accessEmail}><UserPlus size={15} /> {creatingId === employee.id ? "Création…" : "Créer l’accès"}</button></span> : <button className="secondary-button compact-action" disabled>{statusLabel(employee.provisioningStatus)}</button>}{employee.lastError && <small className="employee-error">{employee.lastError}</small>}</article>;
    })}</div> : <div className="directory-empty"><UsersRound size={24} /><strong>Aucun collaborateur trouvé</strong><span>Importez une liste ou synchronisez le Passeport pour alimenter l’annuaire RH.</span></div>}<footer className="directory-footer"><span><ShieldCheck size={16} /> Rapprochement prioritaire par matricule, puis par e-mail.</span><button className="secondary-button" onClick={onClose}>Fermer</button></footer></section> : <form className="modal-form manual-invite-form" onSubmit={submit}><div className="neutral-note"><CircleHelp size={17} /><span><strong>Création exceptionnelle</strong><small>À utiliser uniquement si la personne n’existe pas encore dans l’annuaire RH.</small></span></div><label>Nom complet<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom et prénom" required /></label><label>Adresse e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="prenom.nom@entreprise.com" required /></label><label>Service<select value={department} onChange={(event) => setDepartment(event.target.value)}><option>Accueil</option><option>Laboratoire</option><option>Imagerie</option><option>Optique</option><option>Administration</option><option>Maintenance</option></select></label><div className="neutral-note"><ShieldCheck size={17} /><span><strong>Compte créé sans formation</strong><small>Les parcours seront affectés progressivement depuis sa fiche.</small></span></div>{error && <p className="form-message" role="alert">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={loading}><Send size={16} /> {loading ? "Envoi…" : "Créer et envoyer l’accès"}</button></footer></form>}
  </div></Modal>;
}

function TrainingsView({ focusCourseId, onFocusHandled, onView }: { focusCourseId?: string; onFocusHandled?: () => void; onView: (view: View) => void }) {
  const [items, setItems] = useState<Course[]>(courses);
  const [stats, setStats] = useState<Record<string, { enrolled: number; completion: number }>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [manageCourse, setManageCourse] = useState<Course | null>(null);
  const [actionCourseId, setActionCourseId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const createCourse = (course: Course) => { setItems([course, ...items]); setCreateOpen(false); };
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { courseStats?: Array<Record<string, unknown>> }) => {
      const rows = data.courseStats ?? [];
      if (rows.length) setItems(rows.map(courseFromRow));
      setStats(Object.fromEntries(rows.map((row) => [String(row.id), { enrolled: Number(row.enrolled ?? 0), completion: Number(row.completion_rate ?? 0) }])));
    }).catch(() => setLoadError("La bibliothèque distante n’a pas pu être chargée."));
  }, []);
  useEffect(() => {
    if (!focusCourseId) return;
    const selectedCourse = items.find((course) => course.id === focusCourseId);
    if (!selectedCourse) return;
    const timer = window.setTimeout(() => { setManageCourse(selectedCourse); onFocusHandled?.(); }, 0);
    return () => window.clearTimeout(timer);
  }, [focusCourseId, items, onFocusHandled]);
  const groupedItems = Array.from(new Set(items.map((course) => course.category))).sort().map((categoryName) => ({ categoryName, courses: items.filter((course) => course.category === categoryName) }));
  const archiveCourse = async (course: Course) => {
    setActionCourseId(""); setNotice("");
    if (usesNetlifyIdentity()) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive-course", courseId: course.id }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Archivage impossible");
      } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Archivage impossible"); return; }
    }
    setItems((current) => current.filter((item) => item.id !== course.id));
    setNotice(`${course.title} a été archivée.`);
  };
  return <>
    <section className="page-heading"><div><span className="eyebrow">Bibliothèque pédagogique</span><h1>Formations</h1><p>Créez vos parcours, ajoutez vidéos et documents, puis assignez-les aux équipes.</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Créer une formation</button></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    {notice && <div className="success-banner" role="status"><CheckCircle2 size={18} /> {notice}</div>}
    <div className="admin-course-categories">{groupedItems.map((group) => <section className="admin-course-category" key={group.categoryName}><header><div><span className="category-emblem"><LibraryBig size={18} /></span><span><small>Catégorie</small><h2>{group.categoryName}</h2></span></div><strong>{group.courses.length} parcours</strong></header><div className="admin-course-list">{group.courses.map((course) => { const courseStats = stats[course.id] ?? { enrolled: 0, completion: 0 }; return <article className="admin-course-row clickable-course-row" key={course.id} role="button" tabIndex={0} onClick={() => setManageCourse(course)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setManageCourse(course); } }}><CourseVisual course={course} compact /><div className="admin-course-copy"><div><span className="eyebrow">{course.category}</span>{course.mandatory && <span className="status-tag status-required">Obligatoire</span>}</div><h2>{course.title}</h2><p>{course.description}</p><div className="admin-course-meta"><span><BookOpen size={14} /> {course.modules} modules</span><span><Clock3 size={14} /> {course.duration}</span><span><UsersRound size={14} /> {courseStats.enrolled} inscrit{courseStats.enrolled > 1 ? "s" : ""}</span></div></div><div className="admin-course-stats"><span>Taux de complétion</span><strong>{courseStats.completion} %</strong><div className="linear-progress"><span style={{ width: `${courseStats.completion}%` }} /></div><div><button className="secondary-button" onClick={(event) => { event.stopPropagation(); setManageCourse(course); }}><Edit3 size={16} /> Gérer le contenu</button><span className="course-menu-anchor"><button className="icon-button" aria-label={`Actions pour ${course.title}`} onClick={(event) => { event.stopPropagation(); setActionCourseId(actionCourseId === course.id ? "" : course.id); }}><MoreHorizontal size={18} /></button>{actionCourseId === course.id && <span className="course-action-menu" onClick={(event) => event.stopPropagation()}><button onClick={() => { setManageCourse(course); setActionCourseId(""); }}><Eye size={15} /> Ouvrir le contenu</button><button onClick={() => { setActionCourseId(""); onView("users"); }}><UsersRound size={15} /> Voir les apprenants</button><button className="danger" onClick={() => void archiveCourse(course)}><Archive size={15} /> Archiver</button></span>}</span></div></div></article>; })}</div></section>)}</div>
    {createOpen && <CreateCourseModal onClose={() => setCreateOpen(false)} onCreate={createCourse} />}
    {manageCourse && <ManageContentModal course={manageCourse} onClose={() => setManageCourse(null)} />}
  </>;
}

function CreateCourseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (course: Course) => void }) {
  const [title, setTitle] = useState(""); const [category, setCategory] = useState("Hygiène"); const [description, setDescription] = useState(""); const [duration, setDuration] = useState("1 h 00"); const [mandatory, setMandatory] = useState(false);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    let id = `course-${Date.now()}`;
    let code = `WA-${Date.now().toString().slice(-6)}`;
    if (usesNetlifyIdentity()) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-course", title, category, description, durationMinutes: Number.parseInt(duration, 10) * 60 || 60, mandatory }) });
        const data = await response.json() as { id?: string; code?: string; error?: string };
        if (!response.ok) throw new Error(data.error || "Création impossible");
        if (data.id) id = data.id; if (data.code) code = data.code;
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Création impossible"); setLoading(false); return; }
    }
    onCreate({ id, code, title, category, description, objective: description, audience: "À définir", source: "Création interne Walyah Académie", duration, modules: 1, completedModules: 0, progress: 0, status: "À commencer", mandatory, accent: "coral", nextLesson: "Introduction et objectifs", moduleContent: [moduleDraft(title)] });
    setLoading(false);
  };
  return <Modal title="Créer une formation" onClose={onClose} wide><form className="modal-form form-grid" onSubmit={submit}><label className="full-field">Titre de la formation<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Gestion des situations difficiles" required /></label><label>Catégorie<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Hygiène</option><option>Soft skills</option><option>Management</option><option>Sécurité</option><option>Conformité</option></select></label><label>Durée estimée<input value={duration} onChange={(event) => setDuration(event.target.value)} required /></label><label className="full-field">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Objectifs et bénéfices du parcours…" rows={4} required /></label><label className="check-field full-field"><input type="checkbox" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} /><span><strong>Formation obligatoire</strong><small>Une échéance et des relances pourront être configurées.</small></span></label>{error && <p className="form-message full-field" role="alert">{error}</p>}<footer className="full-field"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={loading}><Save size={16} /> {loading ? "Création…" : "Créer et ajouter le contenu"}</button></footer></form></Modal>;
}

type StudioResource = { id?: string; name: string; type: string; contentKind: string; url?: string; sizeBytes?: number; metadata?: Record<string, unknown> };
type StudioModule = { id: string; title: string; description: string; contentType: string; durationMinutes: number; objectives: string[]; published: boolean; resources: StudioResource[]; layout: LessonContent["layout"]; blocks: LessonBlock[] };

function studioStarterBlocks(title: string, description = "", objectives: string[] = []): LessonBlock[] {
  return [
    { id: crypto.randomUUID(), type: "hero", title, body: description || "Présentez ici la promesse et l’utilité concrète du module." },
    { id: crypto.randomUUID(), type: "objectives", title: "Objectifs pédagogiques", items: objectives.length ? objectives : ["Comprendre le sujet", "Appliquer la méthode", "Vérifier les acquis"] },
    { id: crypto.randomUUID(), type: "text", title: "L’essentiel", body: "Développez le contenu avec des exemples courts, des repères visuels et des consignes directement applicables." },
    { id: crypto.randomUUID(), type: "summary", title: "À retenir", items: ["Un message clé", "Une action à tester", "Un point de vigilance"] },
  ];
}

function studioBlockLabel(type: LessonBlockType) {
  return ({ hero: "Ouverture", text: "Texte", objectives: "Objectifs", steps: "Étapes", callout: "Encadré", case_study: "Cas pratique", knowledge_check: "Question flash", summary: "Synthèse" } satisfies Record<LessonBlockType, string>)[type];
}

function newStudioBlock(type: LessonBlockType): LessonBlock {
  const templates: Record<LessonBlockType, Omit<LessonBlock, "id" | "type">> = {
    hero: { title: "Nouvelle ouverture", body: "Introduisez le sujet en une phrase engageante." },
    text: { title: "Nouvelle section", body: "Rédigez ici un contenu clair et directement exploitable." },
    objectives: { title: "Objectifs pédagogiques", items: ["Objectif 1", "Objectif 2"] },
    steps: { title: "Méthode pas à pas", items: ["Étape 1", "Étape 2", "Étape 3"] },
    callout: { title: "Point de vigilance", body: "Mettez en évidence une règle, un risque ou un conseil.", tone: "warning" },
    case_study: { title: "Cas pratique", body: "Décrivez une situation professionnelle réaliste.", prompt: "Que feriez-vous dans cette situation ?" },
    knowledge_check: { title: "Vérification rapide", prompt: "Quelle réponse est correcte ?", options: ["Réponse A", "Réponse B"], correctAnswer: 0, explanation: "Expliquez ici pourquoi cette réponse est correcte." },
    summary: { title: "À retenir", items: ["Idée clé 1", "Idée clé 2", "Action à réaliser"] },
  };
  return { id: crypto.randomUUID(), type, ...templates[type] };
}

function durationMinutesFromLabel(value: string) {
  const day = value.match(/(\d+(?:[.,]\d+)?)\s*j/i);
  if (day) return Math.round(Number(day[1].replace(",", ".")) * 420);
  const hours = value.match(/(\d+(?:[.,]\d+)?)\s*h/i);
  const minutes = value.match(/(\d+)\s*min/i);
  if (hours || minutes) return Math.round(Number(hours?.[1].replace(",", ".") ?? 0) * 60 + Number(minutes?.[1] ?? 0));
  return 60;
}

function studioResourceIcon(kind: string) {
  if (kind === "video") return <FileVideo size={18} />;
  if (kind === "audio") return <FileAudio size={18} />;
  if (kind === "scorm") return <Archive size={18} />;
  if (kind === "presentation") return <Table2 size={18} />;
  if (kind === "external") return <Link2 size={18} />;
  if (kind === "drive") return <LibraryBig size={18} />;
  return <FileText size={18} />;
}

function ManageContentModal({ course, onClose, catalogSeed, onPublished }: { course: Course; onClose: () => void; catalogSeed?: CatalogCourse; onPublished?: () => void }) {
  const initialModules: StudioModule[] = course.moduleContent.length ? course.moduleContent.map((module, index): StudioModule => ({
    id: module.id ?? `${course.id}-module-${index + 1}`,
    title: module.title,
    description: module.summary,
    contentType: module.type === "lesson" || module.type === "case" ? "text" : module.type,
    durationMinutes: durationMinutesFromLabel(module.duration),
    objectives: module.points,
    published: true,
    resources: (module.resources ?? []).map((resource) => ({ id: resource.id, name: resource.name, type: resource.type, contentKind: resource.contentKind ?? (resource.type === "link" ? "external" : "document"), url: resource.url, sizeBytes: resource.sizeBytes, metadata: resource.metadata })),
    layout: module.lessonContent?.layout ?? "signature",
    blocks: module.lessonContent?.blocks ?? studioStarterBlocks(module.title, module.summary, module.points),
  })) : [{ id: `${course.id}-module-1`, title: "Introduction et objectifs", description: course.description, contentType: "text", durationMinutes: 15, objectives: [], published: true, resources: [], layout: "signature", blocks: studioStarterBlocks("Introduction et objectifs", course.description) }];
  const [tab, setTab] = useState<"structure" | "content" | "design" | "evaluation" | "publication">("structure");
  const [details, setDetails] = useState({ title: course.title, category: course.category, description: course.description, objective: course.objective, audience: course.audience, durationMinutes: durationMinutesFromLabel(course.duration), mandatory: Boolean(course.mandatory) });
  const [modules, setModules] = useState<StudioModule[]>(initialModules);
  const [activeModuleId, setActiveModuleId] = useState(initialModules[0].id);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkKind, setLinkKind] = useState("video");
  const [driveUrl, setDriveUrl] = useState("");
  const [driveName, setDriveName] = useState("");
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingAi, setImportingAi] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [published, setPublished] = useState(false);
  const [quizzes, setQuizzes] = useState<Array<{ id: string; title: string; questionCount: number; published: boolean }>>([]);
  const [quizOpen, setQuizOpen] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState("");
  const [quizToAssign, setQuizToAssign] = useState<QuizAdminRecord | null>(null);
  const activeModule = modules.find((module) => module.id === activeModuleId) ?? modules[0];

  const postAction = async (action: string, payload: Record<string, unknown>) => {
    const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.error ?? "Enregistrement impossible"));
    return data;
  };

  const toggleQuizPublication = async (quiz: { id: string; title: string; published: boolean }) => {
    setSaving(true); setFeedback("");
    try {
      const nextPublished = !quiz.published;
      if (usesNetlifyIdentity()) await postAction("set-quiz-published", { quizId: quiz.id, published: nextPublished });
      setQuizzes((current) => current.map((item) => item.id === quiz.id ? { ...item, published: nextPublished } : nextPublished ? { ...item, published: false } : item));
      setFeedback(nextPublished ? `QCM « ${quiz.title} » publié et disponible dans le parcours.` : `QCM « ${quiz.title} » retiré de l’espace apprenant.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Mise à jour du QCM impossible"); }
    finally { setSaving(false); }
  };

  const removeQuiz = async (quiz: { id: string; title: string }) => {
    if (!window.confirm(`Supprimer le QCM « ${quiz.title} » ? Les résultats existants resteront archivés.`)) return;
    setSaving(true); setFeedback("");
    try {
      if (usesNetlifyIdentity()) await postAction("delete-quiz", { quizId: quiz.id });
      setQuizzes((current) => current.filter((item) => item.id !== quiz.id));
      setFeedback(`QCM « ${quiz.title} » supprimé de la liste active.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Suppression du QCM impossible"); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    let cancelled = false;
    const hydrate = async () => {
      try {
        if (catalogSeed) await postAction("prepare-catalog-course", { courseId: course.id, category: trainingThemeFor(catalogSeed).label });
        const response = await fetch(`/.netlify/functions/lms-data?scope=course-studio&courseId=${encodeURIComponent(course.id)}`);
        const data = await response.json() as { error?: string; course?: Record<string, unknown>; modules?: Array<Record<string, unknown>>; quizzes?: Array<Record<string, unknown>> };
        if (!response.ok) throw new Error(data.error || "Chargement du studio impossible");
        if (cancelled) return;
        const row = data.course ?? {};
        setDetails({ title: String(row.title ?? course.title), category: String(row.category ?? course.category), description: String(row.description ?? course.description), objective: String(row.objective ?? course.objective), audience: String(row.audience ?? course.audience), durationMinutes: Number(row.duration_minutes ?? durationMinutesFromLabel(course.duration)), mandatory: Boolean(row.mandatory ?? course.mandatory) });
        setPublished(Boolean(row.published));
        const loadedModules = (data.modules ?? []).map((module): StudioModule => ({
          id: String(module.id), title: String(module.title ?? "Module"), description: String(module.description ?? ""), contentType: String(module.content_type ?? "text"), durationMinutes: Number(module.duration_minutes ?? 0),
          objectives: Array.isArray(module.learning_objectives) ? module.learning_objectives.map(String) : [], published: Boolean(module.published),
          resources: Array.isArray(module.resources) ? (module.resources as Array<Record<string, unknown>>).map((resource) => ({ id: String(resource.id), name: String(resource.name ?? "Ressource"), type: String(resource.resource_type ?? "file"), contentKind: String(resource.content_kind ?? "document"), url: resource.external_url ? String(resource.external_url) : undefined, sizeBytes: Number(resource.size_bytes ?? 0), metadata: resource.metadata && typeof resource.metadata === "object" ? resource.metadata as Record<string, unknown> : undefined })) : [],
          layout: lessonContentFromValue(module.lesson_content)?.layout ?? "signature",
          blocks: lessonContentFromValue(module.lesson_content)?.blocks ?? studioStarterBlocks(String(module.title ?? "Module"), String(module.description ?? ""), Array.isArray(module.learning_objectives) ? module.learning_objectives.map(String) : []),
        }));
        if (loadedModules.length) { setModules(loadedModules); setActiveModuleId(loadedModules[0].id); }
        setQuizzes((data.quizzes ?? []).map((quiz) => ({ id: String(quiz.id), title: String(quiz.title ?? "Évaluation"), questionCount: Number(quiz.question_count ?? 0), published: Boolean(quiz.published) })));
      } catch (error) { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible"); }
      finally { if (!cancelled) setLoading(false); }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [catalogSeed, course.audience, course.category, course.description, course.duration, course.id, course.mandatory, course.objective, course.title]);

  const updateModule = (moduleId: string, updates: Partial<StudioModule>) => setModules((current) => current.map((module) => module.id === moduleId ? { ...module, ...updates } : module));

  const persistStudio = async () => {
    setSaving(true); setFeedback("");
    try {
      if (usesNetlifyIdentity()) {
        await postAction("save-course", { courseId: course.id, ...details });
        const savedModules: StudioModule[] = [];
        for (const [index, module] of modules.entries()) {
          const data = await postAction("save-module", { courseId: course.id, moduleId: module.id, position: index + 1, title: module.title, description: module.description, contentType: module.contentType, durationMinutes: module.durationMinutes, objectives: module.objectives, published: module.published, lessonContent: { schemaVersion: "walyah-lms-module-v1", layout: module.layout, blocks: module.blocks } });
          savedModules.push({ ...module, id: String(data.id ?? module.id) });
        }
        setModules(savedModules);
      }
      setFeedback("Parcours enregistré. Vous pouvez poursuivre la préparation ou le publier.");
      return true;
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Enregistrement impossible"); return false; }
    finally { setSaving(false); }
  };

  const addModule = async () => {
    setFeedback("");
    const draftTitle = `Module ${modules.length + 1}`;
    const draft: StudioModule = { id: "", title: draftTitle, description: "", contentType: "text", durationMinutes: 15, objectives: [], published: true, resources: [], layout: "signature", blocks: studioStarterBlocks(draftTitle) };
    try {
      let id = `module-${Date.now()}`;
      if (usesNetlifyIdentity()) {
        const data = await postAction("save-module", { courseId: course.id, position: modules.length + 1, title: draft.title, description: "", contentType: "text", durationMinutes: 15, objectives: [], published: true, lessonContent: { schemaVersion: "walyah-lms-module-v1", layout: draft.layout, blocks: draft.blocks } });
        id = String(data.id);
      }
      const created = { ...draft, id };
      setModules((current) => [...current, created]); setActiveModuleId(id); setTab("content");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Création du module impossible"); }
  };

  const importAiModules = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportingAi(true); setFeedback("");
    try {
      const imported = await importAiModuleFile(file);
      const created: StudioModule[] = [];
      for (const [index, module] of imported.modules.entries()) {
        let id = `ai-module-${crypto.randomUUID()}`;
        let resources: StudioResource[] = module.resources.map((resource) => ({ name: resource.name, type: "link", contentKind: resource.kind, url: resource.url }));
        if (usesNetlifyIdentity()) {
          const data = await postAction("import-ai-module", { courseId: course.id, position: modules.length + index + 1, module });
          id = String(data.moduleId ?? id);
          resources = Array.isArray(data.resources) ? (data.resources as Array<Record<string, unknown>>).map((resource) => ({ id: String(resource.id), name: String(resource.name), type: "link", contentKind: String(resource.content_kind), url: String(resource.external_url) })) : resources;
        }
        created.push({ id, title: module.title, description: module.summary, contentType: module.contentType, durationMinutes: module.durationMinutes, objectives: module.objectives, published: true, resources, layout: module.lessonContent.layout, blocks: module.lessonContent.blocks });
      }
      setModules((current) => [...current, ...created]);
      setActiveModuleId(created[0].id); setTab("design");
      setFeedback(`${created.length} module${created.length > 1 ? "s" : ""} IA importé${created.length > 1 ? "s" : ""} et enregistré${created.length > 1 ? "s" : ""}.${imported.warnings.length ? ` ${imported.warnings.length} point${imported.warnings.length > 1 ? "s" : ""} à compléter.` : ""}`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Import du module IA impossible"); }
    finally { setImportingAi(false); }
  };

  const connectDrive = async () => {
    if (!activeModule) return;
    setDriveConnecting(true); setFeedback("");
    try {
      const picked = await pickGoogleDriveFile();
      let resource: StudioResource = { name: picked.name, type: "link", contentKind: "drive", url: picked.url, metadata: { driveFileId: picked.id, mimeType: picked.mimeType } };
      if (usesNetlifyIdentity()) {
        const data = await postAction("add-resource-link", { moduleId: activeModule.id, url: picked.url, name: picked.name, contentKind: "drive", metadata: { driveFileId: picked.id, mimeType: picked.mimeType } });
        const remote = data.resource as Record<string, unknown>;
        resource = { id: String(remote.id), name: String(remote.name), type: "link", contentKind: "drive", url: String(remote.external_url), metadata: remote.metadata && typeof remote.metadata === "object" ? remote.metadata as Record<string, unknown> : resource.metadata };
      }
      updateModule(activeModule.id, { resources: [...activeModule.resources, resource] });
      setFeedback(`« ${picked.name} » a été relié depuis Google Drive sans transiter par la limite d’import du LMS.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Connexion Google Drive impossible"); }
    finally { setDriveConnecting(false); }
  };

  const addDriveLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeModule || !driveUrl) return;
    setDriveConnecting(true); setFeedback("");
    try {
      let parsed: URL;
      try { parsed = new URL(driveUrl); } catch { throw new Error("Le lien Google Drive n’est pas valide."); }
      if (parsed.protocol !== "https:" || !["drive.google.com", "docs.google.com"].some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))) throw new Error("Utilisez un lien HTTPS provenant de Google Drive ou Google Docs.");
      let resource: StudioResource = { name: driveName.trim() || "Fichier Google Drive", type: "link", contentKind: "drive", url: parsed.toString() };
      if (usesNetlifyIdentity()) {
        const data = await postAction("add-resource-link", { moduleId: activeModule.id, url: parsed.toString(), name: resource.name, contentKind: "drive" });
        const remote = data.resource as Record<string, unknown>;
        resource = { id: String(remote.id), name: String(remote.name), type: "link", contentKind: "drive", url: String(remote.external_url) };
      }
      updateModule(activeModule.id, { resources: [...activeModule.resources, resource] });
      setDriveUrl(""); setDriveName(""); setFeedback("Lien Google Drive ajouté au module.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Ajout Google Drive impossible"); }
    finally { setDriveConnecting(false); }
  };

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !activeModule) return;
    setUploading(true); setFeedback("");
    try {
      const added: StudioResource[] = [];
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} : la taille maximale est de 50 Mo`);
        if (usesNetlifyIdentity()) {
          const chunkSize = 3 * 1024 * 1024;
          const chunkCount = Math.ceil(file.size / chunkSize);
          const uploadId = crypto.randomUUID();
          for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
            setFeedback(`Import de ${file.name} · bloc ${chunkIndex + 1}/${chunkCount}…`);
            const form = new FormData();
            form.append("purpose", "resource-chunk");
            form.append("moduleId", activeModule.id);
            form.append("uploadId", uploadId);
            form.append("chunkIndex", String(chunkIndex));
            form.append("chunkCount", String(chunkCount));
            form.append("totalSize", String(file.size));
            form.append("file", file.slice(chunkIndex * chunkSize, Math.min(file.size, (chunkIndex + 1) * chunkSize), file.type), file.name);
            const chunkResponse = await fetch("/.netlify/functions/upload", { method: "POST", body: form });
            const chunkData = await chunkResponse.json() as { error?: string };
            if (!chunkResponse.ok) throw new Error(`${file.name} : ${chunkData.error ?? "import interrompu"}`);
          }
          setFeedback(`Contrôle final de ${file.name}…`);
          const response = await fetch("/.netlify/functions/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finalize-resource-upload", uploadId, moduleId: activeModule.id, fileName: file.name, fileType: file.type || "application/octet-stream", chunkCount, totalSize: file.size }) });
          const data = await response.json() as { id?: string; contentKind?: string; metadata?: Record<string, unknown>; error?: string };
          if (!response.ok) throw new Error(`${file.name} : ${data.error ?? "import impossible"}`);
          added.push({ id: data.id, name: file.name, type: "file", contentKind: data.contentKind ?? "document", sizeBytes: file.size, metadata: data.metadata });
        } else {
          const extension = file.name.split(".").pop()?.toLowerCase();
          const kind = extension === "zip" ? "scorm" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : ["ppt", "pptx"].includes(extension ?? "") ? "presentation" : "document";
          added.push({ name: file.name, type: "file", contentKind: kind, sizeBytes: file.size });
        }
      }
      updateModule(activeModule.id, { resources: [...activeModule.resources, ...added] });
      setFeedback(`${added.length} fichier${added.length > 1 ? "s" : ""} ajouté${added.length > 1 ? "s" : ""} au module.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Import impossible"); }
    finally { setUploading(false); }
  };

  const addLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!linkUrl || !activeModule) return;
    setFeedback("");
    try {
      let resource: StudioResource = { name: linkName || linkUrl, type: "link", contentKind: linkKind, url: linkUrl };
      if (usesNetlifyIdentity()) {
        const data = await postAction("add-resource-link", { moduleId: activeModule.id, url: linkUrl, name: linkName || (linkKind === "video" ? "Vidéo du module" : linkKind === "audio" ? "Audio du module" : linkKind === "drive" ? "Fichier Google Drive" : "Ressource externe"), contentKind: linkKind });
        const remote = data.resource as Record<string, unknown>;
        resource = { id: String(remote.id), name: String(remote.name), type: "link", contentKind: String(remote.content_kind), url: String(remote.external_url) };
      }
      updateModule(activeModule.id, { resources: [...activeModule.resources, resource] });
      setLinkUrl(""); setLinkName(""); setFeedback("Lien ajouté au module.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Ajout du lien impossible"); }
  };

  const removeResource = async (resource: StudioResource) => {
    if (!activeModule) return;
    try {
      if (usesNetlifyIdentity() && resource.id) {
        const response = await fetch("/.netlify/functions/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceId: resource.id }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Suppression impossible");
      }
      updateModule(activeModule.id, { resources: activeModule.resources.filter((item) => item !== resource) });
      setFeedback("Ressource retirée du module.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Suppression impossible"); }
  };

  const readiness = [
    { label: "Titre, objectif et description renseignés", done: Boolean(details.title.trim() && details.objective.trim() && details.description.trim()) },
    { label: "Au moins un module structuré", done: modules.length > 0 && modules.every((module) => Boolean(module.title.trim())) },
    { label: "Chaque module possède un contenu ou une ressource", done: modules.length > 0 && modules.every((module) => Boolean(module.description.trim()) || module.resources.length > 0) },
  ];
  const canPublish = readiness.every((item) => item.done);

  const updateBlock = (blockId: string, updates: Partial<LessonBlock>) => {
    if (!activeModule) return;
    updateModule(activeModule.id, { blocks: activeModule.blocks.map((block) => block.id === blockId ? { ...block, ...updates } : block) });
  };
  const addBlock = (type: LessonBlockType) => {
    if (!activeModule) return;
    updateModule(activeModule.id, { blocks: [...activeModule.blocks, newStudioBlock(type)] });
  };
  const moveBlock = (blockIndex: number, direction: -1 | 1) => {
    if (!activeModule) return;
    const nextIndex = blockIndex + direction;
    if (nextIndex < 0 || nextIndex >= activeModule.blocks.length) return;
    const blocks = [...activeModule.blocks];
    [blocks[blockIndex], blocks[nextIndex]] = [blocks[nextIndex], blocks[blockIndex]];
    updateModule(activeModule.id, { blocks });
  };
  const removeBlock = (blockId: string) => {
    if (!activeModule || activeModule.blocks.length <= 1) { setFeedback("Un module doit conserver au moins un bloc pédagogique."); return; }
    updateModule(activeModule.id, { blocks: activeModule.blocks.filter((block) => block.id !== blockId) });
  };

  const publishCourse = async () => {
    if (!canPublish) { setFeedback("Complétez les éléments signalés avant de publier."); return; }
    const saved = await persistStudio(); if (!saved) return;
    setSaving(true);
    try {
      if (usesNetlifyIdentity()) await postAction("publish-course", { courseId: course.id });
      setPublished(true); onPublished?.(); setFeedback("Formation publiée. Elle peut maintenant être assignée aux apprenants.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Publication impossible"); }
    finally { setSaving(false); }
  };

  return <>
    <Modal title={`${course.code} · Studio de parcours`} onClose={onClose} wide studio>
      <div className="course-studio">
        <nav className="studio-tabs" aria-label="Étapes de préparation">
          <button className={tab === "structure" ? "active" : ""} onClick={() => setTab("structure")}><span>1</span>Informations</button>
          <button className={tab === "content" ? "active" : ""} onClick={() => setTab("content")}><span>2</span>Modules & contenus</button>
          <button className={tab === "design" ? "active" : ""} onClick={() => setTab("design")}><span>3</span>Mise en page</button>
          <button className={tab === "evaluation" ? "active" : ""} onClick={() => setTab("evaluation")}><span>4</span>QCM</button>
          <button className={tab === "publication" ? "active" : ""} onClick={() => setTab("publication")}><span>5</span>Publication</button>
        </nav>
        {loading ? <section className="studio-loading"><Clock3 size={25} /><strong>Préparation de l’espace de création…</strong><span>Les informations du catalogue sont récupérées automatiquement.</span></section> : <>
          {catalogSeed && <div className="catalog-seed-note"><Sparkles size={18} /><span><strong>Parcours initialisé depuis le catalogue</strong><small>Le titre, le public, l’objectif et le programme restent entièrement modifiables.</small></span></div>}
          {feedback && <p className="content-feedback" role="status">{feedback}</p>}
          {tab === "content" && <section className="studio-import-hub">
            <article className="ai-import-card"><span className="studio-hub-icon ai"><Sparkles size={23} /></span><div><span className="eyebrow">Création assistée</span><h3>Importer des modules générés par une IA</h3><p>Utilisez le format Walyah v1 : objectifs, blocs visuels, cas pratique, question flash et ressources sont contrôlés avant l’ajout en base.</p><div className="studio-hub-actions"><label className="primary-button"><UploadCloud size={16} /> {importingAi ? "Import en cours…" : "Importer le JSON IA"}<input type="file" accept="application/json,.json" onChange={importAiModules} disabled={importingAi} /></label><a className="secondary-button" href="/modeles/module-ia-walyah-exemple.json" download><Download size={15} /> Télécharger l’exemple</a></div></div>
            </article>
            <article className="drive-import-card"><span className="studio-hub-icon drive"><LibraryBig size={23} /></span><div><span className="eyebrow">Fichiers volumineux</span><h3>Relier Google Drive</h3><p>Le LMS conserve le lien et les droits restent gérés dans Drive : le fichier ne transite pas par la limite d’import Netlify.</p><div className="studio-hub-actions"><button className="secondary-button" type="button" disabled={!googleDriveConfigured() || driveConnecting || !activeModule} onClick={() => void connectDrive()}><Link2 size={15} /> {driveConnecting ? "Connexion…" : "Choisir dans Drive"}</button><small>{googleDriveConfigured() ? "Connexion sécurisée à la demande" : "Sélecteur à activer avec les variables Netlify"}</small></div><form className="drive-link-form" onSubmit={addDriveLink}><input value={driveName} onChange={(event) => setDriveName(event.target.value)} placeholder="Nom visible" /><input type="url" value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} placeholder="Coller un lien Drive partagé" required /><button className="secondary-button" type="submit" disabled={driveConnecting || !activeModule}><Plus size={15} /> Ajouter</button></form></div>
            </article>
          </section>}
          {tab === "design" && activeModule && <section className="studio-pane studio-design">
            <header className="studio-design-heading"><div><span className="eyebrow">Canvas pédagogique</span><h3>Composer une expérience claire et vivante</h3><p>Ajoutez, réordonnez et prévisualisez les blocs qui seront affichés à l’apprenant.</p></div><span className="count-badge">{activeModule.blocks.length} bloc{activeModule.blocks.length > 1 ? "s" : ""}</span></header>
            <div className="layout-choices" role="group" aria-label="Style de mise en page">{([{"id":"signature","title":"Signature","copy":"Éditorial et premium"},{"id":"atelier","title":"Atelier","copy":"Pratique et séquencé"},{"id":"essentiel","title":"Essentiel","copy":"Direct et compact"}] as const).map((layout) => <button key={layout.id} className={activeModule.layout === layout.id ? "active" : ""} onClick={() => updateModule(activeModule.id, { layout: layout.id })}><span className={`layout-miniature layout-${layout.id}`}><i /><i /><i /></span><strong>{layout.title}</strong><small>{layout.copy}</small></button>)}</div>
            <div className="studio-design-grid"><aside className="block-palette"><span className="form-section-title"><Plus size={16} /> Ajouter un bloc</span>{(["hero", "text", "objectives", "steps", "callout", "case_study", "knowledge_check", "summary"] as LessonBlockType[]).map((type) => <button key={type} onClick={() => addBlock(type)}><span>{type === "knowledge_check" ? <FileQuestion size={16} /> : type === "case_study" ? <ClipboardCheck size={16} /> : type === "callout" ? <CircleHelp size={16} /> : <FileText size={16} />}</span>{studioBlockLabel(type)}<Plus size={14} /></button>)}</aside><div className={`lesson-canvas layout-${activeModule.layout}`}>{activeModule.blocks.map((block, index) => <article className={`design-block block-${block.type} tone-${block.tone ?? "info"}`} key={block.id}><header><span><GripVertical size={15} /><small>{studioBlockLabel(block.type)} · {index + 1}</small></span><div><button className="icon-button" aria-label="Monter le bloc" disabled={index === 0} onClick={() => moveBlock(index, -1)}>↑</button><button className="icon-button" aria-label="Descendre le bloc" disabled={index === activeModule.blocks.length - 1} onClick={() => moveBlock(index, 1)}>↓</button><button className="icon-button danger-icon" aria-label="Supprimer le bloc" onClick={() => removeBlock(block.id)}><Trash2 size={15} /></button></div></header><label>Titre<input value={block.title} onChange={(event) => updateBlock(block.id, { title: event.target.value })} /></label>{["hero", "text", "callout", "case_study"].includes(block.type) && <label>Contenu<textarea rows={3} value={block.body ?? ""} onChange={(event) => updateBlock(block.id, { body: event.target.value })} /></label>}{["objectives", "steps", "summary"].includes(block.type) && <label>Éléments — un par ligne<textarea rows={4} value={(block.items ?? []).join("\n")} onChange={(event) => updateBlock(block.id, { items: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>}{block.type === "callout" && <label>Ton<select value={block.tone ?? "info"} onChange={(event) => updateBlock(block.id, { tone: event.target.value as LessonBlock["tone"] })}><option value="info">Information</option><option value="success">Bonne pratique</option><option value="warning">Vigilance</option></select></label>}{block.type === "case_study" && <label>Consigne<input value={block.prompt ?? ""} onChange={(event) => updateBlock(block.id, { prompt: event.target.value })} /></label>}{block.type === "knowledge_check" && <><label>Question<textarea rows={2} value={block.prompt ?? ""} onChange={(event) => updateBlock(block.id, { prompt: event.target.value })} /></label><label>Réponses — une par ligne<textarea rows={3} value={(block.options ?? []).join("\n")} onChange={(event) => updateBlock(block.id, { options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 6) })} /></label><label>Index de la bonne réponse<input type="number" min="0" max={Math.max(0, (block.options?.length ?? 1) - 1)} value={block.correctAnswer ?? 0} onChange={(event) => updateBlock(block.id, { correctAnswer: Number(event.target.value) })} /></label><label>Explication<textarea rows={2} value={block.explanation ?? ""} onChange={(event) => updateBlock(block.id, { explanation: event.target.value })} /></label></>}</article>)}</div></div>
          </section>}
          {tab === "structure" && <section className="studio-pane studio-details"><div className="form-grid"><label className="full-field">Titre du parcours<input value={details.title} onChange={(event) => setDetails({ ...details, title: event.target.value })} /></label><label>Catégorie<input value={details.category} onChange={(event) => setDetails({ ...details, category: event.target.value })} /></label><label>Durée totale estimée (minutes)<input type="number" min="0" value={details.durationMinutes} onChange={(event) => setDetails({ ...details, durationMinutes: Number(event.target.value) })} /></label><label className="full-field">Public concerné<input value={details.audience} onChange={(event) => setDetails({ ...details, audience: event.target.value })} /></label><label className="full-field">Objectif pédagogique<textarea rows={3} value={details.objective} onChange={(event) => setDetails({ ...details, objective: event.target.value })} /></label><label className="full-field">Présentation du parcours<textarea rows={4} value={details.description} onChange={(event) => setDetails({ ...details, description: event.target.value })} /></label><label className="check-field full-field"><input type="checkbox" checked={details.mandatory} onChange={(event) => setDetails({ ...details, mandatory: event.target.checked })} /><span><strong>Formation obligatoire</strong><small>Les échéances pourront être définies lors de l’affectation.</small></span></label></div>{catalogSeed?.program?.length ? <div className="catalog-program"><span className="form-section-title">Programme suggéré par le catalogue</span><ol>{catalogSeed.program.map((item) => <li key={item}>{item}</li>)}</ol></div> : null}</section>}
          {tab === "content" && <section className="studio-pane studio-content-grid"><aside className="studio-module-list"><header><div><span className="eyebrow">Structure</span><strong>{modules.length} module{modules.length > 1 ? "s" : ""}</strong></div><button className="icon-button" aria-label="Ajouter un module" onClick={addModule}><Plus size={18} /></button></header>{modules.map((module, index) => <button key={module.id} className={module.id === activeModule?.id ? "active" : ""} onClick={() => setActiveModuleId(module.id)}><GripVertical size={15} /><span><small>Module {index + 1}</small><strong>{module.title}</strong></span><ChevronRight size={15} /></button>)}<button className="secondary-button add-module-button" onClick={addModule}><Plus size={16} /> Ajouter un module</button></aside>{activeModule && <div className="studio-module-editor"><div className="module-fields form-grid"><label className="full-field">Titre du module<input value={activeModule.title} onChange={(event) => updateModule(activeModule.id, { title: event.target.value })} /></label><label>Type de module<select value={activeModule.contentType} onChange={(event) => updateModule(activeModule.id, { contentType: event.target.value })}><option value="text">Cours / texte</option><option value="video">Vidéo</option><option value="document">Document</option><option value="audio">Audio / podcast</option><option value="scorm">Package SCORM</option><option value="quiz">Évaluation</option></select></label><label>Durée (minutes)<input type="number" min="0" value={activeModule.durationMinutes} onChange={(event) => updateModule(activeModule.id, { durationMinutes: Number(event.target.value) })} /></label><label className="full-field">Résumé ou contenu textuel<textarea rows={4} value={activeModule.description} onChange={(event) => updateModule(activeModule.id, { description: event.target.value })} placeholder="Notions abordées, consignes, mise en situation…" /></label><label className="full-field">Objectifs du module — un par ligne<textarea rows={3} value={activeModule.objectives.join("\n")} onChange={(event) => updateModule(activeModule.id, { objectives: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label></div><section><span className="form-section-title"><UploadCloud size={17} /> Déposer des fichiers</span><label className="upload-zone studio-upload"><UploadCloud size={29} /><strong>{uploading ? "Import et contrôle en cours…" : "Sélectionnez un ou plusieurs contenus"}</strong><small>PDF, Word, PowerPoint, MP4/WebM, MP3/WAV/M4A/OGG ou SCORM 1.2/2004 (.zip) · 50 Mo par fichier</small><input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.webm,.mp3,.wav,.m4a,.ogg,.aac,.zip,video/*,audio/*" onChange={addFiles} disabled={uploading} /></label><p className="scorm-note"><Archive size={15} /> Les archives SCORM sont contrôlées : présence du manifeste, version et intégrité du ZIP.</p></section><section><span className="form-section-title"><Link2 size={17} /> Ajouter un lien</span><form className="studio-link-form" onSubmit={addLink}><select value={linkKind} onChange={(event) => setLinkKind(event.target.value)}><option value="video">Vidéo</option><option value="audio">Audio</option><option value="external">Fichier ou page web</option></select><input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Nom visible (facultatif)" /><input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" required /><button className="secondary-button" type="submit"><Plus size={15} /> Ajouter</button></form></section><section><span className="form-section-title"><LibraryBig size={17} /> Ressources du module</span>{activeModule.resources.length ? <div className="managed-resources studio-resources">{activeModule.resources.map((resource, index) => <div key={resource.id ?? `${resource.name}-${index}`}><span className={`resource-icon ${resource.contentKind}`}>{studioResourceIcon(resource.contentKind)}</span><span><strong>{resource.name}</strong><small>{resource.contentKind === "scorm" ? String(resource.metadata?.version ?? "Package SCORM") : resource.contentKind}{resource.sizeBytes ? ` · ${(resource.sizeBytes / 1024 / 1024).toFixed(1)} Mo` : " · lien sécurisé"}</small></span>{resource.url && <a className="icon-button" href={resource.url} target="_blank" rel="noreferrer" aria-label="Ouvrir"><ExternalLink size={16} /></a>}<button className="icon-button" onClick={() => void removeResource(resource)} aria-label="Supprimer"><Trash2 size={16} /></button></div>)}</div> : <div className="studio-inline-empty"><Inbox size={20} /><span>Aucune ressource ajoutée à ce module.</span></div>}</section></div>}</section>}
          {tab === "evaluation" && <section className="studio-pane evaluation-studio"><div className="evaluation-intro"><span className="quiz-card-icon tone-violet"><FileQuestion size={26} /></span><div><span className="eyebrow">Évaluation des acquis</span><h3>Créer ou importer un questionnaire</h3><p>Choix unique, choix multiples, vrai/faux et réponse courte. Les fichiers JSON et Excel sont contrôlés puis enregistrés dans la base.</p></div><button className="primary-button" onClick={() => { setEditingQuizId(""); setQuizOpen(true); }}><Plus size={16} /> Créer ou importer</button></div><div className="evaluation-import-cards"><a href="/modeles/qcm-walyah-modele.xlsx" download><Table2 size={22} /><span><strong>Modèle Excel</strong><small>Colonnes prêtes et exemples inclus</small></span><Download size={16} /></a><a href="/modeles/qcm-walyah-exemple.json" download><FileText size={22} /><span><strong>Modèle JSON</strong><small>Structure technique complète</small></span><Download size={16} /></a></div>{quizzes.length ? <div className="studio-quiz-list">{quizzes.map((quiz) => <article key={quiz.id}><FileQuestion size={19} /><span><strong>{quiz.title}</strong><small>{quiz.questionCount} question{quiz.questionCount > 1 ? "s" : ""}</small></span><span className={`status-tag ${quiz.published ? "status-actif" : "status-draft"}`}>{quiz.published ? "Publié" : "Brouillon"}</span><span className="studio-quiz-actions"><button className="secondary-button compact-action" disabled={saving} onClick={() => void toggleQuizPublication(quiz)}>{quiz.published ? "Dépublier" : "Publier"}</button><button className="icon-button" aria-label={`Modifier ${quiz.title}`} onClick={() => { setEditingQuizId(quiz.id); setQuizOpen(true); }}><Edit3 size={15} /></button><button className="icon-button" aria-label={`Affecter ${quiz.title}`} onClick={() => setQuizToAssign({ id: quiz.id, title: quiz.title, courseId: course.id, courseTitle: details.title, questionCount: quiz.questionCount, threshold: 80, published: quiz.published, participants: 0, averageScore: 0, assignedUsers: 0, assignedGroups: 0 })}><Send size={15} /></button><button className="icon-button danger-icon" aria-label={`Supprimer ${quiz.title}`} onClick={() => void removeQuiz(quiz)}><Trash2 size={15} /></button></span></article>)}</div> : <div className="studio-inline-empty"><FileQuestion size={21} /><span>Aucun questionnaire n’est encore relié à ce parcours.</span></div>}<div className="import-rules-summary"><strong>Règles principales d’import</strong><ul><li>100 questions maximum par questionnaire.</li><li>2 à 6 propositions pour les choix uniques ou multiples.</li><li>Bonnes réponses Excel indiquées par lettres : A ou A|C.</li><li>Plusieurs QCM peuvent être publiés et ciblés sur des groupes différents.</li><li>Une erreur précise la ligne concernée sans bloquer les lignes valides.</li></ul></div></section>}
          {tab === "publication" && <section className="studio-pane publication-studio"><div className="publication-heading"><span className={`publication-emblem ${published ? "published" : ""}`}>{published ? <CheckCircle2 size={34} /> : <ShieldCheck size={34} />}</span><div><span className="eyebrow">Dernière vérification</span><h3>{published ? "Ce parcours est publié" : "Votre parcours est-il prêt ?"}</h3><p>Une formation publiée devient disponible dans la liste d’affectation des apprenants.</p></div></div><div className="readiness-list">{readiness.map((item) => <div key={item.label} className={item.done ? "done" : "pending"}>{item.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}<span>{item.label}</span><strong>{item.done ? "Prêt" : "À compléter"}</strong></div>)}<div className="optional"><FileQuestion size={19} /><span>QCM final</span><strong>{quizzes.length ? `${quizzes.length} créé${quizzes.length > 1 ? "s" : ""}` : "Optionnel"}</strong></div></div><div className="publication-actions"><button className="secondary-button" onClick={() => void persistStudio()} disabled={saving}><Save size={16} /> Enregistrer le brouillon</button><button className="primary-button" onClick={() => void publishCourse()} disabled={saving || !canPublish}><CheckCircle2 size={16} /> {published ? "Mettre à jour la publication" : "Publier la formation"}</button></div></section>}
        </>}
        <footer className="studio-footer"><span>{published ? <><CheckCircle2 size={15} /> Parcours publié</> : <><Clock3 size={15} /> Brouillon en préparation</>}</span><div><button className="secondary-button" onClick={onClose}>Fermer</button><button className="primary-button" onClick={() => void persistStudio()} disabled={saving || loading}><Save size={16} /> {saving ? "Enregistrement…" : "Enregistrer"}</button></div></footer>
      </div>
    </Modal>
    {quizOpen && <QuizBuilder quizId={editingQuizId || undefined} initialCourseId={course.id} onClose={() => { setQuizOpen(false); setEditingQuizId(""); }} onSave={(quiz) => { setQuizOpen(false); setQuizzes((current) => editingQuizId ? current.map((item) => item.id === quiz.id ? { ...item, title: quiz.title, questionCount: quiz.questionCount } : item) : [{ ...quiz, published: false }, ...current]); setEditingQuizId(""); setFeedback(`QCM « ${quiz.title} » enregistré dans la base.`); }} />}
    {quizToAssign && <QuizAssignmentModal quiz={quizToAssign} onClose={() => setQuizToAssign(null)} onAssigned={(count) => { setQuizToAssign(null); setFeedback(`QCM affecté à ${count} apprenant${count > 1 ? "s" : ""}.`); }} />}
  </>;
}

function QuizzesView() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<QuizAdminRecord | null>(null);
  const [assignmentQuiz, setAssignmentQuiz] = useState<QuizAdminRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState("");
  const [items, setItems] = useState<QuizAdminRecord[]>([]);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [loadError, setLoadError] = useState("");
  const loadQuizzes = useCallback(async () => {
    if (!usesNetlifyIdentity()) { setLoading(false); return; }
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/.netlify/functions/lms-data?scope=admin");
      const data = await response.json() as { quizStats?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok) throw new Error(data.error || "Chargement des QCM impossible");
      setItems((data.quizStats ?? []).map((item) => ({
        id: String(item.id), title: String(item.title ?? "Évaluation"), courseId: String(item.course_id ?? ""), courseTitle: String(item.course_title ?? "Formation"),
        questionCount: Number(item.question_count ?? 0), threshold: Number(item.pass_threshold ?? 80), published: Boolean(item.published),
        participants: Number(item.participants ?? 0), averageScore: Number(item.average_score ?? 0), assignedUsers: Number(item.assigned_users ?? 0), assignedGroups: Number(item.assigned_groups ?? 0),
      })));
    } catch (caught) { setLoadError(caught instanceof Error ? caught.message : "Chargement des QCM impossible"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadQuizzes(), 0); return () => window.clearTimeout(timer); }, [loadQuizzes]);
  const togglePublished = async (item: QuizAdminRecord) => {
    setSavingId(item.id); setNotice("");
    try {
      const nextPublished = !item.published;
      if (usesNetlifyIdentity()) {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set-quiz-published", quizId: item.id, published: nextPublished }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Mise à jour impossible");
      }
      setItems((current) => current.map((quiz) => quiz.id === item.id ? { ...quiz, published: nextPublished } : quiz));
      setNotice(nextPublished ? "Le QCM est publié dans le parcours apprenant." : "Le QCM a été dépublié.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Mise à jour impossible"); }
    finally { setSavingId(""); }
  };
  const deleteQuiz = async (item: QuizAdminRecord) => {
    if (!window.confirm(`Supprimer le QCM « ${item.title} » ? Les tentatives et résultats existants resteront archivés pour la traçabilité.`)) return;
    setSavingId(item.id); setNotice("");
    try {
      if (usesNetlifyIdentity()) {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-quiz", quizId: item.id }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Suppression impossible");
      }
      setItems((current) => current.filter((quiz) => quiz.id !== item.id));
      setNotice(`Le QCM « ${item.title} » a été supprimé de la liste active.`);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Suppression impossible"); }
    finally { setSavingId(""); }
  };
  return <>
    <section className="page-heading"><div><span className="eyebrow">Évaluation des acquis</span><h1>QCM & évaluations</h1><p>Importez, enregistrez, modifiez et affectez chaque questionnaire à une personne ou à un groupe de formation.</p></div><div className="heading-actions"><a className="secondary-button button-link" href="/modeles/qcm-walyah-modele.xlsx" download><Table2 size={16} /> Modèle Excel</a><a className="secondary-button button-link" href="/modeles/qcm-walyah-exemple.json" download><Download size={16} /> Modèle JSON</a><button className="primary-button" onClick={() => { setEditingQuiz(null); setBuilderOpen(true); }}><Plus size={17} /> Créer ou importer</button></div></section>
    {notice && <div className="success-banner" role="status"><CheckCircle2 size={18} /> {notice}</div>}
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    {items.length ? <div className="quiz-admin-grid">{items.map((item, index) => <article className="panel quiz-admin-card" key={item.id}><div className={`quiz-card-icon tone-${(["teal", "blue", "violet", "coral"] as const)[index % 4]}`}><FileQuestion size={25} /></div><span className={`status-tag ${item.published ? "status-active" : "status-draft"}`}>{item.published ? "Publié" : "Brouillon"}</span><span className="eyebrow">{item.courseTitle}</span><h2>{item.title}</h2><p>{item.questionCount} question{item.questionCount > 1 ? "s" : ""} · Seuil de réussite {item.threshold} %</p><div className="quiz-stats"><div><strong>{item.assignedUsers}</strong><span>Affectés</span></div><div><strong>{item.participants}</strong><span>Participants</span></div><div><strong>{item.averageScore} %</strong><span>Score moyen</span></div></div><div className="quiz-card-actions"><button className={item.published ? "secondary-button" : "primary-button"} disabled={savingId === item.id} onClick={() => void togglePublished(item)}>{savingId === item.id ? "Mise à jour…" : item.published ? "Dépublier" : "Publier"}</button><button className="secondary-button" onClick={() => setAssignmentQuiz(item)}><Send size={15} /> Affecter</button><button className="secondary-button" onClick={() => { setEditingQuiz(item); setBuilderOpen(true); }}><Edit3 size={15} /> Modifier</button><button className="icon-button danger-icon" aria-label={`Supprimer ${item.title}`} disabled={savingId === item.id} onClick={() => void deleteQuiz(item)}><Trash2 size={16} /></button></div>{item.assignedGroups > 0 && <small className="quiz-assignment-summary"><UsersRound size={14} /> Affecté via {item.assignedGroups} groupe{item.assignedGroups > 1 ? "s" : ""}</small>}</article>)}</div> : <section className="panel learner-empty-state compact-empty"><span className="empty-icon">{loading ? <Clock3 size={28} /> : <FileQuestion size={28} />}</span><h2>{loading ? "Chargement des QCM…" : "Aucun QCM enregistré"}</h2><p>{loading ? "La bibliothèque des évaluations est en cours de synchronisation." : "Créez le premier questionnaire ou importez un modèle JSON ou Excel."}</p></section>}
    {builderOpen && <QuizBuilder quizId={editingQuiz?.id} initialCourseId={editingQuiz?.courseId} onClose={() => { setBuilderOpen(false); setEditingQuiz(null); }} onSave={(quiz) => { setBuilderOpen(false); setEditingQuiz(null); setNotice(`Le QCM « ${quiz.title} » est bien enregistré dans la base de données.`); void loadQuizzes(); }} />}
    {assignmentQuiz && <QuizAssignmentModal quiz={assignmentQuiz} onClose={() => setAssignmentQuiz(null)} onAssigned={(count) => { setAssignmentQuiz(null); setNotice(`${assignmentQuiz.title} a été affecté à ${count} apprenant${count > 1 ? "s" : ""}.`); void loadQuizzes(); }} />}
  </>;
}

function QuizAssignmentModal({ quiz, onClose, onAssigned }: { quiz: QuizAdminRecord; onClose: () => void; onAssigned: (count: number) => void }) {
  const [learners, setLearners] = useState<Array<{ id: string; name: string; department: string }>>([]);
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [targetType, setTargetType] = useState<"learner" | "group">("learner");
  const [targetId, setTargetId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void Promise.all([
      fetch("/.netlify/functions/lms-data?scope=admin").then(async (response) => { const data = await response.json() as { learners?: Array<Record<string, unknown>>; error?: string }; if (!response.ok) throw new Error(data.error || "Chargement des apprenants impossible"); return data.learners ?? []; }),
      fetch("/.netlify/functions/lms-data?scope=groups").then(async (response) => { const data = await response.json() as { groups?: Array<Record<string, unknown>>; members?: Array<Record<string, unknown>>; error?: string }; if (!response.ok) throw new Error(data.error || "Chargement des groupes impossible"); return data; }),
    ]).then(([learnerRows, groupData]) => {
      const loadedLearners = learnerRows.map((item) => ({ id: String(item.id), name: String(item.full_name ?? item.email ?? "Apprenant"), department: String(item.department ?? "Non renseigné") }));
      const memberRows = groupData.members ?? [];
      const loadedGroups = (groupData.groups ?? []).map((group): TrainingGroup => ({ id: String(group.id), name: String(group.name ?? "Groupe"), description: String(group.description ?? ""), department: String(group.department ?? ""), memberCount: Number(group.member_count ?? 0), assignedQuizzes: Number(group.assigned_quizzes ?? 0), memberIds: memberRows.filter((member) => String(member.group_id) === String(group.id)).map((member) => String(member.id)) }));
      setLearners(loadedLearners); setGroups(loadedGroups); setTargetId(loadedLearners[0]?.id ?? loadedGroups[0]?.id ?? "");
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Chargement des destinataires impossible")).finally(() => setLoading(false));
  }, []);
  const switchTarget = (next: "learner" | "group") => { setTargetType(next); setTargetId(next === "learner" ? learners[0]?.id ?? "" : groups[0]?.id ?? ""); setError(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!targetId) { setError(targetType === "group" ? "Créez ou sélectionnez un groupe de formation." : "Sélectionnez un apprenant."); return; }
    setSaving(true);
    try {
      let assignedCount = targetType === "group" ? groups.find((group) => group.id === targetId)?.memberCount ?? 0 : 1;
      if (usesNetlifyIdentity()) {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign-quiz", quizId: quiz.id, targetType, targetId, dueAt: dueAt || null, note }) });
        const data = await response.json() as { assignedCount?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "Affectation impossible");
        assignedCount = Number(data.assignedCount ?? assignedCount);
      }
      onAssigned(assignedCount);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Affectation impossible"); }
    finally { setSaving(false); }
  };
  return <Modal title={`Affecter · ${quiz.title}`} onClose={onClose} wide><form className="modal-form quiz-assignment-form" onSubmit={submit}><div className="neutral-note"><FileQuestion size={18} /><span><strong>{quiz.courseTitle}</strong><small>Le QCM sera publié et la formation correspondante sera ajoutée automatiquement aux personnes sélectionnées.</small></span></div><nav className="assignment-target-tabs" aria-label="Type de destinataire"><button type="button" className={targetType === "learner" ? "active" : ""} onClick={() => switchTarget("learner")}><UserRound size={16} /> Un apprenant</button><button type="button" className={targetType === "group" ? "active" : ""} onClick={() => switchTarget("group")}><UsersRound size={16} /> Un groupe</button></nav>{loading ? <div className="studio-inline-empty"><Clock3 size={20} /><span>Chargement des destinataires…</span></div> : targetType === "learner" ? <label>Apprenant<select value={targetId} onChange={(event) => setTargetId(event.target.value)} required><option value="">Sélectionner…</option>{learners.map((learner) => <option value={learner.id} key={learner.id}>{learner.name} · {learner.department}</option>)}</select></label> : <label>Groupe de formation<select value={targetId} onChange={(event) => setTargetId(event.target.value)} required><option value="">Sélectionner…</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.memberCount} membre{group.memberCount > 1 ? "s" : ""}</option>)}</select></label>}<label>Date limite<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><label>Consigne<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Objectif, priorité ou contexte de l’évaluation…" /></label>{error && <p className="form-message" role="alert">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={loading || saving}><Send size={16} /> {saving ? "Affectation…" : targetType === "group" ? "Affecter au groupe" : "Affecter à l’apprenant"}</button></footer></form></Modal>;
}

const quizTypeLabels: Record<QuizQuestionType, string> = { single: "Choix unique", multiple: "Choix multiples", true_false: "Vrai / faux", short_text: "Réponse courte" };

function parseQuizArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; }
}

function QuizBuilder({ onClose, onSave, initialCourseId, quizId }: { onClose: () => void; onSave: (quiz: { id: string; title: string; questionCount: number }) => void; initialCourseId?: string; quizId?: string }) {
  const [title, setTitle] = useState("Évaluation finale");
  const [courseId, setCourseId] = useState(initialCourseId ?? courses[0].id);
  const [courseOptions, setCourseOptions] = useState(() => {
    const options = courses.map((course) => ({ id: course.id, code: course.code, title: course.title }));
    return initialCourseId && !options.some((option) => option.id === initialCourseId) ? [{ id: initialCourseId, code: "CAT", title: "Parcours sélectionné" }, ...options] : options;
  });
  const [threshold, setThreshold] = useState("80");
  const [questions, setQuestions] = useState<DraftQuizQuestion[]>([emptyQuizQuestion()]);
  const [error, setError] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [importedFileName, setImportedFileName] = useState("");
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(Boolean(quizId && usesNetlifyIdentity()));

  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { courseStats?: Array<Record<string, unknown>> }) => {
      const options = (data.courseStats ?? []).map((row) => ({ id: String(row.id), code: String(row.code ?? "WA"), title: String(row.title ?? "Formation") }));
      if (options.length) setCourseOptions(options);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!quizId || !usesNetlifyIdentity()) return;
    void fetch(`/.netlify/functions/lms-data?scope=quiz-admin&quizId=${encodeURIComponent(quizId)}`).then(async (response) => {
      const data = await response.json() as { quiz?: Record<string, unknown>; questions?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok) throw new Error(data.error || "Chargement du QCM impossible");
      const quiz = data.quiz;
      if (!quiz) throw new Error("Questionnaire introuvable");
      setTitle(String(quiz.title ?? "Évaluation finale")); setCourseId(String(quiz.course_id ?? initialCourseId ?? courses[0].id)); setThreshold(String(quiz.pass_threshold ?? 80));
      const loaded = (data.questions ?? []).map((question): DraftQuizQuestion => {
        const type = String(question.question_type ?? "single") as QuizQuestionType;
        const options = parseQuizArray<string>(question.options).map(String);
        const storedCorrect = parseQuizArray<number>(question.correct_answers).map(Number);
        return {
          type, prompt: String(question.prompt ?? ""), options: type === "true_false" ? ["Vrai", "Faux"] : type === "short_text" ? [] : options,
          correctAnswers: type === "short_text" ? [] : storedCorrect.length ? storedCorrect : [Number(question.correct_option ?? 0)],
          acceptedAnswers: parseQuizArray<string>(question.accepted_answers).map(String), explanation: String(question.explanation ?? ""), points: Number(question.points ?? 1),
        };
      });
      setQuestions(loaded.length ? loaded : [emptyQuizQuestion()]);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Chargement du QCM impossible")).finally(() => setLoadingQuiz(false));
  }, [initialCourseId, quizId]);

  const updateQuestion = (index: number, updates: Partial<DraftQuizQuestion>) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item));
  const updateOption = (questionIndex: number, optionIndex: number, value: string) => updateQuestion(questionIndex, { options: questions[questionIndex].options.map((option, index) => index === optionIndex ? value : option) });
  const changeType = (questionIndex: number, type: QuizQuestionType) => {
    const current = questions[questionIndex];
    const fresh = emptyQuizQuestion(type);
    updateQuestion(questionIndex, { ...fresh, prompt: current.prompt, explanation: current.explanation, points: current.points });
  };
  const toggleCorrect = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    if (question.type !== "multiple") { updateQuestion(questionIndex, { correctAnswers: [optionIndex] }); return; }
    const selected = question.correctAnswers.includes(optionIndex) ? question.correctAnswers.filter((item) => item !== optionIndex) : [...question.correctAnswers, optionIndex].sort((a, b) => a - b);
    updateQuestion(questionIndex, { correctAnswers: selected });
  };
  const removeOption = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    if (question.options.length <= 2) return;
    const options = question.options.filter((_, index) => index !== optionIndex);
    const correctAnswers = question.correctAnswers.filter((index) => index !== optionIndex).map((index) => index > optionIndex ? index - 1 : index);
    updateQuestion(questionIndex, { options, correctAnswers: correctAnswers.length ? correctAnswers : [0] });
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setError(""); setImportErrors([]); setImportStatus("Analyse du fichier…");
    const result = await importQuizFile(file);
    if (result.title) setTitle(result.title);
    if (result.courseId) setCourseId(result.courseId);
    if (result.threshold !== undefined) setThreshold(String(result.threshold));
    if (result.questions.length) setQuestions(result.questions);
    setImportedFileName(result.questions.length ? file.name : "");
    setImportErrors(result.errors);
    setImportStatus(result.questions.length ? `${result.questions.length} question${result.questions.length > 1 ? "s" : ""} importée${result.questions.length > 1 ? "s" : ""} depuis ${file.name}. Vérifiez-les puis cliquez sur « Enregistrer dans la base ». ` : "Aucune question valide n’a été importée.");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const invalidIndex = questions.findIndex((question) => !question.prompt.trim() || ((question.type === "single" || question.type === "multiple") && (question.options.length < 2 || question.options.some((option) => !option.trim()))) || (question.type !== "short_text" && !question.correctAnswers.length) || (question.type === "short_text" && !question.acceptedAnswers.some((answer) => answer.trim())));
    if (invalidIndex >= 0) { setError(`La question ${invalidIndex + 1} est incomplète.`); return; }
    setSavingQuiz(true);
    let savedQuiz = { id: `quiz-${Date.now()}`, title, questionCount: questions.length };
    if (usesNetlifyIdentity()) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: quizId ? "update-quiz" : "create-quiz", quizId, courseId, title, threshold: Number(threshold), questions, importedFileName: importedFileName || null }) });
        const data = await response.json() as { id?: string; questionCount?: number; persisted?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
        if (!data.persisted) throw new Error("La base n’a pas confirmé l’enregistrement du QCM");
        savedQuiz = { id: data.id ?? savedQuiz.id, title, questionCount: data.questionCount ?? questions.length };
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible"); setSavingQuiz(false); return; }
    }
    setSavingQuiz(false); onSave(savedQuiz);
  };

  return <Modal title={quizId ? "Modifier le QCM" : "Créer ou importer un QCM"} onClose={onClose} wide studio><form className="quiz-builder modal-form advanced-quiz-builder" onSubmit={submit}>
    {loadingQuiz && <div className="studio-inline-empty"><Clock3 size={20} /><span>Chargement du questionnaire enregistré…</span></div>}
    <div className="form-grid quiz-settings-grid"><label>Titre du QCM<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Évaluation finale" required /></label><label>Formation<select value={courseId} onChange={(event) => setCourseId(event.target.value)} disabled={Boolean(quizId)}>{courseOptions.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.title}</option>)}</select></label><label>Seuil de réussite<select value={threshold} onChange={(event) => setThreshold(event.target.value)}><option value="60">60 %</option><option value="70">70 %</option><option value="80">80 %</option><option value="90">90 %</option></select></label><label className="quiz-import">Importer JSON ou Excel<span><FileUp size={16} /> {quizId ? "Remplacer depuis un fichier" : "Sélectionner un fichier"}<input type="file" accept="application/json,.json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importFile} /></span></label></div>
    <div className="quiz-template-links"><a href="/modeles/qcm-walyah-modele.xlsx" download><Table2 size={16} /> Télécharger le modèle Excel</a><a href="/modeles/qcm-walyah-exemple.json" download><FileText size={16} /> Télécharger le modèle JSON</a><span>100 questions maximum</span></div>
    {importStatus && <p className="import-status"><CheckCircle2 size={16} /> {importStatus}</p>}
    {importErrors.length > 0 && <div className="import-error-report" role="alert"><strong>{importErrors.length} anomalie{importErrors.length > 1 ? "s" : ""} détectée{importErrors.length > 1 ? "s" : ""}</strong><ul>{importErrors.slice(0, 12).map((message) => <li key={message}>{message}</li>)}</ul>{importErrors.length > 12 && <small>{importErrors.length - 12} autre(s) anomalie(s) non affichée(s).</small>}</div>}
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="builder-question-list">{questions.map((question, questionIndex) => <section className="builder-question advanced-question" key={questionIndex}><div className="builder-question-head"><span>Question {questionIndex + 1}</span><select aria-label={`Type de la question ${questionIndex + 1}`} value={question.type} onChange={(event) => changeType(questionIndex, event.target.value as QuizQuestionType)}>{(Object.keys(quizTypeLabels) as QuizQuestionType[]).map((type) => <option value={type} key={type}>{quizTypeLabels[type]}</option>)}</select><label className="question-points">Points<input type="number" min="1" max="10" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) })} /></label>{questions.length > 1 && <button type="button" className="icon-button" aria-label="Supprimer la question" onClick={() => setQuestions(questions.filter((_, index) => index !== questionIndex))}><Trash2 size={15} /></button>}</div><label>Intitulé<textarea value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder="Saisissez votre question…" rows={2} required /></label>{question.type === "short_text" ? <label>Réponses acceptées — une par ligne<textarea rows={3} value={question.acceptedAnswers.join("\n")} onChange={(event) => updateQuestion(questionIndex, { acceptedAnswers: event.target.value.split(/\n|\|/).map((item) => item.trim()) })} placeholder="Ex. friction hydroalcoolique" required /></label> : <><div className="builder-options">{question.options.map((option, optionIndex) => <label key={optionIndex} className={question.correctAnswers.includes(optionIndex) ? "correct" : ""}><input type={question.type === "multiple" ? "checkbox" : "radio"} name={`correct-${questionIndex}`} checked={question.correctAnswers.includes(optionIndex)} onChange={() => toggleCorrect(questionIndex, optionIndex)} /><span>{String.fromCharCode(65 + optionIndex)}</span><input value={option} readOnly={question.type === "true_false"} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`Réponse ${optionIndex + 1}`} required />{question.type !== "true_false" && question.options.length > 2 && <button type="button" className="icon-button" aria-label="Retirer cette réponse" onClick={() => removeOption(questionIndex, optionIndex)}><X size={14} /></button>}</label>)}</div>{(question.type === "single" || question.type === "multiple") && question.options.length < 6 && <button type="button" className="text-button add-answer" onClick={() => updateQuestion(questionIndex, { options: [...question.options, ""] })}><Plus size={14} /> Ajouter une proposition</button>}</>}<label>Explication affichée après la réponse<textarea value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} placeholder="Expliquez pourquoi la réponse est correcte…" rows={2} /></label></section>)}</div>
    <button type="button" className="secondary-button add-question" disabled={questions.length >= 100} onClick={() => setQuestions([...questions, emptyQuizQuestion()])}><Plus size={16} /> Ajouter une question</button>
    <footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={savingQuiz || loadingQuiz}><Save size={16} /> {savingQuiz ? "Enregistrement dans la base…" : quizId ? `Enregistrer les modifications (${questions.length})` : `Enregistrer dans la base (${questions.length})`}</button></footer>
  </form></Modal>;
}

function ActivityView({ onActivity }: { onActivity: (activity: AdminActivity) => void }) {
  const [logs, setLogs] = useState<AdminActivity[]>([]);
  const [loginsToday, setLoginsToday] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [inactiveUsers, setInactiveUsers] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch(`/.netlify/functions/lms-data?scope=admin&period=${period}`).then((response) => response.ok ? response.json() : Promise.reject()).then((data: { totals?: Record<string, number>; recentLogins?: Array<Record<string, unknown>>; recentActivity?: Array<Record<string, unknown>> }) => {
      setLoginsToday(data.totals?.logins_today ?? 0);
      setActiveUsers(data.totals?.active_users_period ?? 0);
      setInactiveUsers(data.totals?.inactive_users ?? 0);
      const accessLogs: AdminActivity[] = (data.recentLogins ?? []).map((item) => { const email = String(item.email ?? ""); const name = String(item.full_name ?? email ?? "Utilisateur"); const metadata = (item.metadata ?? {}) as Record<string, unknown>; return { id: String(item.id ?? `${item.occurred_at}-${email}`), name, initials: initialsFrom(name), summary: String(item.event_type ?? "login") === "login" ? "Connexion réussie" : String(item.event_type), detail: `${String(metadata.device ?? "Navigateur web")} · ${String(metadata.location ?? "Localisation non renseignée")}`, occurredAt: String(item.occurred_at ?? ""), eventType: String(item.event_type ?? "login"), entityType: "user", entityId: String(item.user_id ?? ""), linkedCourseId: "", userId: String(item.user_id ?? ""), email, matricule: String(item.matricule ?? ""), department: String(item.department ?? ""), jobTitle: String(item.job_title ?? ""), status: String(item.status ?? "active"), lastLoginAt: item.last_login_at ? String(item.last_login_at) : null, hasAvatar: Boolean(item.has_avatar) }; });
      const businessLogs: AdminActivity[] = (data.recentActivity ?? []).map((item) => { const name = String(item.full_name ?? item.email ?? "Administration"); return { id: String(item.id ?? `${item.occurred_at}-${item.event_type}`), name, initials: initialsFrom(name), summary: String(item.summary ?? "Activité enregistrée"), detail: String(item.entity_title ?? activityCategory(String(item.event_type ?? ""), String(item.entity_type ?? ""))), occurredAt: String(item.occurred_at ?? ""), eventType: String(item.event_type ?? "event"), entityType: String(item.entity_type ?? ""), entityId: String(item.entity_id ?? ""), linkedCourseId: String(item.linked_course_id ?? ""), userId: String(item.user_id ?? ""), email: String(item.email ?? ""), matricule: String(item.matricule ?? ""), department: String(item.department ?? ""), jobTitle: String(item.job_title ?? ""), status: String(item.status ?? "active"), lastLoginAt: item.last_login_at ? String(item.last_login_at) : null, hasAvatar: Boolean(item.has_avatar) }; });
      setLogs([...accessLogs, ...businessLogs].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()));
    }).catch(() => setLoadError("Le journal des connexions n’a pas pu être chargé.")).finally(() => setLoading(false));
  }, [period]);
  const categories = [
    "Tous",
    ...Array.from(new Set(logs.map((item) => activityCategory(item.eventType, item.entityType)))).sort(),
  ];
  const filtered = logs.filter((item) => (category === "Tous" || activityCategory(item.eventType, item.entityType) === category) && `${item.name} ${item.email} ${item.summary} ${item.detail} ${item.department}`.toLowerCase().includes(query.toLowerCase()));
  const groupedLogs = Array.from(new Set(filtered.map((item) => dateGroupLabel(item.occurredAt)))).map((label) => ({ label, items: filtered.filter((item) => dateGroupLabel(item.occurredAt) === label) }));
  const exportLogs = () => { const csv = [["Catégorie", "Utilisateur", "E-mail", "Date", "Événement", "Élément"], ...filtered.map((item) => [activityCategory(item.eventType, item.entityType), item.name, item.email, formatDateTime(item.occurredAt), item.summary, item.detail])].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "journal-intelligent-walyah.csv"; link.click(); URL.revokeObjectURL(url); };
  return <>
    <section className="page-heading"><div><span className="eyebrow">Traçabilité intelligente</span><h1>Journal des connexions et activités</h1><p>Les événements sont classés par période, nature et élément concerné pour faciliter l’analyse.</p></div><button className="secondary-button" onClick={exportLogs} disabled={!filtered.length}><Download size={17} /> Exporter la sélection</button></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="metric-grid admin-metrics compact-metrics">
      <article className="metric-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Connexions aujourd’hui</span><strong>{loginsToday}</strong><small>événements enregistrés</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-blue-soft"><Clock3 size={21} /></div><div><span>Utilisateurs actifs</span><strong>{activeUsers}</strong><small>sur les {period} derniers jours</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-violet-soft"><TrendingUp size={21} /></div><div><span>Événements affichés</span><strong>{filtered.length}</strong><small>sur {logs.length} événements</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-coral-soft"><CircleHelp size={21} /></div><div><span>Comptes inactifs</span><strong>{inactiveUsers}</strong><small className="warning">à contrôler</small></div></article>
    </section>
    <section className="smart-log-controls"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, e-mail, formation, événement…" /></label><div className="period-switch">{[7, 30, 90].map((days) => <button key={days} className={period === days ? "active" : ""} onClick={() => setPeriod(days)}>{days} jours</button>)}</div><div className="filter-pills"><Filter size={16} />{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    {groupedLogs.length ? <div className="smart-log-groups">{groupedLogs.map((group) => <section className="panel smart-log-group" key={group.label}><header><div><span className="activity-dot teal" /><h2>{group.label}</h2></div><strong>{group.items.length} événement{group.items.length > 1 ? "s" : ""}</strong></header><div>{group.items.map((log) => <button key={log.id} className="smart-log-row" onClick={() => onActivity(log)}><UserAvatar name={log.name} initials={log.initials} src={log.hasAvatar && log.userId ? avatarEndpoint(log.userId) : undefined} /><span className="smart-log-person"><strong>{log.name}</strong><small>{log.email || log.department || "Événement système"}</small></span><span className="smart-log-event"><strong>{log.summary}</strong><small>{log.detail}</small></span><span className={`status-tag log-category-${activityCategory(log.eventType, log.entityType).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "")}`}>{activityCategory(log.eventType, log.entityType)}</span><time>{formatDateTime(log.occurredAt)}</time><ChevronRight size={16} /></button>)}</div></section>)}</div> : <section className="panel table-empty log-empty"><Clock3 size={22} /><strong>{loading ? "Chargement du journal…" : "Aucun événement correspondant"}</strong><span>Modifiez la période, la catégorie ou la recherche.</span></section>}
  </>;
}

function SettingsView({ session, profile, onAvatarUpdated }: { session: Session; profile: LearnerProfile | null; onAvatarUpdated: (url: string) => void }) {
  const isStaff = session.role !== "learner";
  const [uploading, setUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setAvatarMessage("Choisissez une image JPG, PNG ou WebP."); return; }
    if (file.size > 4 * 1024 * 1024) { setAvatarMessage("La photo ne doit pas dépasser 4 Mo."); return; }
    if (!usesNetlifyIdentity()) { setAvatarMessage("L’enregistrement de la photo sera actif sur votre domaine Netlify."); return; }
    setUploading(true); setAvatarMessage("");
    try {
      const form = new FormData(); form.append("purpose", "avatar"); form.append("file", file);
      const response = await fetch("/.netlify/functions/upload", { method: "POST", body: form });
      const data = await response.json() as { error?: string; avatarUrl?: string };
      if (!response.ok) throw new Error(data.error || "Import impossible");
      const url = `${data.avatarUrl || avatarEndpoint("me")}${(data.avatarUrl || avatarEndpoint("me")).includes("?") ? "&" : "?"}v=${Date.now()}`;
      onAvatarUpdated(url);
      setAvatarMessage("Votre photo de profil a bien été enregistrée.");
    } catch (error) { setAvatarMessage(error instanceof Error ? error.message : "Import impossible"); }
    finally { setUploading(false); }
  };
  return <><section className="page-heading"><div><span className="eyebrow">Configuration</span><h1>{isStaff ? "Paramètres de la plateforme" : "Mon profil"}</h1><p>{isStaff ? "Consultez votre niveau d’accès et la configuration reconnue." : "Personnalisez votre profil et consultez vos informations professionnelles."}</p></div>{session.role === "super_admin" && <span className="count-badge"><ShieldCheck size={15} /> Super-administration active</span>}</section><section className="settings-grid"><article className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">Compte</span><h3>Informations générales</h3></div>{isStaff ? <UserAvatar name={session.name} initials={session.initials} className="large-avatar" /> : <div className="profile-photo-editor"><UserAvatar name={session.name} initials={session.initials} src={profile?.avatarUrl} className="large-avatar" /><label className="avatar-upload-button"><Camera size={15} /> {uploading ? "Import…" : "Modifier"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={uploading} /></label></div>}</div>{avatarMessage && <p className="content-feedback" role="status">{avatarMessage}</p>}<dl className="account-summary"><div><dt>Nom complet</dt><dd>{profile?.fullName || session.name}</dd></div><div><dt>Adresse e-mail</dt><dd>{profile?.email || session.email}</dd></div><div><dt>Fonction</dt><dd>{isStaff ? roleLabel(session.role) : profile?.jobTitle || "Non renseignée"}</dd></div><div><dt>Service</dt><dd>{isStaff ? "Administration de la plateforme" : profile?.department || "Non renseigné"}</dd></div></dl><div className="neutral-note"><ShieldCheck size={17} /><span><strong>Informations issues du compte sécurisé</strong><small>{isStaff ? "Les changements d’identité et de rôle sont tracés." : "La photo est stockée dans votre espace sécurisé et reste modifiable."}</small></span></div></article><article className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">Notifications</span><h3>Événements suivis</h3></div><Bell size={20} /></div><div className="notification-summary"><span><CheckCircle2 size={18} /><span><strong>Nouvelles affectations</strong><small>Notification lors de l’ajout d’une formation.</small></span></span><span><CheckCircle2 size={18} /><span><strong>Échéances</strong><small>Rappel avant une date limite définie.</small></span></span><span><CheckCircle2 size={18} /><span><strong>Résultats</strong><small>Confirmation après validation et certificat.</small></span></span></div></article></section>{session.role === "super_admin" && <section className="panel superadmin-card"><div><span className="eyebrow">Gouvernance des accès</span><h2>Rôles administratifs</h2><p>Les rôles sensibles sont gérés depuis le tableau de bord super-administrateur, puis vérifiés à nouveau par les fonctions serveur.</p></div><div className="role-matrix"><span><strong>Super-administrateur</strong><small>Accès complet, rôles, intégrations et audit</small></span><span><strong>Administrateur</strong><small>Apprenants, contenus, QCM et suivi</small></span><span><strong>Apprenant</strong><small>Uniquement les parcours qui lui sont assignés</small></span></div></section>}</>;
}

export default function LmsApp({ initialSession = null }: { initialSession?: Session | null }) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [passwordReset, setPasswordReset] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [learnerWorkspace, setLearnerWorkspace] = useState<LearnerWorkspace>({ loading: Boolean(initialSession?.role === "learner"), error: "", courses: [], certificates: [], activity: [], profile: null });
  const [view, setView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(null);
  const [quizMode, setQuizMode] = useState(false);
  const [focusedCourseId, setFocusedCourseId] = useState("");
  const [focusedCatalogCode, setFocusedCatalogCode] = useState("");
  const [workspaceRevision, setWorkspaceRevision] = useState(0);

  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void import("@netlify/identity").then(async (identity) => {
      try {
        const callback = await identity.handleAuthCallback();
        if (callback?.type === "recovery") {
          setSession(null);
          setPasswordReset(true);
          setAuthNotice("");
          return;
        }
        if (callback?.type === "confirmation") {
          await identity.logout();
          setSession(null);
          setAuthNotice("Votre adresse e-mail est confirmée. Vous pouvez maintenant vous connecter avec le mot de passe choisi lors de l’inscription.");
          return;
        }
        if (callback?.type === "invite") {
          setSession(null);
          setAuthNotice("Cette invitation doit être finalisée depuis l’e-mail reçu. Demandez un nouveau lien si celui-ci a expiré.");
          return;
        }
        const user = callback?.user ?? await identity.getUser();
        if (!user) return;
        const restored = sessionFromIdentity(user as unknown as IdentityCandidate);
        if (restored.role === "learner") setLearnerWorkspace({ loading: true, error: "", courses: [], certificates: [], activity: [], profile: null });
        setSession(restored);
      } catch (error) {
        setSession(null);
        setPasswordReset(false);
        setAuthNotice(authErrorMessage(error));
      }
    });
  }, []);

  useEffect(() => {
    if (!session || session.role !== "learner" || !usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data").then(async (response) => {
      const data = await response.json() as { error?: string; profile?: Record<string, unknown>; courses?: Array<Record<string, unknown>>; certificates?: Array<Record<string, unknown>>; activity?: Array<Record<string, unknown>> };
      if (!response.ok) throw new Error(data.error || "Chargement impossible");
      const profile = data.profile ? { fullName: String(data.profile.full_name ?? session.name), email: String(data.profile.email ?? session.email), matricule: String(data.profile.matricule ?? ""), department: String(data.profile.department ?? ""), jobTitle: String(data.profile.job_title ?? ""), location: String(data.profile.location ?? ""), avatarUrl: Boolean(data.profile.has_avatar) ? avatarEndpoint("me") : undefined } : null;
      setLearnerWorkspace({
        loading: false, error: "", profile,
        courses: (data.courses ?? []).map(courseFromRow),
        certificates: (data.certificates ?? []).map((item) => {
          let metadata: Record<string, unknown> = {};
          if (item.metadata && typeof item.metadata === "object") metadata = item.metadata as Record<string, unknown>;
          else if (typeof item.metadata === "string") { try { metadata = JSON.parse(item.metadata) as Record<string, unknown>; } catch { metadata = {}; } }
          return {
            certificateNumber: String(item.certificate_number), courseId: String(item.course_id), courseCode: String(item.course_code ?? metadata.courseCode ?? "WA"), courseTitle: String(item.course_title ?? metadata.courseTitle ?? "Formation"),
            score: item.score === null || item.score === undefined ? null : Number(item.score), issuedAt: String(item.issued_at ?? ""), courseCategory: String(item.course_category ?? metadata.category ?? "Formation professionnelle"), courseDurationMinutes: Number(item.course_duration_minutes ?? metadata.durationMinutes ?? 0),
            learnerName: metadata.learnerName ? String(metadata.learnerName) : undefined, learnerEmail: metadata.learnerEmail ? String(metadata.learnerEmail) : undefined, matricule: metadata.matricule ? String(metadata.matricule) : undefined,
            department: metadata.department ? String(metadata.department) : undefined, jobTitle: metadata.jobTitle ? String(metadata.jobTitle) : undefined, location: metadata.location ? String(metadata.location) : undefined,
          };
        }),
        activity: (data.activity ?? []).map((item) => ({ type: String(item.event_type ?? "event"), summary: String(item.summary ?? "Activité enregistrée"), occurredAt: String(item.occurred_at ?? "") })),
      });
    }).catch((error) => setLearnerWorkspace({ loading: false, error: error instanceof Error ? error.message : "Chargement impossible", courses: [], certificates: [], activity: [], profile: null }));
  }, [session, workspaceRevision]);

  const openAdminActivity = useCallback((activity: AdminActivity) => {
    setSelectedCourse(null); setQuizMode(false);
    if (activity.linkedCourseId) { setFocusedCourseId(activity.linkedCourseId); setView("trainings"); return; }
    if (activity.userId) { setSelectedLearner(learnerFromActivity(activity)); return; }
    if (activity.entityType === "quiz") { setView("quizzes"); return; }
    if (activityCategory(activity.eventType, activity.entityType) === "Intégration") { setView("settings"); return; }
    setView("activity");
  }, []);

  const openSearchResult = useCallback((result: GlobalSearchResult) => {
    setSelectedCourse(null); setSelectedLearner(null); setQuizMode(false);
    if (result.kind === "navigation" && result.view) { setView(result.view); return; }
    if (result.kind === "learner" && result.learner) { setSelectedLearner(result.learner); return; }
    if (result.kind === "catalog" && result.code) { setFocusedCatalogCode(result.code); setView("catalog"); return; }
    if (result.kind === "course" && result.entityId) {
      if (session?.role === "learner") {
        const assigned = learnerWorkspace.courses.find((course) => course.id === result.entityId || course.code === result.code);
        if (assigned) { setSelectedCourse(assigned); setView("catalogue"); }
        return;
      }
      setFocusedCourseId(result.entityId); setView("trainings");
    }
  }, [learnerWorkspace.courses, session?.role]);

  const content = useMemo(() => {
    if (!session) return null;
    if (selectedLearner) return <LearnerProfileView learner={selectedLearner} onBack={() => setSelectedLearner(null)} />;
    if (selectedCourse) {
      if (quizMode) return <QuizView course={selectedCourse} onBack={() => setQuizMode(false)} onCertificate={() => { setQuizMode(false); setSelectedCourse(null); setWorkspaceRevision((current) => current + 1); setView("certificates"); }} />;
      return <CourseDetail course={selectedCourse} onBack={() => { setSelectedCourse(null); setView("catalogue"); }} onQuiz={() => setQuizMode(true)} onCertificate={() => { setSelectedCourse(null); setWorkspaceRevision((current) => current + 1); setView("certificates"); }} />;
    }
    switch (view) {
      case "dashboard": return session.role === "super_admin" ? <SuperAdminDashboard onView={setView} onActivity={openAdminActivity} /> : session.role === "admin" ? <AdminDashboard onView={setView} onActivity={openAdminActivity} /> : <LearnerDashboard name={session.name} workspace={learnerWorkspace} onView={setView} onCourse={setSelectedCourse} />;
      case "catalogue": return <CatalogueView assignedCourses={learnerWorkspace.courses} loading={learnerWorkspace.loading} onCourse={setSelectedCourse} />;
      case "catalog": return <FullCatalogueView onCourse={setSelectedCourse} focusCode={focusedCatalogCode || undefined} onFocusHandled={() => setFocusedCatalogCode("")} />;
      case "certificates": return <CertificatesView session={session} profile={learnerWorkspace.profile} certificates={learnerWorkspace.certificates} loading={learnerWorkspace.loading} />;
      case "users": return <UsersView onLearner={setSelectedLearner} />;
      case "trainings": return <TrainingsView focusCourseId={focusedCourseId || undefined} onFocusHandled={() => setFocusedCourseId("")} onView={setView} />;
      case "quizzes": return <QuizzesView />;
      case "activity": return <ActivityView onActivity={openAdminActivity} />;
      case "settings": return <SettingsView session={session} profile={learnerWorkspace.profile} onAvatarUpdated={(avatarUrl) => setLearnerWorkspace((current) => ({ ...current, profile: current.profile ? { ...current.profile, avatarUrl } : { fullName: session.name, email: session.email, matricule: "", department: "", jobTitle: "", location: "", avatarUrl } }))} />;
      default: return null;
    }
  }, [focusedCatalogCode, focusedCourseId, learnerWorkspace, openAdminActivity, quizMode, selectedCourse, selectedLearner, session, view]);

  const logoutSession = async () => {
    if (session?.authProvider === "netlify" && usesNetlifyIdentity()) {
      try { const identity = await import("@netlify/identity"); await identity.logout(); } catch { /* Clear local UI even if the request fails. */ }
    }
    setSession(null); setAuthNotice(""); setView("dashboard"); setSelectedCourse(null); setSelectedLearner(null); setQuizMode(false); setLearnerWorkspace({ loading: false, error: "", courses: [], certificates: [], activity: [], profile: null });
  };

  const authenticateSession = (nextSession: Session) => {
    setLearnerWorkspace(nextSession.role === "learner" ? { loading: true, error: "", courses: [], certificates: [], activity: [], profile: null } : { loading: false, error: "", courses: [], certificates: [], activity: [], profile: null });
    setAuthNotice("");
    setPasswordReset(false);
    setSession(nextSession);
  };

  if (passwordReset) return <PasswordResetScreen onComplete={(message) => { setPasswordReset(false); setAuthNotice(message); }} onCancel={() => { void import("@netlify/identity").then((identity) => identity.logout()).catch(() => undefined); setPasswordReset(false); setAuthNotice("Réinitialisation annulée. Vous pouvez demander un nouveau lien depuis la page de connexion."); }} />;
  if (!session) return <AuthScreen key={authNotice || "auth"} onAuthenticated={authenticateSession} initialMessage={authNotice} />;
  return <div className="app-shell"><Sidebar role={session.role} view={view} onView={(next) => { setSelectedCourse(null); setSelectedLearner(null); setQuizMode(false); setView(next); }} open={sidebarOpen} onClose={() => setSidebarOpen(false)} /><div className="app-main"><Topbar session={session} avatarUrl={session.role === "learner" ? learnerWorkspace.profile?.avatarUrl : undefined} assignedCourses={learnerWorkspace.courses} onSearchResult={openSearchResult} onMenu={() => setSidebarOpen(true)} onLogout={logoutSession} /><main className="page-content">{content}</main></div></div>;
}
