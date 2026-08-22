"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Archive, ArrowLeft, Award, Bell, BookOpen, Check, CheckCircle2,
  Camera, ChevronDown, ChevronRight, Circle, CircleHelp, ClipboardCheck, Clock3, Download,
  Edit3, ExternalLink, Eye, EyeOff, FileAudio, FileQuestion, FileText, FileUp, FileVideo, Filter, GripVertical, Inbox, LayoutDashboard,
  KeyRound, LibraryBig, Link2, LockKeyhole, LogOut, Menu, MoreHorizontal, Play, Plus,
  Save, Search, Send, Settings, ShieldCheck, Sparkles, Table2, Trash2, TrendingUp,
  UploadCloud, UserCog, UserPlus, UserRound, UsersRound, Video, X,
} from "lucide-react";
import {
  catalogueTotals, courses, readyCourseByCode, trainingCatalogue,
  type CatalogCourse, type Course, type Learner,
} from "./data";
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
};

type ActivityRecord = { type: string; summary: string; occurredAt: string };
type LearnerProfile = { fullName: string; email: string; department: string; jobTitle: string; avatarUrl?: string };
type LearnerWorkspace = {
  loading: boolean;
  error: string;
  courses: Course[];
  certificates: CertificateRecord[];
  activity: ActivityRecord[];
  profile: LearnerProfile | null;
};

type AdminActivity = { name: string; initials: string; summary: string; detail: string; occurredAt: string };
type AdminAccount = { id: string; name: string; email: string; role: Role; status: string; lastLoginAt: string | null };
type RoleAudit = { id: string; actorName: string; targetName: string; previousRole: Role | null; newRole: Role; occurredAt: string };
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
  admins: number;
  superAdmins: number;
  passportConnected: number;
  integrationsPending: number;
  integrationsFailed: number;
  activities: AdminActivity[];
  loginSeries: number[];
};

const EMPTY_ADMIN: AdminSnapshot = {
  learners: 0, publishedCourses: 0, certificates: 0, loginsToday: 0, overdue: 0,
  completedEnrollments: 0, inProgressEnrollments: 0, assignedEnrollments: 0,
  completionRate: 0, inactiveUsers: 0, activeUsers7d: 0, admins: 0, superAdmins: 0,
  passportConnected: 0, integrationsPending: 0, integrationsFailed: 0,
  activities: [], loginSeries: [0, 0, 0, 0, 0, 0, 0],
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
    category: item.axis,
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

function courseFromRow(row: Record<string, unknown>): Course {
  const id = String(row.id ?? `course-${String(row.code ?? "unknown")}`);
  const template = courses.find((item) => item.id === id || item.code === String(row.code ?? ""));
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
    category: String(row.category ?? template?.category ?? "Formation"),
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
  const [showSignup, setShowSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
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
      const createdOrLogged = showSignup ? await identity.signup(email.trim().toLowerCase(), password, { full_name: fullName.trim() }) : await identity.login(email.trim().toLowerCase(), password);
      const authenticated = showSignup ? await identity.getUser() : createdOrLogged;
      if (showSignup && !authenticated) {
        setShowSignup(false);
        setPassword("");
        setMessage("Compte créé. Consultez votre e-mail pour confirmer votre adresse, puis connectez-vous.");
        return;
      }
      onAuthenticated(sessionFromIdentity(authenticated as unknown as IdentityCandidate, email, fullName.trim()));
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
          <div className="auth-heading"><span className="status-pill"><span /> Accès sécurisé</span><h2>{showSignup ? "Créer votre compte" : "Heureux de vous revoir"}</h2><p>{showSignup ? "Rejoignez votre espace de formation." : "Connectez-vous pour poursuivre votre parcours."}</p></div>
          <form onSubmit={submit}>
            {showSignup && <label className="field-label">Nom complet<span className="input-wrap"><UserRound size={18} /><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Votre nom et prénom" required /></span></label>}
            <label className="field-label">Adresse e-mail<span className="input-wrap"><span className="at-icon">@</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@walyah-academie.com" required /></span></label>
            <label className="field-label"><span className="label-row"><span>Mot de passe</span><button type="button" className="text-button" onClick={recoverPassword} disabled={loading}>Mot de passe oublié ?</button></span><span className="input-wrap"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" minLength={8} required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Traitement…" : showSignup ? "Créer mon compte" : "Se connecter"}<ChevronRight size={18} /></button>
          </form>
          <p className="auth-switch">{showSignup ? "Vous avez déjà un compte ?" : "Première connexion ?"} <button type="button" className="text-button strong" onClick={() => { setShowSignup(!showSignup); setMessage(""); setPassword(""); }}>{showSignup ? "Se connecter" : "Créer un compte"}</button></p>
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

function Topbar({ session, avatarUrl, onMenu, onLogout }: { session: Session; avatarUrl?: string; onMenu: () => void; onLogout: () => void }) {
  return <header className="topbar">
    <button className="icon-button mobile-menu" aria-label="Ouvrir le menu" onClick={onMenu}><Menu size={21} /></button>
    <div className="global-search"><Search size={18} /><input aria-label="Rechercher" placeholder={session.role === "learner" ? "Rechercher une formation…" : "Rechercher un apprenant, une formation…"} /><kbd>⌘ K</kbd></div>
    <div className="topbar-brand"><Brand compact /></div>
    <div className="topbar-actions"><div className="profile-chip"><UserAvatar name={session.name} initials={session.initials} src={avatarUrl} /><span className="profile-copy"><strong>{session.name}</strong><small>{roleLabel(session.role)}</small></span><button className="icon-button" aria-label="Se déconnecter" title="Se déconnecter" onClick={onLogout}><LogOut size={18} /></button></div><button className="icon-button notification-button" aria-label="Ouvrir les notifications" title="Notifications"><Bell size={20} /></button></div>
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

function useAdminWorkspace() {
  const [metrics, setMetrics] = useState<AdminSnapshot>(EMPTY_ADMIN);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [roleAudit, setRoleAudit] = useState<RoleAudit[]>([]);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then(async (response) => {
      const data = await response.json() as { error?: string; totals?: Record<string, number>; recentActivity?: Array<Record<string, unknown>>; dailyLogins?: Array<Record<string, unknown>>; accounts?: Array<Record<string, unknown>>; roleAudit?: Array<Record<string, unknown>> };
      if (!response.ok) throw new Error(data.error || "Chargement impossible");
      return data;
    }).then((data) => {
      const totals = data.totals ?? {};
      const loginMap = new Map((data.dailyLogins ?? []).map((item) => [String(item.day), Number(item.count ?? 0)]));
      const loginSeries = Array.from({ length: 7 }, (_, offset) => {
        const day = new Date(); day.setDate(day.getDate() - (6 - offset));
        return loginMap.get(day.toISOString().slice(0, 10)) ?? 0;
      });
      setMetrics({
        learners: Number(totals.learners ?? 0), publishedCourses: Number(totals.published_courses ?? 0), certificates: Number(totals.certificates ?? 0),
        loginsToday: Number(totals.logins_today ?? 0), overdue: Number(totals.overdue ?? 0), completedEnrollments: Number(totals.completed_enrollments ?? 0),
        inProgressEnrollments: Number(totals.in_progress_enrollments ?? 0), assignedEnrollments: Number(totals.assigned_enrollments ?? 0),
        completionRate: Number(totals.completion_rate ?? 0), inactiveUsers: Number(totals.inactive_users ?? 0), activeUsers7d: Number(totals.active_users_7d ?? 0),
        admins: Number(totals.admins ?? 0), superAdmins: Number(totals.super_admins ?? 0), passportConnected: Number(totals.passport_connected ?? 0),
        integrationsPending: Number(totals.integrations_pending ?? 0), integrationsFailed: Number(totals.integrations_failed ?? 0), loginSeries,
        activities: (data.recentActivity ?? []).map((item) => { const name = String(item.full_name ?? item.email ?? "Utilisateur"); return { name, initials: initialsFrom(name), summary: String(item.summary ?? "Activité enregistrée"), detail: String(item.entity_title ?? item.event_type ?? ""), occurredAt: String(item.occurred_at ?? "") }; }),
      });
      setAccounts((data.accounts ?? []).map((item) => ({ id: String(item.id), name: String(item.full_name ?? item.email ?? "Utilisateur"), email: String(item.email ?? ""), role: roleFromClaims([String(item.role ?? "learner")]), status: String(item.status ?? "active"), lastLoginAt: item.last_login_at ? String(item.last_login_at) : null })));
      setRoleAudit((data.roleAudit ?? []).map((item) => ({ id: String(item.id), actorName: String(item.actor_name ?? "Administration"), targetName: String(item.target_name ?? "Utilisateur"), previousRole: item.previous_role ? roleFromClaims([String(item.previous_role)]) : null, newRole: roleFromClaims([String(item.new_role)]), occurredAt: String(item.occurred_at ?? "") })));
    }).catch(() => { setMetrics(EMPTY_ADMIN); setLoadError("Les indicateurs n’ont pas pu être chargés depuis la base Netlify."); }).finally(() => setLoading(false));
  }, []);
  return { metrics, accounts, setAccounts, roleAudit, loading, loadError };
}

function AdminDashboard({ onView }: { onView: (view: View) => void }) {
  const { metrics, loading, loadError } = useAdminWorkspace();
  const maxLogins = Math.max(...metrics.loginSeries, 1);
  return <>
    <section className="page-heading"><div><span className="eyebrow">Pilotage opérationnel</span><h1>Tableau de bord administrateur</h1><p>Affectez les formations, suivez les progrès et relancez les apprenants au bon moment.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => onView("users")}><UserPlus size={17} /> Gérer les apprenants</button><button className="primary-button" onClick={() => onView("trainings")}><BookOpen size={17} /> Nouvelle formation</button></div></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="metric-grid admin-metrics">
      <article className="metric-card admin-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Apprenants inscrits</span><strong>{loading ? "…" : metrics.learners}</strong><small>Comptes réels dans la base</small></div><span className="mini-label">{metrics.publishedCourses} parcours publiés</span></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-blue-soft"><TrendingUp size={21} /></div><div><span>Taux de complétion</span><strong>{metrics.completionRate} %</strong><small>Sur les affectations réelles</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-violet-soft"><Award size={21} /></div><div><span>Certificats délivrés</span><strong>{metrics.certificates}</strong><small>Historique consolidé</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-coral-soft"><CircleHelp size={21} /></div><div><span>À relancer</span><strong>{metrics.overdue}</strong><small className="warning">Échéance dépassée</small></div></article>
    </section>
    <section className="admin-main-grid">
      <article className="panel completion-panel"><div className="panel-heading"><div><span className="eyebrow">Progression</span><h3>Niveau d’avancement</h3></div></div><div className="completion-layout"><div className="big-progress"><ProgressRing value={metrics.completionRate} size={150} /><span>Taux moyen</span></div><div className="completion-breakdown"><div><span><i className="key-dot complete" /> Terminées</span><strong>{metrics.completedEnrollments}</strong><small>affectations</small></div><div><span><i className="key-dot current" /> En cours</span><strong>{metrics.inProgressEnrollments}</strong><small>affectations</small></div><div><span><i className="key-dot late" /> En retard</span><strong>{metrics.overdue}</strong><small>affectations</small></div></div></div><button className="secondary-button full-button" onClick={() => onView("users")}>Consulter le suivi détaillé <ChevronRight size={16} /></button></article>
      <article className="panel engagement-panel"><div className="panel-heading"><div><span className="eyebrow">Engagement</span><h3>Connexions récentes</h3></div><button className="text-button strong" onClick={() => onView("activity")}>Voir le journal</button></div><div className="engagement-summary"><div><strong>{metrics.loginsToday}</strong><span>connexion{metrics.loginsToday > 1 ? "s" : ""} aujourd’hui</span></div><span className="positive-chip">Suivi actif</span></div><div className="day-bars" aria-label="Connexions des sept derniers jours">{metrics.loginSeries.map((count, index) => <div key={index} title={`${count} connexion${count > 1 ? "s" : ""}`}><span style={{ height: `${Math.max(4, Math.round((count / maxLogins) * 100))}%` }} /><small>{["J-6", "J-5", "J-4", "J-3", "J-2", "J-1", "J"][index]}</small></div>)}</div><div className="peak-note"><TrendingUp size={17} /><span><strong>Données alimentées à chaque connexion</strong><small>{metrics.inactiveUsers} compte{metrics.inactiveUsers > 1 ? "s" : ""} inactif{metrics.inactiveUsers > 1 ? "s" : ""}</small></span></div></article>
    </section>
    <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">En direct</span><h3>Activité récente</h3></div><button className="text-button strong" onClick={() => onView("activity")}>Tout afficher <ChevronRight size={15} /></button></div>{metrics.activities.length ? <div className="activity-list">{metrics.activities.map((activity, index) => <div className="activity-item" key={`${activity.occurredAt}-${index}`}><span className="avatar avatar-teal">{activity.initials}</span><div className="activity-copy"><p><strong>{activity.name}</strong></p><span>{activity.summary}</span></div><span className="activity-detail">{activity.detail}</span><time>{formatDateTime(activity.occurredAt)}</time></div>)}</div> : <div className="table-empty"><TrendingUp size={22} /><strong>Aucune activité enregistrée</strong><span>Les événements apparaîtront après les premières affectations.</span></div>}</section>
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

function SuperAdminDashboard({ onView }: { onView: (view: View) => void }) {
  const { metrics, accounts, setAccounts, roleAudit, loading, loadError } = useAdminWorkspace();
  const updateAccount = (updated: AdminAccount) => setAccounts((current) => current.map((account) => account.id === updated.id ? updated : account));
  return <>
    <section className="page-heading"><div><span className="eyebrow">Gouvernance de la plateforme</span><h1>Tableau de bord super-administrateur</h1><p>Contrôlez les accès, la santé des intégrations et l’activité globale du LMS.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => onView("activity")}><TrendingUp size={17} /> Consulter les journaux</button><button className="primary-button" onClick={() => onView("users")}><UsersRound size={17} /> Ouvrir les apprenants</button></div></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="metric-grid admin-metrics superadmin-metrics">
      <article className="metric-card admin-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Apprenants</span><strong>{loading ? "…" : metrics.learners}</strong><small>{metrics.activeUsers7d} actif{metrics.activeUsers7d > 1 ? "s" : ""} sur 7 jours</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-blue-soft"><UserCog size={21} /></div><div><span>Administrateurs</span><strong>{metrics.admins}</strong><small>Gestion opérationnelle</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-violet-soft"><ShieldCheck size={21} /></div><div><span>Super-administrateurs</span><strong>{metrics.superAdmins}</strong><small>Gouvernance sensible</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-coral-soft"><Link2 size={21} /></div><div><span>Passeports connectés</span><strong>{metrics.passportConnected}</strong><small>{metrics.integrationsPending} événement{metrics.integrationsPending > 1 ? "s" : ""} en attente</small></div></article>
    </section>
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
  return <>
    <section className="page-heading"><div><span className="eyebrow">Votre bibliothèque</span><h1>Mes formations</h1><p>Retrouvez vos parcours, vos échéances et les modules déjà validés.</p></div><span className="count-badge">{filtered.length} formation{filtered.length > 1 ? "s" : ""}</span></section>
    <section className="catalogue-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans mes formations…" /></label><div className="filter-pills"><Filter size={16} />{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    {loading ? <section className="empty-state compact-empty"><Clock3 size={28} /><h2>Chargement de vos formations…</h2></section> : filtered.length ? <div className="course-grid catalogue-grid">{filtered.map((course) => <CourseCard key={course.id} course={course} onOpen={onCourse} />)}</div> : <section className="empty-state compact-empty"><span className="empty-icon"><Inbox size={28} /></span><h2>{assignedCourses.length ? "Aucun résultat" : "Aucune formation assignée"}</h2><p>{assignedCourses.length ? "Essayez un autre mot-clé ou retirez le filtre actif." : "Seuls les parcours attribués par un administrateur apparaîtront dans cet espace."}</p></section>}
  </>;
}

function FullCatalogueView({ onCourse }: { onCourse: (course: Course) => void }) {
  const [query, setQuery] = useState("");
  const [axis, setAxis] = useState("Tous les axes");
  const [source, setSource] = useState("Tous les catalogues");
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<CatalogCourse | null>(null);
  const [preparing, setPreparing] = useState<{ course: Course; catalog: CatalogCourse } | null>(null);
  const [catalogStates, setCatalogStates] = useState<Record<string, { id: string; lifecycle: string }>>({});
  const axes = ["Tous les axes", ...Array.from(new Set(trainingCatalogue.map((item) => item.axis))).sort()];
  const sources = ["Tous les catalogues", ...Array.from(new Set(trainingCatalogue.map((item) => item.source)))];
  const filtered = trainingCatalogue.filter((item) => {
    const haystack = `${item.code} ${item.title} ${item.theme} ${item.audience} ${item.description ?? ""} ${item.objective ?? ""}`.toLowerCase();
    return (axis === "Tous les axes" || item.axis === axis) && (source === "Tous les catalogues" || item.source === source) && haystack.includes(query.toLowerCase());
  });
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=catalog").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { courses?: Array<Record<string, unknown>> }) => {
      setCatalogStates(Object.fromEntries((data.courses ?? []).map((item) => [String(item.code), { id: String(item.id), lifecycle: String(item.lifecycle_status ?? "catalog") }])));
    }).catch(() => undefined);
  }, []);
  return <>
    <section className="page-heading catalogue-heading"><div><span className="eyebrow">Offre Walyah Académie 2026</span><h1>Catalogues de formations</h1><p>{catalogueTotals.complete} formations métiers, soft skills, IA et cybersécurité, complétées par {catalogueTotals.medical} formations médicales détaillées.</p></div><div className="catalogue-downloads"><span className="count-badge"><BookOpen size={15} /> {catalogueTotals.all} formations intégrées</span><a className="secondary-button" href="/catalogues/catalogue-walyah-academie-2026-complet.pdf" target="_blank" rel="noreferrer"><FileText size={15} /> Catalogue complet</a><a className="secondary-button" href="/catalogues/catalogue-formations-medicales-2026.pdf" target="_blank" rel="noreferrer"><FileText size={15} /> Catalogue médical</a></div></section>
    <section className="catalogue-insights"><article><strong>{catalogueTotals.all}</strong><span>formations indexées</span></article><article><strong>2</strong><span>catalogues 2026</span></article><article><strong>{courses.length}</strong><span>parcours déjà scénarisés</span></article><article><strong>1 clic</strong><span>pour ouvrir une fiche</span></article></section>
    <section className="catalogue-toolbar admin-catalogue-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} placeholder="Code, titre, thème, public…" /></label><select value={axis} onChange={(event) => { setAxis(event.target.value); setLimit(24); }}>{axes.map((item) => <option key={item}>{item}</option>)}</select><select value={source} onChange={(event) => { setSource(event.target.value); setLimit(24); }}>{sources.map((item) => <option key={item}>{item}</option>)}</select><span>{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span></section>
    {filtered.length ? <><div className="master-catalogue-grid">{filtered.slice(0, limit).map((item) => { const ready = readyCourseByCode.get(item.code); const lifecycle = catalogStates[item.code]?.lifecycle; return <button className="catalogue-entry" key={item.code} onClick={() => setSelected(item)}><div><span className="course-code">{item.code}</span>{ready || lifecycle === "published" ? <span className="status-tag status-actif">Prêt dans le LMS</span> : lifecycle === "draft" ? <span className="status-tag status-relancer">En préparation</span> : <span className="status-tag status-draft">Catalogue</span>}</div><h2>{item.title}</h2><p>{item.objective ?? item.description}</p><footer><span><Clock3 size={14} /> {item.duration}</span><span>{item.axis}</span><ChevronRight size={17} /></footer></button>; })}</div>{limit < filtered.length && <div className="load-more"><button className="secondary-button" onClick={() => setLimit(Math.min(limit + 24, filtered.length))}>Afficher 24 formations de plus</button></div>}</> : <section className="empty-state compact-empty"><Search size={28} /><h2>Aucune formation trouvée</h2><p>Modifiez les filtres ou essayez un terme plus général.</p></section>}
    {selected && <Modal title={`${selected.code} · ${selected.title}`} onClose={() => setSelected(null)} wide><div className="catalogue-detail"><div className="catalogue-detail-meta"><span>{selected.axis}</span><span><Clock3 size={14} /> {selected.duration}</span><span><UsersRound size={14} /> {selected.audience}</span></div>{selected.need && <section><span className="form-section-title">Besoin professionnel</span><p>{selected.need}</p></section>}<section><span className="form-section-title">Objectif</span><p>{selected.objective ?? selected.description}</p></section>{selected.program?.length ? <section><span className="form-section-title">Programme proposé</span><ol>{selected.program.map((item) => <li key={item}>{item}</li>)}</ol></section> : <section><span className="form-section-title">Thème du catalogue</span><p>{selected.theme}</p></section>}{selected.methods && <section><span className="form-section-title">Méthodes pédagogiques</span><p>{selected.methods}</p></section>}{selected.benefit && <section><span className="form-section-title">Bénéfice attendu</span><p>{selected.benefit}</p></section>}<footer><div><small>Source</small><strong>{selected.source}</strong></div>{readyCourseByCode.has(selected.code) ? <button className="primary-button" onClick={() => { const ready = readyCourseByCode.get(selected.code); if (ready) onCourse(ready); }}><Play size={16} /> Ouvrir le parcours</button> : <button className="primary-button" onClick={() => { const draft = catalogCourseDraft(selected); const remote = catalogStates[selected.code]; if (remote?.id) draft.id = remote.id; setCatalogStates((current) => ({ ...current, [selected.code]: { id: draft.id, lifecycle: "draft" } })); setPreparing({ course: draft, catalog: selected }); setSelected(null); }}><Plus size={16} /> {catalogStates[selected.code]?.lifecycle === "draft" ? "Continuer la préparation" : "Préparer ce parcours"}</button>}</footer></div></Modal>}
    {preparing && <ManageContentModal
      course={preparing.course}
      catalogSeed={preparing.catalog}
      onClose={() => setPreparing(null)}
      onPublished={() => setCatalogStates((current) => ({ ...current, [preparing.catalog.code]: { id: preparing.course.id, lifecycle: "published" } }))}
    />}
  </>;
}

function CourseDetail({ course, onBack, onQuiz }: { course: Course; onBack: () => void; onQuiz: () => void }) {
  const [activeModule, setActiveModule] = useState(Math.max(1, Math.min(course.completedModules + 1, course.modules)));
  const [completedModules, setCompletedModules] = useState(course.completedModules);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const activeContent = course.moduleContent[activeModule - 1] ?? course.moduleContent[0];
  const markComplete = async () => {
    if (!activeContent) return;
    setSaving(true); setNotice("");
    if (usesNetlifyIdentity()) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete-module", moduleId: activeContent.id ?? `${course.id}-module-${activeModule}` }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Enregistrement impossible");
        setSaving(false);
        return;
      }
    }
    const next = Math.max(completedModules, activeModule);
    setCompletedModules(next);
    setNotice("Module validé. Votre progression a bien été enregistrée.");
    setSaving(false);
    window.setTimeout(() => setNotice(""), 3000);
    if (activeModule < course.modules) setActiveModule(activeModule + 1);
  };
  const progress = Math.round((completedModules / course.modules) * 100);
  if (!activeContent) return <><button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Retour à mes formations</button><section className="empty-state"><span className="empty-icon"><Inbox size={28} /></span><h1>Contenu en préparation</h1><p>L’administrateur n’a pas encore publié de module dans ce parcours.</p></section></>;
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Retour à mes formations</button>
    <section className="course-detail-heading"><div><span className={`detail-icon tone-${course.accent}`}><BookOpen size={27} /></span><div><span className="eyebrow">{course.category} · {course.duration}</span><h1>{course.title}</h1><p>{course.description}</p></div></div><div className="detail-progress"><ProgressRing value={progress} size={70} /><span>{completedModules} / {course.modules} modules</span></div></section>
    {notice && <div className="success-banner" role="status"><CheckCircle2 size={18} /> {notice}</div>}
    <section className="course-player-grid">
      <div className="course-main-column">
        <div className="video-player"><span className="video-grid" /><div className="video-badge">{activeContent.type === "video" ? <Video size={15} /> : <FileText size={15} />} {activeContent.type === "video" ? "Vidéo" : activeContent.type === "case" ? "Étude de cas" : activeContent.type === "quiz" ? "Évaluation" : "Cours"} · {activeContent.duration}</div>{activeContent.videoUrl ? <a className="play-button" href={activeContent.videoUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir la vidéo"><Play size={34} fill="currentColor" /></a> : <span className="play-button play-button-disabled" aria-label="Aucun média publié"><FileText size={30} /></span>}<div className="video-caption"><small>Module {activeModule}</small><strong>{activeContent.title}</strong></div></div>
        <article className="panel lesson-content"><div className="panel-heading"><div><span className="eyebrow">À retenir</span><h3>Objectifs de ce module</h3></div>{activeContent.videoUrl && <a className="resource-link" href={activeContent.videoUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ouvrir la vidéo</a>}</div><p>{activeContent.summary}</p>{activeContent.points.length ? <ul>{activeContent.points.map((point) => <li key={point}><Check size={15} /> {point}</li>)}</ul> : <p className="muted-copy">Les objectifs détaillés seront ajoutés par l’équipe pédagogique.</p>}<div className="lesson-actions"><button className="primary-button" onClick={markComplete} disabled={saving}><CheckCircle2 size={17} /> {saving ? "Enregistrement…" : "Marquer comme terminé"}</button></div></article>
        <article className="panel resources-panel"><div className="panel-heading"><div><span className="eyebrow">Documents</span><h3>Ressources du module</h3></div></div>{activeContent.resources?.length ? <div className="resource-list">{activeContent.resources.map((resource, index) => resource.url ? <a key={`${resource.name}-${index}`} href={resource.url} target="_blank" rel="noreferrer"><span className="resource-icon link"><Link2 size={19} /></span><span><strong>{resource.name}</strong><small>{resource.type}</small></span><ExternalLink size={17} /></a> : <div key={`${resource.name}-${index}`}><span className="resource-icon pdf"><FileText size={19} /></span><span><strong>{resource.name}</strong><small>{resource.type}</small></span></div>)}</div> : <div className="table-empty"><FileText size={22} /><strong>Aucune ressource jointe</strong><span>Les documents publiés par l’administrateur apparaîtront ici.</span></div>}</article>
      </div>
      <aside className="module-sidebar panel"><div className="module-sidebar-head"><span className="eyebrow">Sommaire</span><h3>{course.modules} modules</h3><div className="linear-progress"><span style={{ width: `${progress}%` }} /></div><small>{progress} % complété</small></div><div className="module-list">{course.moduleContent.map((item, index) => { const number = index + 1; const done = number <= completedModules; const active = number === activeModule; return <button key={item.id ?? `${course.id}-${number}`} className={active ? "active" : ""} onClick={() => setActiveModule(number)}><span className={done ? "module-status done" : "module-status"}>{done ? <Check size={14} /> : number}</span><span><small>Module {number} · {item.duration}</small><strong>{item.title}</strong></span>{active && <Play size={14} fill="currentColor" />}</button>; })}</div>{course.id === "hygiene-mains" && <div className="quiz-callout"><span><FileQuestion size={20} /></span><div><strong>Évaluation finale</strong><p>Questionnaire publié</p></div><button onClick={onQuiz}>Démarrer le QCM</button></div>}</aside>
    </section>
  </>;
}

function QuizView({ course, onBack }: { course: Course; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const score = quizQuestions.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0);
  const percentage = Math.round((score / quizQuestions.length) * 100);
  const selectAnswer = (answer: number) => setAnswers({ ...answers, [step]: answer });
  const finishQuiz = () => {
    setFinished(true);
    if (usesNetlifyIdentity() && course.id === "hygiene-mains") {
      void fetch("/.netlify/functions/lms-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit-quiz", quizId: "hygiene-mains-quiz", score: percentage, answers }),
      });
    }
  };
  if (finished) return <section className="quiz-result"><span className={`result-emblem ${percentage >= 80 ? "success" : "retry"}`}>{percentage >= 80 ? <Award size={44} /> : <FileQuestion size={44} />}</span><span className="eyebrow">Résultat de l’évaluation</span><h1>{percentage >= 80 ? "Bravo, formation validée !" : "Encore un petit effort"}</h1><p>Vous avez obtenu <strong>{percentage} %</strong> ({score} bonne{score > 1 ? "s" : ""} réponse{score > 1 ? "s" : ""} sur {quizQuestions.length}).</p><div className="result-actions"><button className="secondary-button" onClick={() => { setFinished(false); setStep(0); setAnswers({}); }}>Recommencer</button><button className="primary-button" onClick={onBack}>{percentage >= 80 ? "Voir mon certificat" : "Retour à la formation"}</button></div></section>;
  const question = quizQuestions[step];
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Quitter l’évaluation</button>
    <section className="quiz-shell"><header><div><span className="eyebrow">Évaluation finale</span><h1>{course.title}</h1></div><div className="quiz-counter"><strong>{step + 1}</strong><span>/ {quizQuestions.length}</span></div></header><div className="quiz-progress"><span style={{ width: `${((step + 1) / quizQuestions.length) * 100}%` }} /></div><article className="quiz-question"><small>Question {step + 1}</small><h2>{question.question}</h2><div className="answer-list">{question.options.map((option, index) => <button key={option} className={answers[step] === index ? "selected" : ""} onClick={() => selectAnswer(index)}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{answers[step] === index ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>)}</div></article><footer><button className="secondary-button" disabled={step === 0} onClick={() => setStep(step - 1)}>Question précédente</button>{step < quizQuestions.length - 1 ? <button className="primary-button" disabled={answers[step] === undefined} onClick={() => setStep(step + 1)}>Question suivante <ChevronRight size={17} /></button> : <button className="primary-button" disabled={Object.keys(answers).length < quizQuestions.length} onClick={finishQuiz}>Valider mes réponses <Check size={17} /></button>}</footer></section>
  </>;
}

function CertificatesView({ name, certificates, loading }: { name: string; certificates: CertificateRecord[]; loading: boolean }) {
  return <><section className="page-heading"><div><span className="eyebrow">Vos réussites</span><h1>Mes certificats</h1><p>Consultez les attestations obtenues au fil de votre parcours.</p></div><span className="count-badge"><Award size={15} /> {certificates.length} certificat{certificates.length > 1 ? "s" : ""}</span></section>{loading ? <section className="empty-state compact-empty"><Clock3 size={28} /><h2>Chargement des certificats…</h2></section> : certificates.length ? <div className="certificate-grid">{certificates.map((certificate) => <article className="certificate-card" key={certificate.certificateNumber}><div className="certificate-top"><span className="certificate-mark"><Award size={28} /></span><span className="certificate-number">N° {certificate.certificateNumber}</span></div><span className="eyebrow">Certificat de réussite</span><h2>{certificate.courseTitle}</h2><p>Délivré à <strong>{name}</strong> le {formatDate(certificate.issuedAt)}.</p><div className="certificate-score"><span>Score final</span><strong>{certificate.score === null ? "Validé" : `${certificate.score} %`}</strong></div></article>)}</div> : <section className="empty-state compact-empty"><span className="empty-icon"><Award size={28} /></span><h2>Aucun certificat disponible</h2><p>Vos attestations apparaîtront ici après validation des formations concernées.</p></section>}</>;
}

function UsersView({ onLearner }: { onLearner: (learner: Learner) => void }) {
  const [items, setItems] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tous");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
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
  const filtered = items.filter((learner) => (status === "Tous" || learner.status === status) && `${learner.name} ${learner.matricule} ${learner.email} ${learner.department}`.toLowerCase().includes(query.toLowerCase()));
  const exportCsv = () => {
    const rows = [["Nom", "Email", "Service", "Progression", "Formations terminées", "Dernière connexion", "Statut"], ...filtered.map((item) => [item.name, item.email, item.department, `${item.progress}%`, `${item.completed}/${item.assigned}`, `${item.lastLogin} ${item.lastLoginDetail}`, item.status])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "suivi-apprenants-walyah.csv"; link.click(); URL.revokeObjectURL(url);
  };
  return <>
    <section className="page-heading"><div><span className="eyebrow">Gestion des utilisateurs</span><h1>Apprenants</h1><p>Suivez la progression, l’assiduité et les dernières connexions.</p></div><div className="heading-actions"><button className="secondary-button" onClick={exportCsv}><Download size={17} /> Exporter le suivi</button><button className="primary-button" onClick={() => setInviteOpen(true)}><UserPlus size={17} /> Inviter un apprenant</button></div></section>
    {invited.length > 0 && <div className="success-banner"><CheckCircle2 size={18} /> {invited.length} invitation{invited.length > 1 ? "s" : ""} envoyée{invited.length > 1 ? "s" : ""} pendant cette session.</div>}
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="panel table-panel"><div className="table-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, matricule, e-mail ou service…" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Tous</option><option>Actif</option><option>À relancer</option><option>Inactif</option></select><span>{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Apprenant</th><th>Service</th><th>Progression</th><th>Formations</th><th>Dernière connexion</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((learner) => <tr className="clickable-row" key={learner.id} onClick={() => onLearner(learner)}><td><button className="person-cell person-button"><UserAvatar name={learner.name} initials={learner.initials} src={learner.avatarUrl} /><span><strong>{learner.name}</strong><small>{learner.matricule} · {learner.email}</small></span></button></td><td>{learner.department}</td><td><span className="table-progress"><span><i style={{ width: `${learner.progress}%` }} /></span><strong>{learner.progress} %</strong></span></td><td><strong>{learner.completed}</strong> / {learner.assigned}</td><td><strong>{learner.lastLogin}</strong><small>{learner.lastLoginDetail}</small></td><td><span className={`status-tag status-${learner.status.toLowerCase().replace("à ", "").replace(" ", "-")}`}>{learner.status}</span></td><td><button className="icon-button" aria-label={`Ouvrir la fiche de ${learner.name}`} onClick={(event) => { event.stopPropagation(); onLearner(learner); }}><ChevronRight size={18} /></button></td></tr>)}{filtered.length === 0 && <tr><td colSpan={7}><div className="table-empty">{loading ? <Clock3 size={22} /> : <UsersRound size={22} />}<strong>{loading ? "Chargement des apprenants…" : "Aucun apprenant enregistré"}</strong><span>{loading ? "Veuillez patienter." : "Invitez un apprenant pour créer son dossier vide."}</span></div></td></tr>}</tbody></table></div></section>
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvited={(email) => { setInvited([...invited, email]); setInviteOpen(false); }} />}
  </>;
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

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("Accueil");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
  return <Modal title="Inviter un apprenant" onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Nom complet<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom et prénom" required /></label><label>Adresse e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="prenom.nom@entreprise.com" required /></label><label>Service<select value={department} onChange={(event) => setDepartment(event.target.value)}><option>Accueil</option><option>Laboratoire</option><option>Imagerie</option><option>Optique</option><option>Administration</option><option>Maintenance</option></select></label><div className="neutral-note"><ShieldCheck size={17} /><span><strong>Compte créé sans formation</strong><small>Vous pourrez affecter les modules progressivement depuis la fiche de l’apprenant.</small></span></div>{error && <p className="form-message" role="alert">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={loading}><Send size={16} /> {loading ? "Envoi…" : "Créer et envoyer l’accès"}</button></footer></form></Modal>;
}

function TrainingsView() {
  const [items, setItems] = useState<Course[]>(courses);
  const [stats, setStats] = useState<Record<string, { enrolled: number; completion: number }>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [manageCourse, setManageCourse] = useState<Course | null>(null);
  const [loadError, setLoadError] = useState("");
  const createCourse = (course: Course) => { setItems([course, ...items]); setCreateOpen(false); };
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { courseStats?: Array<Record<string, unknown>> }) => {
      const rows = data.courseStats ?? [];
      if (rows.length) setItems(rows.map(courseFromRow));
      setStats(Object.fromEntries(rows.map((row) => [String(row.id), { enrolled: Number(row.enrolled ?? 0), completion: Number(row.completion_rate ?? 0) }])));
    }).catch(() => setLoadError("La bibliothèque distante n’a pas pu être chargée."));
  }, []);
  return <>
    <section className="page-heading"><div><span className="eyebrow">Bibliothèque pédagogique</span><h1>Formations</h1><p>Créez vos parcours, ajoutez vidéos et documents, puis assignez-les aux équipes.</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Créer une formation</button></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="admin-course-list">{items.map((course) => { const courseStats = stats[course.id] ?? { enrolled: 0, completion: 0 }; return <article className="admin-course-row" key={course.id}><CourseVisual course={course} compact /><div className="admin-course-copy"><div><span className="eyebrow">{course.category}</span>{course.mandatory && <span className="status-tag status-required">Obligatoire</span>}</div><h2>{course.title}</h2><p>{course.description}</p><div className="admin-course-meta"><span><BookOpen size={14} /> {course.modules} modules</span><span><Clock3 size={14} /> {course.duration}</span><span><UsersRound size={14} /> {courseStats.enrolled} inscrit{courseStats.enrolled > 1 ? "s" : ""}</span></div></div><div className="admin-course-stats"><span>Taux de complétion</span><strong>{courseStats.completion} %</strong><div className="linear-progress"><span style={{ width: `${courseStats.completion}%` }} /></div><div><button className="secondary-button" onClick={() => setManageCourse(course)}><Edit3 size={16} /> Gérer le contenu</button><button className="icon-button"><MoreHorizontal size={18} /></button></div></div></article>; })}</section>
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
type StudioModule = { id: string; title: string; description: string; contentType: string; durationMinutes: number; objectives: string[]; published: boolean; resources: StudioResource[] };

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
  return <FileText size={18} />;
}

function ManageContentModal({ course, onClose, catalogSeed, onPublished }: { course: Course; onClose: () => void; catalogSeed?: CatalogCourse; onPublished?: () => void }) {
  const initialModules = course.moduleContent.length ? course.moduleContent.map((module, index): StudioModule => ({
    id: module.id ?? `${course.id}-module-${index + 1}`,
    title: module.title,
    description: module.summary,
    contentType: module.type === "lesson" || module.type === "case" ? "text" : module.type,
    durationMinutes: durationMinutesFromLabel(module.duration),
    objectives: module.points,
    published: true,
    resources: (module.resources ?? []).map((resource) => ({ id: resource.id, name: resource.name, type: resource.type, contentKind: resource.contentKind ?? (resource.type === "link" ? "external" : "document"), url: resource.url, sizeBytes: resource.sizeBytes, metadata: resource.metadata })),
  })) : [{ id: `${course.id}-module-1`, title: "Introduction et objectifs", description: course.description, contentType: "text", durationMinutes: 15, objectives: [], published: true, resources: [] }];
  const [tab, setTab] = useState<"structure" | "content" | "evaluation" | "publication">("structure");
  const [details, setDetails] = useState({ title: course.title, category: course.category, description: course.description, objective: course.objective, audience: course.audience, durationMinutes: durationMinutesFromLabel(course.duration), mandatory: Boolean(course.mandatory) });
  const [modules, setModules] = useState<StudioModule[]>(initialModules);
  const [activeModuleId, setActiveModuleId] = useState(initialModules[0].id);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkKind, setLinkKind] = useState("video");
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [published, setPublished] = useState(false);
  const [quizzes, setQuizzes] = useState<Array<{ id: string; title: string; questionCount: number; published: boolean }>>([]);
  const [quizOpen, setQuizOpen] = useState(false);
  const activeModule = modules.find((module) => module.id === activeModuleId) ?? modules[0];

  const postAction = async (action: string, payload: Record<string, unknown>) => {
    const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.error ?? "Enregistrement impossible"));
    return data;
  };

  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    let cancelled = false;
    const hydrate = async () => {
      try {
        if (catalogSeed) await postAction("prepare-catalog-course", { courseId: course.id });
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
          const data = await postAction("save-module", { courseId: course.id, moduleId: module.id, position: index + 1, title: module.title, description: module.description, contentType: module.contentType, durationMinutes: module.durationMinutes, objectives: module.objectives, published: module.published });
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
    const draft: StudioModule = { id: "", title: `Module ${modules.length + 1}`, description: "", contentType: "text", durationMinutes: 15, objectives: [], published: true, resources: [] };
    try {
      let id = `module-${Date.now()}`;
      if (usesNetlifyIdentity()) {
        const data = await postAction("save-module", { courseId: course.id, position: modules.length + 1, title: draft.title, description: "", contentType: "text", durationMinutes: 15, objectives: [], published: true });
        id = String(data.id);
      }
      const created = { ...draft, id };
      setModules((current) => [...current, created]); setActiveModuleId(id); setTab("content");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Création du module impossible"); }
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
        const data = await postAction("add-resource-link", { moduleId: activeModule.id, url: linkUrl, name: linkName || (linkKind === "video" ? "Vidéo du module" : linkKind === "audio" ? "Audio du module" : "Ressource externe"), contentKind: linkKind });
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
          <button className={tab === "evaluation" ? "active" : ""} onClick={() => setTab("evaluation")}><span>3</span>QCM</button>
          <button className={tab === "publication" ? "active" : ""} onClick={() => setTab("publication")}><span>4</span>Publication</button>
        </nav>
        {loading ? <section className="studio-loading"><Clock3 size={25} /><strong>Préparation de l’espace de création…</strong><span>Les informations du catalogue sont récupérées automatiquement.</span></section> : <>
          {catalogSeed && <div className="catalog-seed-note"><Sparkles size={18} /><span><strong>Parcours initialisé depuis le catalogue</strong><small>Le titre, le public, l’objectif et le programme restent entièrement modifiables.</small></span></div>}
          {feedback && <p className="content-feedback" role="status">{feedback}</p>}
          {tab === "structure" && <section className="studio-pane studio-details"><div className="form-grid"><label className="full-field">Titre du parcours<input value={details.title} onChange={(event) => setDetails({ ...details, title: event.target.value })} /></label><label>Catégorie<input value={details.category} onChange={(event) => setDetails({ ...details, category: event.target.value })} /></label><label>Durée totale estimée (minutes)<input type="number" min="0" value={details.durationMinutes} onChange={(event) => setDetails({ ...details, durationMinutes: Number(event.target.value) })} /></label><label className="full-field">Public concerné<input value={details.audience} onChange={(event) => setDetails({ ...details, audience: event.target.value })} /></label><label className="full-field">Objectif pédagogique<textarea rows={3} value={details.objective} onChange={(event) => setDetails({ ...details, objective: event.target.value })} /></label><label className="full-field">Présentation du parcours<textarea rows={4} value={details.description} onChange={(event) => setDetails({ ...details, description: event.target.value })} /></label><label className="check-field full-field"><input type="checkbox" checked={details.mandatory} onChange={(event) => setDetails({ ...details, mandatory: event.target.checked })} /><span><strong>Formation obligatoire</strong><small>Les échéances pourront être définies lors de l’affectation.</small></span></label></div>{catalogSeed?.program?.length ? <div className="catalog-program"><span className="form-section-title">Programme suggéré par le catalogue</span><ol>{catalogSeed.program.map((item) => <li key={item}>{item}</li>)}</ol></div> : null}</section>}
          {tab === "content" && <section className="studio-pane studio-content-grid"><aside className="studio-module-list"><header><div><span className="eyebrow">Structure</span><strong>{modules.length} module{modules.length > 1 ? "s" : ""}</strong></div><button className="icon-button" aria-label="Ajouter un module" onClick={addModule}><Plus size={18} /></button></header>{modules.map((module, index) => <button key={module.id} className={module.id === activeModule?.id ? "active" : ""} onClick={() => setActiveModuleId(module.id)}><GripVertical size={15} /><span><small>Module {index + 1}</small><strong>{module.title}</strong></span><ChevronRight size={15} /></button>)}<button className="secondary-button add-module-button" onClick={addModule}><Plus size={16} /> Ajouter un module</button></aside>{activeModule && <div className="studio-module-editor"><div className="module-fields form-grid"><label className="full-field">Titre du module<input value={activeModule.title} onChange={(event) => updateModule(activeModule.id, { title: event.target.value })} /></label><label>Type de module<select value={activeModule.contentType} onChange={(event) => updateModule(activeModule.id, { contentType: event.target.value })}><option value="text">Cours / texte</option><option value="video">Vidéo</option><option value="document">Document</option><option value="audio">Audio / podcast</option><option value="scorm">Package SCORM</option><option value="quiz">Évaluation</option></select></label><label>Durée (minutes)<input type="number" min="0" value={activeModule.durationMinutes} onChange={(event) => updateModule(activeModule.id, { durationMinutes: Number(event.target.value) })} /></label><label className="full-field">Résumé ou contenu textuel<textarea rows={4} value={activeModule.description} onChange={(event) => updateModule(activeModule.id, { description: event.target.value })} placeholder="Notions abordées, consignes, mise en situation…" /></label><label className="full-field">Objectifs du module — un par ligne<textarea rows={3} value={activeModule.objectives.join("\n")} onChange={(event) => updateModule(activeModule.id, { objectives: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label></div><section><span className="form-section-title"><UploadCloud size={17} /> Déposer des fichiers</span><label className="upload-zone studio-upload"><UploadCloud size={29} /><strong>{uploading ? "Import et contrôle en cours…" : "Sélectionnez un ou plusieurs contenus"}</strong><small>PDF, Word, PowerPoint, MP4/WebM, MP3/WAV/M4A/OGG ou SCORM 1.2/2004 (.zip) · 50 Mo par fichier</small><input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.webm,.mp3,.wav,.m4a,.ogg,.aac,.zip,video/*,audio/*" onChange={addFiles} disabled={uploading} /></label><p className="scorm-note"><Archive size={15} /> Les archives SCORM sont contrôlées : présence du manifeste, version et intégrité du ZIP.</p></section><section><span className="form-section-title"><Link2 size={17} /> Ajouter un lien</span><form className="studio-link-form" onSubmit={addLink}><select value={linkKind} onChange={(event) => setLinkKind(event.target.value)}><option value="video">Vidéo</option><option value="audio">Audio</option><option value="external">Fichier ou page web</option></select><input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Nom visible (facultatif)" /><input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" required /><button className="secondary-button" type="submit"><Plus size={15} /> Ajouter</button></form></section><section><span className="form-section-title"><LibraryBig size={17} /> Ressources du module</span>{activeModule.resources.length ? <div className="managed-resources studio-resources">{activeModule.resources.map((resource, index) => <div key={resource.id ?? `${resource.name}-${index}`}><span className={`resource-icon ${resource.contentKind}`}>{studioResourceIcon(resource.contentKind)}</span><span><strong>{resource.name}</strong><small>{resource.contentKind === "scorm" ? String(resource.metadata?.version ?? "Package SCORM") : resource.contentKind}{resource.sizeBytes ? ` · ${(resource.sizeBytes / 1024 / 1024).toFixed(1)} Mo` : " · lien sécurisé"}</small></span>{resource.url && <a className="icon-button" href={resource.url} target="_blank" rel="noreferrer" aria-label="Ouvrir"><ExternalLink size={16} /></a>}<button className="icon-button" onClick={() => void removeResource(resource)} aria-label="Supprimer"><Trash2 size={16} /></button></div>)}</div> : <div className="studio-inline-empty"><Inbox size={20} /><span>Aucune ressource ajoutée à ce module.</span></div>}</section></div>}</section>}
          {tab === "evaluation" && <section className="studio-pane evaluation-studio"><div className="evaluation-intro"><span className="quiz-card-icon tone-violet"><FileQuestion size={26} /></span><div><span className="eyebrow">Évaluation des acquis</span><h3>Créer ou importer un questionnaire</h3><p>Choix unique, choix multiples, vrai/faux et réponse courte. Les fichiers JSON et Excel sont contrôlés avant enregistrement.</p></div><button className="primary-button" onClick={() => setQuizOpen(true)}><Plus size={16} /> Créer un QCM</button></div><div className="evaluation-import-cards"><a href="/modeles/qcm-walyah-modele.xlsx" download><Table2 size={22} /><span><strong>Modèle Excel</strong><small>Colonnes prêtes et exemples inclus</small></span><Download size={16} /></a><a href="/modeles/qcm-walyah-exemple.json" download><FileText size={22} /><span><strong>Modèle JSON</strong><small>Structure technique complète</small></span><Download size={16} /></a></div>{quizzes.length ? <div className="studio-quiz-list">{quizzes.map((quiz) => <article key={quiz.id}><FileQuestion size={19} /><span><strong>{quiz.title}</strong><small>{quiz.questionCount} question{quiz.questionCount > 1 ? "s" : ""}</small></span><span className={`status-tag ${quiz.published ? "status-actif" : "status-draft"}`}>{quiz.published ? "Publié" : "Brouillon"}</span></article>)}</div> : <div className="studio-inline-empty"><FileQuestion size={21} /><span>Aucun questionnaire n’est encore relié à ce parcours.</span></div>}<div className="import-rules-summary"><strong>Règles principales d’import</strong><ul><li>100 questions maximum par questionnaire.</li><li>2 à 6 propositions pour les choix uniques ou multiples.</li><li>Bonnes réponses Excel indiquées par lettres : A ou A|C.</li><li>Une erreur précise la ligne concernée sans bloquer les lignes valides.</li></ul></div></section>}
          {tab === "publication" && <section className="studio-pane publication-studio"><div className="publication-heading"><span className={`publication-emblem ${published ? "published" : ""}`}>{published ? <CheckCircle2 size={34} /> : <ShieldCheck size={34} />}</span><div><span className="eyebrow">Dernière vérification</span><h3>{published ? "Ce parcours est publié" : "Votre parcours est-il prêt ?"}</h3><p>Une formation publiée devient disponible dans la liste d’affectation des apprenants.</p></div></div><div className="readiness-list">{readiness.map((item) => <div key={item.label} className={item.done ? "done" : "pending"}>{item.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}<span>{item.label}</span><strong>{item.done ? "Prêt" : "À compléter"}</strong></div>)}<div className="optional"><FileQuestion size={19} /><span>QCM final</span><strong>{quizzes.length ? `${quizzes.length} créé${quizzes.length > 1 ? "s" : ""}` : "Optionnel"}</strong></div></div><div className="publication-actions"><button className="secondary-button" onClick={() => void persistStudio()} disabled={saving}><Save size={16} /> Enregistrer le brouillon</button><button className="primary-button" onClick={() => void publishCourse()} disabled={saving || !canPublish}><CheckCircle2 size={16} /> {published ? "Mettre à jour la publication" : "Publier la formation"}</button></div></section>}
        </>}
        <footer className="studio-footer"><span>{published ? <><CheckCircle2 size={15} /> Parcours publié</> : <><Clock3 size={15} /> Brouillon en préparation</>}</span><div><button className="secondary-button" onClick={onClose}>Fermer</button><button className="primary-button" onClick={() => void persistStudio()} disabled={saving || loading}><Save size={16} /> {saving ? "Enregistrement…" : "Enregistrer"}</button></div></footer>
      </div>
    </Modal>
    {quizOpen && <QuizBuilder initialCourseId={course.id} onClose={() => setQuizOpen(false)} onSave={(quiz) => { setQuizOpen(false); setQuizzes((current) => [{ ...quiz, published: false }, ...current]); setFeedback(`QCM « ${quiz.title} » enregistré comme brouillon.`); }} />}
  </>;
}

function QuizzesView() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [created, setCreated] = useState(0);
  const [items, setItems] = useState<Array<{ id: string; courseTitle: string; questionCount: number; threshold: number; published: boolean; participants: number; averageScore: number }>>([]);
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { quizStats?: Array<Record<string, unknown>> }) => setItems((data.quizStats ?? []).map((item) => ({ id: String(item.id), courseTitle: String(item.course_title ?? "Formation"), questionCount: Number(item.question_count ?? 0), threshold: Number(item.pass_threshold ?? 80), published: Boolean(item.published), participants: Number(item.participants ?? 0), averageScore: Number(item.average_score ?? 0) })))).catch(() => undefined);
  }, [created]);
  return <><section className="page-heading"><div><span className="eyebrow">Évaluation des acquis</span><h1>QCM & évaluations</h1><p>Composez plusieurs types de questions, importez JSON ou Excel et analysez les scores.</p></div><div className="heading-actions"><a className="secondary-button button-link" href="/modeles/qcm-walyah-modele.xlsx" download><Table2 size={16} /> Modèle Excel</a><a className="secondary-button button-link" href="/modeles/qcm-walyah-exemple.json" download><Download size={16} /> Modèle JSON</a><button className="primary-button" onClick={() => setBuilderOpen(true)}><Plus size={17} /> Créer un QCM</button></div></section>{created > 0 && <div className="success-banner"><CheckCircle2 size={18} /> Nouveau QCM enregistré comme brouillon.</div>}{items.length ? <div className="quiz-admin-grid">{items.map((item, index) => <article className="panel quiz-admin-card" key={item.id}><div className={`quiz-card-icon tone-${(["teal", "blue", "violet", "coral"] as const)[index % 4]}`}><FileQuestion size={25} /></div><span className={`status-tag ${item.published ? "status-active" : "status-draft"}`}>{item.published ? "Publié" : "Brouillon"}</span><h2>{item.courseTitle}</h2><p>{item.questionCount} question{item.questionCount > 1 ? "s" : ""} · Seuil de réussite {item.threshold} %</p><div className="quiz-stats"><div><strong>{item.participants}</strong><span>Participants</span></div><div><strong>{item.averageScore} %</strong><span>Score moyen</span></div></div></article>)}</div> : <section className="panel learner-empty-state compact-empty"><span className="empty-icon"><FileQuestion size={28} /></span><h2>Aucun QCM enregistré</h2><p>Créez le premier questionnaire ou importez un modèle JSON ou Excel.</p></section>}{builderOpen && <QuizBuilder onClose={() => setBuilderOpen(false)} onSave={() => { setCreated(created + 1); setBuilderOpen(false); }} />}</>;
}

const quizTypeLabels: Record<QuizQuestionType, string> = { single: "Choix unique", multiple: "Choix multiples", true_false: "Vrai / faux", short_text: "Réponse courte" };

function QuizBuilder({ onClose, onSave, initialCourseId }: { onClose: () => void; onSave: (quiz: { id: string; title: string; questionCount: number }) => void; initialCourseId?: string }) {
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
  const [savingQuiz, setSavingQuiz] = useState(false);

  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { courseStats?: Array<Record<string, unknown>> }) => {
      const options = (data.courseStats ?? []).map((row) => ({ id: String(row.id), code: String(row.code ?? "WA"), title: String(row.title ?? "Formation") }));
      if (options.length) setCourseOptions(options);
    }).catch(() => undefined);
  }, []);

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
    setImportErrors(result.errors);
    setImportStatus(result.questions.length ? `${result.questions.length} question${result.questions.length > 1 ? "s" : ""} importée${result.questions.length > 1 ? "s" : ""} depuis ${file.name}.` : "Aucune question valide n’a été importée.");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const invalidIndex = questions.findIndex((question) => !question.prompt.trim() || ((question.type === "single" || question.type === "multiple") && (question.options.length < 2 || question.options.some((option) => !option.trim()))) || (question.type !== "short_text" && !question.correctAnswers.length) || (question.type === "short_text" && !question.acceptedAnswers.some((answer) => answer.trim())));
    if (invalidIndex >= 0) { setError(`La question ${invalidIndex + 1} est incomplète.`); return; }
    setSavingQuiz(true);
    let savedQuiz = { id: `quiz-${Date.now()}`, title, questionCount: questions.length };
    if (usesNetlifyIdentity()) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-quiz", courseId, title, threshold: Number(threshold), questions }) });
        const data = await response.json() as { id?: string; questionCount?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
        savedQuiz = { id: data.id ?? savedQuiz.id, title, questionCount: data.questionCount ?? questions.length };
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible"); setSavingQuiz(false); return; }
    }
    setSavingQuiz(false); onSave(savedQuiz);
  };

  return <Modal title="Créer ou importer un QCM" onClose={onClose} wide studio><form className="quiz-builder modal-form advanced-quiz-builder" onSubmit={submit}>
    <div className="form-grid quiz-settings-grid"><label>Titre du QCM<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Évaluation finale" required /></label><label>Formation<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courseOptions.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.title}</option>)}</select></label><label>Seuil de réussite<select value={threshold} onChange={(event) => setThreshold(event.target.value)}><option value="60">60 %</option><option value="70">70 %</option><option value="80">80 %</option><option value="90">90 %</option></select></label><label className="quiz-import">Importer JSON ou Excel<span><FileUp size={16} /> Sélectionner un fichier<input type="file" accept="application/json,.json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importFile} /></span></label></div>
    <div className="quiz-template-links"><a href="/modeles/qcm-walyah-modele.xlsx" download><Table2 size={16} /> Télécharger le modèle Excel</a><a href="/modeles/qcm-walyah-exemple.json" download><FileText size={16} /> Télécharger le modèle JSON</a><span>100 questions maximum</span></div>
    {importStatus && <p className="import-status"><CheckCircle2 size={16} /> {importStatus}</p>}
    {importErrors.length > 0 && <div className="import-error-report" role="alert"><strong>{importErrors.length} anomalie{importErrors.length > 1 ? "s" : ""} détectée{importErrors.length > 1 ? "s" : ""}</strong><ul>{importErrors.slice(0, 12).map((message) => <li key={message}>{message}</li>)}</ul>{importErrors.length > 12 && <small>{importErrors.length - 12} autre(s) anomalie(s) non affichée(s).</small>}</div>}
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="builder-question-list">{questions.map((question, questionIndex) => <section className="builder-question advanced-question" key={questionIndex}><div className="builder-question-head"><span>Question {questionIndex + 1}</span><select aria-label={`Type de la question ${questionIndex + 1}`} value={question.type} onChange={(event) => changeType(questionIndex, event.target.value as QuizQuestionType)}>{(Object.keys(quizTypeLabels) as QuizQuestionType[]).map((type) => <option value={type} key={type}>{quizTypeLabels[type]}</option>)}</select><label className="question-points">Points<input type="number" min="1" max="10" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) })} /></label>{questions.length > 1 && <button type="button" className="icon-button" aria-label="Supprimer la question" onClick={() => setQuestions(questions.filter((_, index) => index !== questionIndex))}><Trash2 size={15} /></button>}</div><label>Intitulé<textarea value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder="Saisissez votre question…" rows={2} required /></label>{question.type === "short_text" ? <label>Réponses acceptées — une par ligne<textarea rows={3} value={question.acceptedAnswers.join("\n")} onChange={(event) => updateQuestion(questionIndex, { acceptedAnswers: event.target.value.split(/\n|\|/).map((item) => item.trim()) })} placeholder="Ex. friction hydroalcoolique" required /></label> : <><div className="builder-options">{question.options.map((option, optionIndex) => <label key={optionIndex} className={question.correctAnswers.includes(optionIndex) ? "correct" : ""}><input type={question.type === "multiple" ? "checkbox" : "radio"} name={`correct-${questionIndex}`} checked={question.correctAnswers.includes(optionIndex)} onChange={() => toggleCorrect(questionIndex, optionIndex)} /><span>{String.fromCharCode(65 + optionIndex)}</span><input value={option} readOnly={question.type === "true_false"} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`Réponse ${optionIndex + 1}`} required />{question.type !== "true_false" && question.options.length > 2 && <button type="button" className="icon-button" aria-label="Retirer cette réponse" onClick={() => removeOption(questionIndex, optionIndex)}><X size={14} /></button>}</label>)}</div>{(question.type === "single" || question.type === "multiple") && question.options.length < 6 && <button type="button" className="text-button add-answer" onClick={() => updateQuestion(questionIndex, { options: [...question.options, ""] })}><Plus size={14} /> Ajouter une proposition</button>}</>}<label>Explication affichée après la réponse<textarea value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} placeholder="Expliquez pourquoi la réponse est correcte…" rows={2} /></label></section>)}</div>
    <button type="button" className="secondary-button add-question" disabled={questions.length >= 100} onClick={() => setQuestions([...questions, emptyQuizQuestion()])}><Plus size={16} /> Ajouter une question</button>
    <footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={savingQuiz}><Save size={16} /> {savingQuiz ? "Enregistrement…" : `Enregistrer ${questions.length} question${questions.length > 1 ? "s" : ""}`}</button></footer>
  </form></Modal>;
}

function ActivityView() {
  const [logs, setLogs] = useState<string[][]>([]);
  const [loginsToday, setLoginsToday] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [inactiveUsers, setInactiveUsers] = useState(0);
  const [loading, setLoading] = useState(() => usesNetlifyIdentity());
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void fetch("/.netlify/functions/lms-data?scope=admin").then((response) => response.ok ? response.json() : Promise.reject()).then((data: { totals?: Record<string, number>; recentLogins?: Array<Record<string, unknown>> }) => {
      setLoginsToday(data.totals?.logins_today ?? 0);
      setActiveUsers(data.totals?.active_users_7d ?? 0);
      setInactiveUsers(data.totals?.inactive_users ?? 0);
      setLogs((data.recentLogins ?? []).map((item) => { const email = String(item.email ?? "Utilisateur"); const when = new Date(String(item.occurred_at)); const metadata = (item.metadata ?? {}) as Record<string, unknown>; return [email, initialsFrom(email), when.toLocaleDateString("fr-FR") + " · " + when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), String(metadata.location ?? "—"), String(metadata.device ?? "Navigateur web"), String(item.event_type ?? "login") === "login" ? "Connexion réussie" : String(item.event_type)]; }));
    }).catch(() => setLoadError("Le journal des connexions n’a pas pu être chargé.")).finally(() => setLoading(false));
  }, []);
  const exportLogs = () => { const csv = [["Utilisateur", "Date", "Localisation", "Appareil", "Événement"], ...logs.map((item) => [item[0], item[2], item[3], item[4], item[5]])].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "journal-connexions-walyah.csv"; link.click(); URL.revokeObjectURL(url); };
  return <>
    <section className="page-heading"><div><span className="eyebrow">Traçabilité</span><h1>Journal des connexions</h1><p>Consultez les dernières activités d’accès et repérez rapidement les comptes inactifs.</p></div><button className="secondary-button" onClick={exportLogs} disabled={!logs.length}><Download size={17} /> Exporter le journal</button></section>
    {loadError && <div className="form-message" role="alert">{loadError}</div>}
    <section className="metric-grid admin-metrics compact-metrics">
      <article className="metric-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Connexions aujourd’hui</span><strong>{loginsToday}</strong><small>événements enregistrés</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-blue-soft"><Clock3 size={21} /></div><div><span>Utilisateurs actifs</span><strong>{activeUsers}</strong><small>sur les 7 derniers jours</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-violet-soft"><TrendingUp size={21} /></div><div><span>Événements affichés</span><strong>{logs.length}</strong><small>journal actualisé</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-coral-soft"><CircleHelp size={21} /></div><div><span>Comptes inactifs</span><strong>{inactiveUsers}</strong><small className="warning">à contrôler</small></div></article>
    </section>
    <section className="panel table-panel"><div className="table-toolbar"><label><Search size={17} /><input placeholder="Rechercher dans le journal…" /></label><select><option>7 derniers jours</option><option>30 derniers jours</option><option>90 derniers jours</option></select></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Utilisateur</th><th>Date et heure</th><th>Localisation</th><th>Appareil</th><th>Événement</th></tr></thead><tbody>{logs.map((log) => <tr key={`${log[0]}-${log[2]}`}><td><span className="person-cell"><span className="avatar avatar-dark">{log[1]}</span><strong>{log[0]}</strong></span></td><td>{log[2]}</td><td>{log[3]}</td><td>{log[4]}</td><td><span className={`status-tag ${log[5].includes("réussie") ? "status-actif" : "status-relancer"}`}>{log[5]}</span></td></tr>)}{logs.length === 0 && <tr><td colSpan={5}><div className="table-empty"><Clock3 size={22} /><strong>{loading ? "Chargement du journal…" : "Aucune connexion enregistrée"}</strong><span>Les connexions réelles apparaîtront ici.</span></div></td></tr>}</tbody></table></div></section>
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
      const profile = data.profile ? { fullName: String(data.profile.full_name ?? session.name), email: String(data.profile.email ?? session.email), department: String(data.profile.department ?? ""), jobTitle: String(data.profile.job_title ?? ""), avatarUrl: Boolean(data.profile.has_avatar) ? avatarEndpoint("me") : undefined } : null;
      setLearnerWorkspace({
        loading: false, error: "", profile,
        courses: (data.courses ?? []).map(courseFromRow),
        certificates: (data.certificates ?? []).map((item) => ({ certificateNumber: String(item.certificate_number), courseId: String(item.course_id), courseCode: String(item.course_code ?? "WA"), courseTitle: String(item.course_title ?? "Formation"), score: item.score === null || item.score === undefined ? null : Number(item.score), issuedAt: String(item.issued_at ?? "") })),
        activity: (data.activity ?? []).map((item) => ({ type: String(item.event_type ?? "event"), summary: String(item.summary ?? "Activité enregistrée"), occurredAt: String(item.occurred_at ?? "") })),
      });
    }).catch((error) => setLearnerWorkspace({ loading: false, error: error instanceof Error ? error.message : "Chargement impossible", courses: [], certificates: [], activity: [], profile: null }));
  }, [session]);

  const content = useMemo(() => {
    if (!session) return null;
    if (selectedLearner) return <LearnerProfileView learner={selectedLearner} onBack={() => setSelectedLearner(null)} />;
    if (selectedCourse) {
      if (quizMode) return <QuizView course={selectedCourse} onBack={() => setQuizMode(false)} />;
      return <CourseDetail course={selectedCourse} onBack={() => { setSelectedCourse(null); setView("catalogue"); }} onQuiz={() => setQuizMode(true)} />;
    }
    switch (view) {
      case "dashboard": return session.role === "super_admin" ? <SuperAdminDashboard onView={setView} /> : session.role === "admin" ? <AdminDashboard onView={setView} /> : <LearnerDashboard name={session.name} workspace={learnerWorkspace} onView={setView} onCourse={setSelectedCourse} />;
      case "catalogue": return <CatalogueView assignedCourses={learnerWorkspace.courses} loading={learnerWorkspace.loading} onCourse={setSelectedCourse} />;
      case "catalog": return <FullCatalogueView onCourse={setSelectedCourse} />;
      case "certificates": return <CertificatesView name={session.name} certificates={learnerWorkspace.certificates} loading={learnerWorkspace.loading} />;
      case "users": return <UsersView onLearner={setSelectedLearner} />;
      case "trainings": return <TrainingsView />;
      case "quizzes": return <QuizzesView />;
      case "activity": return <ActivityView />;
      case "settings": return <SettingsView session={session} profile={learnerWorkspace.profile} onAvatarUpdated={(avatarUrl) => setLearnerWorkspace((current) => ({ ...current, profile: current.profile ? { ...current.profile, avatarUrl } : { fullName: session.name, email: session.email, department: "", jobTitle: "", avatarUrl } }))} />;
      default: return null;
    }
  }, [learnerWorkspace, quizMode, selectedCourse, selectedLearner, session, view]);

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
  return <div className="app-shell"><Sidebar role={session.role} view={view} onView={(next) => { setSelectedCourse(null); setSelectedLearner(null); setQuizMode(false); setView(next); }} open={sidebarOpen} onClose={() => setSidebarOpen(false)} /><div className="app-main"><Topbar session={session} avatarUrl={session.role === "learner" ? learnerWorkspace.profile?.avatarUrl : undefined} onMenu={() => setSidebarOpen(true)} onLogout={logoutSession} /><main className="page-content">{content}</main></div></div>;
}
