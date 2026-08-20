"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft, Award, Bell, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, Circle, CircleHelp, ClipboardCheck, Clock3, Download,
  Edit3, ExternalLink, FileQuestion, FileText, FileUp, Filter, LayoutDashboard,
  LibraryBig, Link2, LockKeyhole, LogOut, Menu, MoreHorizontal, Play, Plus,
  Save, Search, Send, Settings, ShieldCheck, Sparkles, Trash2, TrendingUp,
  UploadCloud, UserPlus, UserRound, UsersRound, Video, X,
} from "lucide-react";
import { courses, learners, recentActivities, type Course } from "./data";

type Role = "learner" | "admin";
type View = "dashboard" | "catalogue" | "certificates" | "users" | "trainings" | "quizzes" | "activity" | "settings";
type Session = { name: string; email: string; initials: string; role: Role; isDemo: boolean };

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

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}><button className="modal-backdrop" aria-label="Fermer" onClick={onClose} /><section className={`modal-card ${wide ? "modal-wide" : ""}`}><header><div><span className="eyebrow">Walyah Académie</span><h2>{title}</h2></div><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>{children}</section></div>;
}

function initialsFrom(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
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

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showSignup, setShowSignup] = useState(false);
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const authenticateDemo = (role: Role) => {
    const name = role === "admin" ? "Yohann Mouity" : "Arielle Ndong";
    onAuthenticated({
      name,
      email: role === "admin" ? "admin@walyah-academie.com" : "arielle.ndong@walyah-academie.com",
      initials: initialsFrom(name), role, isDemo: true,
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const isNetlify = usesNetlifyIdentity();
      if (!isNetlify) {
        const role: Role = email.toLowerCase().includes("admin") ? "admin" : "learner";
        const name = fullName || (role === "admin" ? "Administrateur CDL" : email.split("@")[0] || "Apprenant CDL");
        onAuthenticated({ name, email: email || (role === "admin" ? "admin@walyah-academie.com" : "apprenant@walyah-academie.com"), initials: initialsFrom(name), role, isDemo: true });
        return;
      }
      const identity = await import("@netlify/identity");
      const user = showSignup ? await identity.signup(email, password, { full_name: fullName }) : await identity.login(email, password);
      const candidate = user as unknown as { email?: string; roles?: string[]; userMetadata?: { fullName?: string; full_name?: string }; user_metadata?: { full_name?: string } };
      const name = candidate.userMetadata?.fullName || candidate.userMetadata?.full_name || candidate.user_metadata?.full_name || fullName || candidate.email || "Apprenant";
      const role: Role = candidate.roles?.includes("admin") ? "admin" : "learner";
      onAuthenticated({ name, email: candidate.email || email, initials: initialsFrom(name), role, isDemo: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connexion impossible. Vérifiez vos informations.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Présentation de la plateforme">
        <div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" />
        <Brand light />
        <div className="auth-story-content">
          <span className="eyebrow eyebrow-light"><Sparkles size={14} /> Développer les compétences, simplement</span>
          <h1>La formation qui fait avancer toute votre équipe.</h1>
          <p>Centralisez les parcours, suivez les progrès et accompagnez chaque collaborateur depuis une seule plateforme claire et engageante.</p>
          <div className="auth-proof-grid"><div><strong>92 %</strong><span>de complétion moyenne</span></div><div><strong>24/7</strong><span>accès aux contenus</span></div><div><strong>1 espace</strong><span>pour tout piloter</span></div></div>
        </div>
        <div className="auth-quote"><div className="quote-avatar">AN</div><div><p>« Je retrouve immédiatement le module à poursuivre et mes résultats. »</p><span>Arielle · Équipe accueil</span></div></div>
      </section>

      <section className="auth-panel">
        <div className="mobile-brand"><Brand /></div>
        <div className="auth-card">
          <div className="auth-heading"><span className="status-pill"><span /> Accès sécurisé</span><h2>{showSignup ? "Créer votre compte" : "Heureux de vous revoir"}</h2><p>{showSignup ? "Rejoignez votre espace de formation." : "Connectez-vous pour poursuivre votre parcours."}</p></div>
          <form onSubmit={submit}>
            {showSignup && <label className="field-label">Nom complet<span className="input-wrap"><UserRound size={18} /><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Votre nom et prénom" required /></span></label>}
            <label className="field-label">Adresse e-mail<span className="input-wrap"><span className="at-icon">@</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@walyah-academie.com" required /></span></label>
            <label className="field-label"><span className="label-row"><span>Mot de passe</span><button type="button" className="text-button">Mot de passe oublié ?</button></span><span className="input-wrap"><LockKeyhole size={18} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" minLength={8} required /></span></label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Connexion…" : showSignup ? "Créer mon compte" : "Se connecter"}<ChevronRight size={18} /></button>
          </form>
          <p className="auth-switch">{showSignup ? "Vous avez déjà un compte ?" : "Première connexion ?"} <button type="button" className="text-button strong" onClick={() => setShowSignup(!showSignup)}>{showSignup ? "Se connecter" : "Créer un compte"}</button></p>
          <div className="demo-divider"><span>Accès de démonstration</span></div>
          <div className="demo-actions"><button type="button" className="secondary-button" onClick={() => authenticateDemo("learner")}><BookOpen size={17} /> Espace apprenant</button><button type="button" className="secondary-button" onClick={() => authenticateDemo("admin")}><ShieldCheck size={17} /> Espace admin</button></div>
          <div className="trust-note"><ShieldCheck size={17} /><span>Vos données et vos résultats sont protégés.</span></div>
        </div>
        <p className="auth-footer">© 2026 Walyah Académie · Confidentialité · Assistance</p>
      </section>
    </main>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand brand-logo ${light ? "brand-light" : ""}`}><span className="brand-logo-shell"><Image src="/walyah-logo.png" alt="Walyah Académie" width={204} height={70} priority /></span></div>;
}

function Sidebar({ role, view, onView, open, onClose }: { role: Role; view: View; onView: (view: View) => void; open: boolean; onClose: () => void }) {
  const nav = role === "admin" ? adminNav : learnerNav;
  return <>
    {open && <button className="sidebar-backdrop" aria-label="Fermer le menu" onClick={onClose} />}
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-top"><Brand /><button className="icon-button close-sidebar" aria-label="Fermer le menu" onClick={onClose}><X size={20} /></button></div>
      <div className="workspace-badge"><span className="workspace-icon">WA</span><span><small>Espace</small><strong>{role === "admin" ? "Administration" : "Apprenant"}</strong></span><ChevronDown size={16} /></div>
      <nav className="sidebar-nav" aria-label="Navigation principale"><span className="nav-label">Navigation</span>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { onView(item.id); onClose(); }}><Icon size={19} strokeWidth={1.9} /><span>{item.label}</span></button>; })}</nav>
      <div className="sidebar-support"><div className="support-icon"><CircleHelp size={20} /></div><strong>Besoin d’aide ?</strong><p>Notre équipe vous accompagne.</p><button>Contacter le support</button></div>
      <div className="sidebar-version"><span className="online-dot" /> Services opérationnels <small>v1.0</small></div>
    </aside>
  </>;
}

function Topbar({ session, onMenu, onLogout }: { session: Session; onMenu: () => void; onLogout: () => void }) {
  return <header className="topbar">
    <button className="icon-button mobile-menu" aria-label="Ouvrir le menu" onClick={onMenu}><Menu size={21} /></button>
    <div className="global-search"><Search size={18} /><input aria-label="Rechercher" placeholder={session.role === "admin" ? "Rechercher un apprenant, une formation…" : "Rechercher une formation…"} /><kbd>⌘ K</kbd></div>
    <div className="topbar-actions">{session.isDemo && <span className="demo-badge">Mode démo</span>}<button className="icon-button notification-button" aria-label="Notifications"><Bell size={20} /><span /></button><div className="profile-chip"><span className="avatar avatar-dark">{session.initials}</span><span className="profile-copy"><strong>{session.name}</strong><small>{session.role === "admin" ? "Administrateur" : "Apprenante"}</small></span><button className="icon-button" aria-label="Se déconnecter" title="Se déconnecter" onClick={onLogout}><LogOut size={18} /></button></div></div>
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

function LearnerDashboard({ onView, onCourse }: { onView: (view: View) => void; onCourse: (course: Course) => void }) {
  const activeCourses = courses.filter((course) => course.status !== "Terminée");
  return <>
    <section className="page-heading learner-heading"><div><span className="eyebrow">Jeudi 20 août 2026</span><h1>Bonjour Arielle <span>👋</span></h1><p>Prête à poursuivre votre progression ? Vous êtes sur une belle lancée.</p></div><button className="secondary-button"><CalendarDays size={17} /> Mon calendrier</button></section>
    <section className="learner-hero"><div className="hero-copy"><span className="eyebrow eyebrow-light"><Sparkles size={14} /> À poursuivre aujourd’hui</span><h2>Hygiène des mains & prévention des infections</h2><p>Module 6 · Précautions standard</p><div className="hero-progress"><div><span style={{ width: "65%" }} /></div><strong>65 %</strong></div><button className="light-button" onClick={() => onCourse(courses[0])}><Play size={17} fill="currentColor" /> Reprendre le cours</button></div><div className="hero-orbit" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="hero-emblem"><ShieldCheck size={52} strokeWidth={1.5} /></span><span className="float-card float-card-one"><CheckCircle2 size={18} /> 5 modules validés</span><span className="float-card float-card-two"><Clock3 size={18} /> 42 min restantes</span></div></section>
    <section className="metric-grid learner-metrics">
      <article className="metric-card"><div className="metric-icon tone-teal-soft"><TrendingUp size={21} /></div><div><span>Progression globale</span><strong>68 %</strong><small className="positive">+12 % ce mois</small></div><ProgressRing value={68} size={58} /></article>
      <article className="metric-card"><div className="metric-icon tone-blue-soft"><BookOpen size={21} /></div><div><span>Formations en cours</span><strong>4</strong><small>sur 7 assignées</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-violet-soft"><Award size={21} /></div><div><span>Certificats obtenus</span><strong>3</strong><small>dont 1 ce mois-ci</small></div></article>
      <article className="metric-card"><div className="metric-icon tone-coral-soft"><ClipboardCheck size={21} /></div><div><span>Prochaine échéance</span><strong className="date-metric">28 août</strong><small>QCM obligatoire</small></div></article>
    </section>
    <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Votre parcours</span><h2>Formations en cours</h2></div><button className="text-button strong" onClick={() => onView("catalogue")}>Voir toutes les formations <ChevronRight size={16} /></button></div><div className="course-grid">{activeCourses.slice(0, 3).map((course) => <CourseCard key={course.id} course={course} onOpen={onCourse} />)}</div></section>
    <section className="bottom-grid"><article className="panel next-session"><div className="panel-heading"><div><span className="eyebrow">À venir</span><h3>Prochaine session</h3></div><button className="icon-button"><ChevronRight size={18} /></button></div><div className="session-card"><div className="date-card"><strong>26</strong><span>AOÛT</span></div><div><h4>Accueil et relation patient</h4><p><Clock3 size={15} /> 09:00 – 11:00 · Salle Akanda</p><span className="seat-badge">12 places disponibles</span></div></div></article><article className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">Derniers jours</span><h3>Votre activité</h3></div><button className="text-button">Tout voir</button></div><ul className="learner-activity"><li><span className="activity-dot teal" /><div><strong>QCM validé à 90 %</strong><span>Communication patient · Hier</span></div></li><li><span className="activity-dot violet" /><div><strong>Certificat obtenu</strong><span>Confidentialité des données · 18 août</span></div></li></ul></article></section>
  </>;
}

function AdminDashboard({ onView }: { onView: (view: View) => void }) {
  return <>
    <section className="page-heading"><div><span className="eyebrow">Pilotage de la formation</span><h1>Vue d’ensemble</h1><p>Suivez l’engagement de vos équipes et agissez au bon moment.</p></div><div className="heading-actions"><button className="secondary-button"><UploadCloud size={17} /> Importer</button><button className="primary-button" onClick={() => onView("trainings")}><BookOpen size={17} /> Nouvelle formation</button></div></section>
    <section className="metric-grid admin-metrics">
      <article className="metric-card admin-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Apprenants actifs</span><strong>128</strong><small className="positive">+8 ce mois</small></div><span className="mini-label">sur 142</span></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-blue-soft"><TrendingUp size={21} /></div><div><span>Taux de complétion</span><strong>72 %</strong><small className="positive">+6 % vs juillet</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-violet-soft"><Award size={21} /></div><div><span>Certificats délivrés</span><strong>346</strong><small>42 ce mois-ci</small></div></article>
      <article className="metric-card admin-card"><div className="metric-icon tone-coral-soft"><CircleHelp size={21} /></div><div><span>À relancer</span><strong>14</strong><small className="warning">Sans activité depuis 7 j</small></div></article>
    </section>
    <section className="admin-main-grid">
      <article className="panel completion-panel"><div className="panel-heading"><div><span className="eyebrow">Progression</span><h3>Niveau d’avancement</h3></div><select aria-label="Période"><option>30 derniers jours</option><option>90 derniers jours</option></select></div><div className="completion-layout"><div className="big-progress"><ProgressRing value={72} size={150} /><span>Taux moyen</span></div><div className="completion-breakdown"><div><span><i className="key-dot complete" /> Terminées</span><strong>58</strong><small>41 %</small></div><div><span><i className="key-dot current" /> En cours</span><strong>67</strong><small>47 %</small></div><div><span><i className="key-dot late" /> En retard</span><strong>17</strong><small>12 %</small></div></div></div><button className="secondary-button full-button" onClick={() => onView("users")}>Consulter le suivi détaillé <ChevronRight size={16} /></button></article>
      <article className="panel engagement-panel"><div className="panel-heading"><div><span className="eyebrow">Engagement</span><h3>Connexions récentes</h3></div><button className="text-button strong" onClick={() => onView("activity")}>Voir le journal</button></div><div className="engagement-summary"><div><strong>86</strong><span>connexions aujourd’hui</span></div><span className="positive-chip">+14 %</span></div><div className="day-bars" aria-label="Connexions des sept derniers jours">{[42, 64, 53, 78, 90, 58, 72].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} /><small>{["V", "S", "D", "L", "M", "M", "J"][index]}</small></div>)}</div><div className="peak-note"><TrendingUp size={17} /><span><strong>Pic d’activité à 9 h 00</strong><small>24 connexions simultanées</small></span></div></article>
    </section>
    <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">En direct</span><h3>Activité récente</h3></div><button className="text-button strong">Tout afficher <ChevronRight size={15} /></button></div><div className="activity-list">{recentActivities.map((activity) => <div className="activity-item" key={`${activity.name}-${activity.time}`}><span className={`avatar avatar-${activity.tone}`}>{activity.initials}</span><div className="activity-copy"><p><strong>{activity.name}</strong> {activity.action}</p><span>{activity.item}</span></div><span className="activity-detail">{activity.detail}</span><time>{activity.time}</time></div>)}</div></section>
  </>;
}

function CatalogueView({ onCourse }: { onCourse: (course: Course) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const categories = ["Toutes", ...Array.from(new Set(courses.map((course) => course.category)))];
  const filtered = courses.filter((course) => {
    const matchesCategory = category === "Toutes" || course.category === category;
    const haystack = `${course.title} ${course.description} ${course.category}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });
  return <>
    <section className="page-heading"><div><span className="eyebrow">Votre bibliothèque</span><h1>Mes formations</h1><p>Retrouvez vos parcours, vos échéances et les modules déjà validés.</p></div><span className="count-badge">{filtered.length} formation{filtered.length > 1 ? "s" : ""}</span></section>
    <section className="catalogue-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans mes formations…" /></label><div className="filter-pills"><Filter size={16} />{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    {filtered.length ? <div className="course-grid catalogue-grid">{filtered.map((course) => <CourseCard key={course.id} course={course} onOpen={onCourse} />)}</div> : <section className="empty-state compact-empty"><span className="empty-icon"><Search size={28} /></span><h2>Aucun résultat</h2><p>Essayez un autre mot-clé ou retirez le filtre actif.</p></section>}
  </>;
}

function CourseDetail({ course, onBack, onQuiz }: { course: Course; onBack: () => void; onQuiz: () => void }) {
  const [activeModule, setActiveModule] = useState(Math.min(course.completedModules + 1, course.modules));
  const [completedModules, setCompletedModules] = useState(course.completedModules);
  const [notice, setNotice] = useState("");
  const moduleTitles = ["Introduction et objectifs", "Comprendre les risques", "Les indications essentielles", "Le bon geste pas à pas", "Erreurs fréquentes", course.nextLesson, "Mise en situation", "Évaluation finale"];
  const markComplete = () => {
    const next = Math.max(completedModules, activeModule);
    setCompletedModules(next);
    setNotice("Module validé. Votre progression a bien été enregistrée.");
    if (usesNetlifyIdentity()) {
      void fetch("/.netlify/functions/lms-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-module", moduleId: `${course.id}-module-${activeModule}` }),
      });
    }
    window.setTimeout(() => setNotice(""), 3000);
    if (activeModule < course.modules) setActiveModule(activeModule + 1);
  };
  const progress = Math.round((completedModules / course.modules) * 100);
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Retour à mes formations</button>
    <section className="course-detail-heading"><div><span className={`detail-icon tone-${course.accent}`}><BookOpen size={27} /></span><div><span className="eyebrow">{course.category} · {course.duration}</span><h1>{course.title}</h1><p>{course.description}</p></div></div><div className="detail-progress"><ProgressRing value={progress} size={70} /><span>{completedModules} / {course.modules} modules</span></div></section>
    {notice && <div className="success-banner" role="status"><CheckCircle2 size={18} /> {notice}</div>}
    <section className="course-player-grid">
      <div className="course-main-column">
        <div className="video-player"><span className="video-grid" /><div className="video-badge"><Video size={15} /> Vidéo · 08:42</div><button className="play-button" aria-label="Lire la vidéo"><Play size={34} fill="currentColor" /></button><div className="video-caption"><small>Module {activeModule}</small><strong>{moduleTitles[activeModule - 1] || `Module ${activeModule}`}</strong></div></div>
        <article className="panel lesson-content"><div className="panel-heading"><div><span className="eyebrow">À retenir</span><h3>Objectifs de ce module</h3></div><a className="resource-link" href="https://www.youtube.com/" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ouvrir la vidéo source</a></div><p>À la fin de ce module, vous saurez identifier les moments clés, appliquer le protocole adapté et expliquer les bonnes pratiques à un collègue.</p><ul><li><Check size={15} /> Reconnaître les situations à risque</li><li><Check size={15} /> Appliquer la séquence recommandée</li><li><Check size={15} /> Éviter les erreurs les plus courantes</li></ul><div className="lesson-actions"><button className="secondary-button"><FileText size={16} /> Télécharger la fiche mémo</button><button className="primary-button" onClick={markComplete}><CheckCircle2 size={17} /> Marquer comme terminé</button></div></article>
        <article className="panel resources-panel"><div className="panel-heading"><div><span className="eyebrow">Documents</span><h3>Ressources du module</h3></div></div><div className="resource-list"><button><span className="resource-icon pdf"><FileText size={19} /></span><span><strong>Fiche pratique — Les 5 indications</strong><small>PDF · 1,4 Mo</small></span><Download size={17} /></button><button><span className="resource-icon link"><Link2 size={19} /></span><span><strong>Référentiel de bonnes pratiques</strong><small>Lien externe</small></span><ExternalLink size={17} /></button></div></article>
      </div>
      <aside className="module-sidebar panel"><div className="module-sidebar-head"><span className="eyebrow">Sommaire</span><h3>{course.modules} modules</h3><div className="linear-progress"><span style={{ width: `${progress}%` }} /></div><small>{progress} % complété</small></div><div className="module-list">{Array.from({ length: course.modules }, (_, index) => { const number = index + 1; const done = number <= completedModules; const active = number === activeModule; return <button key={number} className={active ? "active" : ""} onClick={() => setActiveModule(number)}><span className={done ? "module-status done" : "module-status"}>{done ? <Check size={14} /> : number}</span><span><small>Module {number}</small><strong>{moduleTitles[index] || `Approfondissement ${number}`}</strong></span>{active && <Play size={14} fill="currentColor" />}</button>; })}</div><div className="quiz-callout"><span><FileQuestion size={20} /></span><div><strong>Évaluation finale</strong><p>10 questions · seuil 80 %</p></div><button onClick={onQuiz}>Démarrer le QCM</button></div></aside>
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

function CertificatesView() {
  const items = [courses[2], { ...courses[0], title: "Hygiène et sécurité au travail", category: "Prévention" }, { ...courses[1], title: "Excellence de l’accueil patient", category: "Relation patient" }];
  return <><section className="page-heading"><div><span className="eyebrow">Vos réussites</span><h1>Mes certificats</h1><p>Consultez et téléchargez les attestations obtenues au fil de votre parcours.</p></div><span className="count-badge"><Award size={15} /> 3 certificats</span></section><div className="certificate-grid">{items.map((course, index) => <article className="certificate-card" key={`${course.id}-${index}`}><div className="certificate-top"><span className="certificate-mark"><Award size={28} /></span><span className="certificate-number">N° WAL-2026-{1187 + index}</span></div><span className="eyebrow">Certificat de réussite</span><h2>{course.title}</h2><p>Délivré à <strong>Arielle Ndong</strong> le {index === 0 ? "18 août" : index === 1 ? "12 juillet" : "30 juin"} 2026.</p><div className="certificate-score"><span>Score final</span><strong>{[96, 88, 92][index]} %</strong></div><button className="secondary-button"><Download size={16} /> Télécharger le certificat</button></article>)}</div></>;
}

function UsersView() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tous");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const filtered = learners.filter((learner) => (status === "Tous" || learner.status === status) && `${learner.name} ${learner.email} ${learner.department}`.toLowerCase().includes(query.toLowerCase()));
  const exportCsv = () => {
    const rows = [["Nom", "Email", "Service", "Progression", "Formations terminées", "Dernière connexion", "Statut"], ...filtered.map((item) => [item.name, item.email, item.department, `${item.progress}%`, `${item.completed}/${item.assigned}`, `${item.lastLogin} ${item.lastLoginDetail}`, item.status])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "suivi-apprenants-walyah.csv"; link.click(); URL.revokeObjectURL(url);
  };
  return <>
    <section className="page-heading"><div><span className="eyebrow">Gestion des utilisateurs</span><h1>Apprenants</h1><p>Suivez la progression, l’assiduité et les dernières connexions.</p></div><div className="heading-actions"><button className="secondary-button" onClick={exportCsv}><Download size={17} /> Exporter le suivi</button><button className="primary-button" onClick={() => setInviteOpen(true)}><UserPlus size={17} /> Inviter un apprenant</button></div></section>
    {invited.length > 0 && <div className="success-banner"><CheckCircle2 size={18} /> {invited.length} invitation{invited.length > 1 ? "s" : ""} envoyée{invited.length > 1 ? "s" : ""} pendant cette session.</div>}
    <section className="panel table-panel"><div className="table-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, e-mail ou service…" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Tous</option><option>Actif</option><option>À relancer</option><option>Inactif</option></select><span>{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Apprenant</th><th>Service</th><th>Progression</th><th>Formations</th><th>Dernière connexion</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((learner) => <tr key={learner.id}><td><span className="person-cell"><span className="avatar avatar-dark">{learner.initials}</span><span><strong>{learner.name}</strong><small>{learner.email}</small></span></span></td><td>{learner.department}</td><td><span className="table-progress"><span><i style={{ width: `${learner.progress}%` }} /></span><strong>{learner.progress} %</strong></span></td><td><strong>{learner.completed}</strong> / {learner.assigned}</td><td><strong>{learner.lastLogin}</strong><small>{learner.lastLoginDetail}</small></td><td><span className={`status-tag status-${learner.status.toLowerCase().replace("à ", "").replace(" ", "-")}`}>{learner.status}</span></td><td><button className="icon-button"><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div></section>
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvited={(email) => { setInvited([...invited, email]); setInviteOpen(false); }} />}
  </>;
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("Accueil");
  const submit = (event: FormEvent) => { event.preventDefault(); onInvited(email); };
  return <Modal title="Inviter un apprenant" onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Nom complet<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom et prénom" required /></label><label>Adresse e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="prenom.nom@entreprise.com" required /></label><label>Service<select value={department} onChange={(event) => setDepartment(event.target.value)}><option>Accueil</option><option>Laboratoire</option><option>Imagerie</option><option>Optique</option><option>Administration</option><option>Maintenance</option></select></label><label>Formations à assigner<select multiple defaultValue={["Hygiène des mains"]}><option>Hygiène des mains</option><option>Communication patient</option><option>Confidentialité des données</option><option>Sécurité incendie</option></select><small>Maintenez Ctrl/Cmd pour sélectionner plusieurs parcours.</small></label><footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit"><Send size={16} /> Envoyer l’invitation</button></footer></form></Modal>;
}

function TrainingsView() {
  const [items, setItems] = useState<Course[]>(courses);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageCourse, setManageCourse] = useState<Course | null>(null);
  const createCourse = (course: Course) => { setItems([course, ...items]); setCreateOpen(false); };
  return <>
    <section className="page-heading"><div><span className="eyebrow">Bibliothèque pédagogique</span><h1>Formations</h1><p>Créez vos parcours, ajoutez vidéos et documents, puis assignez-les aux équipes.</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Créer une formation</button></section>
    <section className="admin-course-list">{items.map((course) => <article className="admin-course-row" key={course.id}><CourseVisual course={course} compact /><div className="admin-course-copy"><div><span className="eyebrow">{course.category}</span>{course.mandatory && <span className="status-tag status-required">Obligatoire</span>}</div><h2>{course.title}</h2><p>{course.description}</p><div className="admin-course-meta"><span><BookOpen size={14} /> {course.modules} modules</span><span><Clock3 size={14} /> {course.duration}</span><span><UsersRound size={14} /> {34 + course.modules * 9} inscrits</span></div></div><div className="admin-course-stats"><span>Taux de complétion</span><strong>{Math.max(course.progress, 54)} %</strong><div className="linear-progress"><span style={{ width: `${Math.max(course.progress, 54)}%` }} /></div><div><button className="secondary-button" onClick={() => setManageCourse(course)}><Edit3 size={16} /> Gérer le contenu</button><button className="icon-button"><MoreHorizontal size={18} /></button></div></div></article>)}</section>
    {createOpen && <CreateCourseModal onClose={() => setCreateOpen(false)} onCreate={createCourse} />}
    {manageCourse && <ManageContentModal course={manageCourse} onClose={() => setManageCourse(null)} />}
  </>;
}

function CreateCourseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (course: Course) => void }) {
  const [title, setTitle] = useState(""); const [category, setCategory] = useState("Hygiène"); const [description, setDescription] = useState(""); const [duration, setDuration] = useState("1 h 00"); const [mandatory, setMandatory] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let id = `course-${Date.now()}`;
    if (usesNetlifyIdentity()) {
      try {
        const response = await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-course", title, category, description, durationMinutes: Number.parseInt(duration, 10) * 60 || 60, mandatory }) });
        const data = await response.json() as { id?: string };
        if (data.id) id = data.id;
      } catch { /* Preserve the draft locally if the network is unavailable. */ }
    }
    onCreate({ id, title, category, description, duration, modules: 1, completedModules: 0, progress: 0, status: "À commencer", mandatory, accent: "coral", nextLesson: "Introduction et objectifs" });
  };
  return <Modal title="Créer une formation" onClose={onClose} wide><form className="modal-form form-grid" onSubmit={submit}><label className="full-field">Titre de la formation<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Gestion des situations difficiles" required /></label><label>Catégorie<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Hygiène</option><option>Soft skills</option><option>Management</option><option>Sécurité</option><option>Conformité</option></select></label><label>Durée estimée<input value={duration} onChange={(event) => setDuration(event.target.value)} required /></label><label className="full-field">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Objectifs et bénéfices du parcours…" rows={4} required /></label><label className="check-field full-field"><input type="checkbox" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} /><span><strong>Formation obligatoire</strong><small>Une échéance et des relances pourront être configurées.</small></span></label><footer className="full-field"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit"><Save size={16} /> Créer et ajouter le contenu</button></footer></form></Modal>;
}

function ManageContentModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const [resources, setResources] = useState([{ name: "Introduction et objectifs", type: "Vidéo", detail: "08:42" }, { name: "Fiche mémo du protocole", type: "PDF", detail: "1,4 Mo" }]);
  const [videoUrl, setVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const addVideo = (event: FormEvent) => { event.preventDefault(); if (!videoUrl) return; setResources([...resources, { name: videoUrl, type: "Lien vidéo", detail: "Externe" }]); setVideoUrl(""); };
  const addFile = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); if (usesNetlifyIdentity()) { try { const form = new FormData(); form.append("file", file); form.append("courseId", course.id); await fetch("/.netlify/functions/upload", { method: "POST", body: form }); } catch { /* The file remains visible locally so the admin can continue. */ } } setResources([...resources, { name: file.name, type: file.type.includes("pdf") ? "PDF" : "Document", detail: `${(file.size / 1024 / 1024).toFixed(1)} Mo` }]); setUploading(false); };
  return <Modal title={`Contenu · ${course.title}`} onClose={onClose} wide><div className="content-manager"><section><span className="form-section-title"><Video size={17} /> Ajouter un lien vidéo</span><form className="inline-form" onSubmit={addVideo}><span><Link2 size={16} /><input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtube.com/… ou https://vimeo.com/…" /></span><button className="primary-button" type="submit">Ajouter</button></form></section><section><span className="form-section-title"><FileUp size={17} /> Importer un contenu</span><label className="upload-zone"><UploadCloud size={28} /><strong>{uploading ? "Import en cours…" : "Déposez ou sélectionnez un fichier"}</strong><small>PDF, DOCX, PPTX, MP4 · 50 Mo maximum</small><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,video/mp4" onChange={addFile} disabled={uploading} /></label></section><section><span className="form-section-title"><LibraryBig size={17} /> Contenu du module</span><div className="managed-resources">{resources.map((resource, index) => <div key={`${resource.name}-${index}`}><span className={`resource-icon ${resource.type.toLowerCase().includes("vidéo") ? "video" : "pdf"}`}>{resource.type.toLowerCase().includes("vidéo") ? <Video size={18} /> : <FileText size={18} />}</span><span><strong>{resource.name}</strong><small>{resource.type} · {resource.detail}</small></span><button className="icon-button" onClick={() => setResources(resources.filter((_, resourceIndex) => resourceIndex !== index))}><Trash2 size={16} /></button></div>)}</div></section><footer><button className="secondary-button" onClick={onClose}>Fermer</button><button className="primary-button" onClick={onClose}><Save size={16} /> Enregistrer le module</button></footer></div></Modal>;
}

function QuizzesView() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [created, setCreated] = useState(0);
  return <><section className="page-heading"><div><span className="eyebrow">Évaluation des acquis</span><h1>QCM & évaluations</h1><p>Composez vos questionnaires, fixez un seuil de réussite et analysez les scores.</p></div><button className="primary-button" onClick={() => setBuilderOpen(true)}><Plus size={17} /> Créer un QCM</button></section>{created > 0 && <div className="success-banner"><CheckCircle2 size={18} /> Nouveau QCM enregistré comme brouillon.</div>}<div className="quiz-admin-grid">{courses.slice(0, 4).map((course, index) => <article className="panel quiz-admin-card" key={course.id}><div className={`quiz-card-icon tone-${course.accent}`}><FileQuestion size={25} /></div><span className="status-tag status-active">{index === 3 ? "Brouillon" : "Publié"}</span><h2>{course.title}</h2><p>{[10, 8, 12, 6][index]} questions · Seuil de réussite {index === 1 ? 70 : 80} %</p><div className="quiz-stats"><div><strong>{[82, 76, 91, 0][index]}</strong><span>Participants</span></div><div><strong>{[88, 79, 93, 0][index]} %</strong><span>Score moyen</span></div></div><footer><button className="secondary-button"><Edit3 size={15} /> Modifier</button><button className="icon-button"><MoreHorizontal size={17} /></button></footer></article>)}</div>{builderOpen && <QuizBuilder onClose={() => setBuilderOpen(false)} onSave={() => { setCreated(created + 1); setBuilderOpen(false); }} />}</>;
}

function QuizBuilder({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [title, setTitle] = useState(""); const [question, setQuestion] = useState(""); const [options, setOptions] = useState(["", "", "", ""]); const [correct, setCorrect] = useState(0); const [threshold, setThreshold] = useState("80");
  const updateOption = (index: number, value: string) => setOptions(options.map((option, optionIndex) => optionIndex === index ? value : option));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (usesNetlifyIdentity()) {
      try {
        await fetch("/.netlify/functions/lms-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-quiz", courseId: "hygiene-mains", title, threshold: Number(threshold), question, options, correct }) });
      } catch { /* Keep the draft available in the current session. */ }
    }
    onSave();
  };
  return <Modal title="Créer un QCM" onClose={onClose} wide><form className="quiz-builder modal-form" onSubmit={submit}><div className="form-grid"><label>Titre du QCM<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Évaluation finale" required /></label><label>Seuil de réussite<select value={threshold} onChange={(event) => setThreshold(event.target.value)}><option value="60">60 %</option><option value="70">70 %</option><option value="80">80 %</option><option value="90">90 %</option></select></label></div><section className="builder-question"><div className="builder-question-head"><span>Question 1</span><span>Une seule bonne réponse</span></div><label>Intitulé<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Saisissez votre question…" rows={3} required /></label><div className="builder-options">{options.map((option, index) => <label key={index} className={correct === index ? "correct" : ""}><input type="radio" name="correct" checked={correct === index} onChange={() => setCorrect(index)} /><span>{String.fromCharCode(65 + index)}</span><input value={option} onChange={(event) => updateOption(index, event.target.value)} placeholder={`Réponse ${index + 1}`} required /></label>)}</div></section><button type="button" className="secondary-button add-question"><Plus size={16} /> Ajouter une question</button><footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" type="submit"><Save size={16} /> Enregistrer le QCM</button></footer></form></Modal>;
}

function ActivityView() {
  const logs = [
    ["Arielle Ndong", "AN", "Aujourd’hui, 08:42", "Libreville", "Chrome · Windows", "Connexion réussie"],
    ["Sarah Bekale", "SB", "Aujourd’hui, 08:35", "Libreville", "Safari · iPhone", "Connexion réussie"],
    ["Marc Obame", "MO", "Aujourd’hui, 07:58", "Owendo", "Chrome · Android", "Connexion réussie"],
    ["Carène Moussavou", "CM", "Hier, 17:21", "Libreville", "Edge · Windows", "Connexion réussie"],
    ["Dimitri Essono", "DE", "16 août, 11:04", "Akanda", "Chrome · Windows", "Session expirée"],
    ["Franck Mouketou", "FM", "8 août, 15:49", "Libreville", "Firefox · Windows", "Connexion réussie"],
  ];
  return <><section className="page-heading"><div><span className="eyebrow">Traçabilité</span><h1>Journal des connexions</h1><p>Consultez les dernières activités d’accès et repérez rapidement les comptes inactifs.</p></div><button className="secondary-button"><Download size={17} /> Exporter le journal</button></section><section className="metric-grid admin-metrics compact-metrics"><article className="metric-card"><div className="metric-icon tone-teal-soft"><UsersRound size={21} /></div><div><span>Connectés aujourd’hui</span><strong>86</strong><small>61 % des apprenants</small></div></article><article className="metric-card"><div className="metric-icon tone-blue-soft"><Clock3 size={21} /></div><div><span>Durée moyenne</span><strong>24 min</strong><small>par session</small></div></article><article className="metric-card"><div className="metric-icon tone-violet-soft"><TrendingUp size={21} /></div><div><span>Connexions sur 7 jours</span><strong>438</strong><small className="positive">+14 %</small></div></article><article className="metric-card"><div className="metric-icon tone-coral-soft"><CircleHelp size={21} /></div><div><span>Comptes inactifs</span><strong>6</strong><small className="warning">depuis 14 jours</small></div></article></section><section className="panel table-panel"><div className="table-toolbar"><label><Search size={17} /><input placeholder="Rechercher dans le journal…" /></label><select><option>7 derniers jours</option><option>30 derniers jours</option><option>90 derniers jours</option></select></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Utilisateur</th><th>Date et heure</th><th>Localisation</th><th>Appareil</th><th>Événement</th></tr></thead><tbody>{logs.map((log) => <tr key={`${log[0]}-${log[2]}`}><td><span className="person-cell"><span className="avatar avatar-dark">{log[1]}</span><strong>{log[0]}</strong></span></td><td>{log[2]}</td><td>{log[3]}</td><td>{log[4]}</td><td><span className={`status-tag ${log[5].includes("réussie") ? "status-actif" : "status-relancer"}`}>{log[5]}</span></td></tr>)}</tbody></table></div></section></>;
}

function SettingsView({ session }: { session: Session }) {
  const [saved, setSaved] = useState(false);
  return <><section className="page-heading"><div><span className="eyebrow">Configuration</span><h1>{session.role === "admin" ? "Paramètres de la plateforme" : "Mon profil"}</h1><p>Gérez vos informations, vos préférences et les réglages de notification.</p></div></section>{saved && <div className="success-banner"><CheckCircle2 size={18} /> Vos modifications ont été enregistrées.</div>}<section className="settings-grid"><article className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">Compte</span><h3>Informations générales</h3></div><span className="avatar avatar-dark large-avatar">{session.initials}</span></div><form className="modal-form" onSubmit={(event) => { event.preventDefault(); setSaved(true); }}><label>Nom complet<input defaultValue={session.name} /></label><label>Adresse e-mail<input type="email" defaultValue={session.email} /></label><label>Fonction<input defaultValue={session.role === "admin" ? "Administrateur formation" : "Chargée d’accueil"} /></label><label>Service<select defaultValue={session.role === "admin" ? "Administration" : "Accueil"}><option>Administration</option><option>Accueil</option><option>Laboratoire</option><option>Imagerie</option><option>Optique</option></select></label><button className="primary-button" type="submit"><Save size={16} /> Enregistrer</button></form></article><article className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">Préférences</span><h3>Notifications</h3></div><Bell size={20} /></div><div className="toggle-list"><label><span><strong>Nouvelles formations</strong><small>Être informé lors d’une nouvelle assignation.</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Rappels d’échéance</strong><small>Recevoir un rappel 7 jours avant la date limite.</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Résultats et certificats</strong><small>Recevoir une confirmation après validation.</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Résumé hebdomadaire</strong><small>{session.role === "admin" ? "Recevoir les indicateurs de pilotage." : "Recevoir le bilan de votre progression."}</small></span><input type="checkbox" /></label></div></article></section></>;
}

export default function LmsApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [quizMode, setQuizMode] = useState(false);

  useEffect(() => {
    if (!usesNetlifyIdentity()) return;
    void import("@netlify/identity").then(async (identity) => {
      try {
        await identity.handleAuthCallback();
        const user = await identity.getUser();
        if (!user) return;
        const candidate = user as unknown as { email?: string; roles?: string[]; userMetadata?: { fullName?: string; full_name?: string }; user_metadata?: { full_name?: string } };
        const name = candidate.userMetadata?.fullName || candidate.userMetadata?.full_name || candidate.user_metadata?.full_name || candidate.email || "Apprenant";
        setSession({ name, email: candidate.email || "", initials: initialsFrom(name), role: candidate.roles?.includes("admin") ? "admin" : "learner", isDemo: false });
      } catch { /* The explicit sign-in form remains available. */ }
    });
  }, []);

  const content = useMemo(() => {
    if (!session) return null;
    if (selectedCourse) {
      if (quizMode) return <QuizView course={selectedCourse} onBack={() => setQuizMode(false)} />;
      return <CourseDetail course={selectedCourse} onBack={() => { setSelectedCourse(null); setView("catalogue"); }} onQuiz={() => setQuizMode(true)} />;
    }
    switch (view) {
      case "dashboard": return session.role === "admin" ? <AdminDashboard onView={setView} /> : <LearnerDashboard onView={setView} onCourse={setSelectedCourse} />;
      case "catalogue": return <CatalogueView onCourse={setSelectedCourse} />;
      case "certificates": return <CertificatesView />;
      case "users": return <UsersView />;
      case "trainings": return <TrainingsView />;
      case "quizzes": return <QuizzesView />;
      case "activity": return <ActivityView />;
      case "settings": return <SettingsView session={session} />;
      default: return null;
    }
  }, [quizMode, selectedCourse, session, view]);

  const logoutSession = async () => {
    if (session && !session.isDemo && usesNetlifyIdentity()) {
      try { const identity = await import("@netlify/identity"); await identity.logout(); } catch { /* Clear local UI even if the request fails. */ }
    }
    setSession(null); setView("dashboard"); setSelectedCourse(null); setQuizMode(false);
  };

  if (!session) return <AuthScreen onAuthenticated={setSession} />;
  return <div className="app-shell"><Sidebar role={session.role} view={view} onView={(next) => { setSelectedCourse(null); setQuizMode(false); setView(next); }} open={sidebarOpen} onClose={() => setSidebarOpen(false)} /><div className="app-main"><Topbar session={session} onMenu={() => setSidebarOpen(true)} onLogout={logoutSession} /><main className="page-content">{content}</main></div></div>;
}
