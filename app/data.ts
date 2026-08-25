import catalogueData from "./catalogues.json";

export type CourseStatus = "En cours" | "Terminée" | "À commencer";
export type Accent = "teal" | "blue" | "violet" | "amber" | "coral";

export type ModuleContent = {
  id?: string;
  title: string;
  type: "video" | "lesson" | "case" | "document" | "audio" | "scorm" | "quiz";
  duration: string;
  summary: string;
  points: string[];
  videoUrl?: string;
  resources?: Array<{ id?: string; name: string; type: string; contentKind?: string; url?: string; sizeBytes?: number; metadata?: Record<string, unknown> }>;
};

export type Course = {
  id: string; code: string; title: string; category: string; description: string;
  objective: string; audience: string; source: string; duration: string; modules: number;
  completedModules: number; progress: number; status: CourseStatus; mandatory?: boolean;
  accent: Accent; nextLesson: string; dueDate?: string; moduleContent: ModuleContent[];
  quiz?: { id: string; title: string; threshold: number };
};

export type CatalogCourse = {
  code: string; title: string; axis: string; duration: string; audience: string;
  description?: string; theme: string; source: string; need?: string; objective?: string;
  program?: string[]; methods?: string; benefit?: string;
};

export type TrainingRecord = {
  courseId: string; code: string; title: string; status: CourseStatus | "En retard";
  progress: number; completedModules: number; modules: number; score?: number;
  assignedAt: string; dueDate?: string; completedAt?: string; certificate?: string;
};

export type Learner = {
  id: string; matricule: string; name: string; initials: string; email: string; phone: string;
  avatarUrl?: string;
  department: string; jobTitle: string; manager: string; hireDate: string; location: string;
  progress: number; completed: number; assigned: number; lastLogin: string;
  lastLoginDetail: string; status: "Actif" | "À relancer" | "Inactif";
  passportStatus: "Synchronisé" | "À connecter"; trainings: TrainingRecord[];
};

const courseModule = (title: string, type: ModuleContent["type"], duration: string, summary: string, points: string[]): ModuleContent => ({ title, type, duration, summary, points });

export const courses: Course[] = [
  {
    id: "hygiene-mains", code: "HS-INF05", title: "Hygiène des mains & prévention des infections", category: "Hygiène",
    description: "Maîtriser les indications, les gestes et les précautions qui réduisent le risque infectieux au quotidien.",
    objective: "Choisir la bonne technique d’hygiène des mains et l’appliquer au bon moment dans le parcours de soins.",
    audience: "Personnel soignant et équipes en contact avec les patients", source: "Catalogue CDL Academy 2026 complet",
    duration: "2 h 15", modules: 6, completedModules: 0, progress: 0, status: "À commencer", mandatory: true, accent: "teal", nextLesson: "Pourquoi l’hygiène des mains protège",
    quiz: { id: "hygiene-mains-quiz", title: "Évaluation finale — Hygiène des mains", threshold: 80 },
    moduleContent: [
      courseModule("Pourquoi l’hygiène des mains protège", "video", "12 min", "Comprendre la chaîne de transmission et les risques associés aux soins.", ["Identifier les réservoirs", "Repérer les situations à risque", "Relier le geste à la sécurité patient"]),
      courseModule("Les 5 indications essentielles", "lesson", "20 min", "Décider quand réaliser une friction ou un lavage.", ["Avant le contact patient", "Avant un geste aseptique", "Après exposition et contact"]),
      courseModule("Friction hydroalcoolique pas à pas", "video", "18 min", "Réaliser une friction complète sans zone oubliée.", ["Préparer les mains", "Respecter 20 à 30 secondes", "Contrôler les zones difficiles"]),
      courseModule("Lavage, gants et EPI", "lesson", "24 min", "Choisir entre eau et savon, SHA et port de gants.", ["Mains visiblement souillées", "Bon usage des gants", "Retrait des EPI"]),
      courseModule("Situations de soins", "case", "32 min", "Appliquer les règles dans quatre scénarios réalistes.", ["Accueil du patient", "Prélèvement", "Imagerie", "Entretien des espaces"]),
      courseModule("Évaluation et plan d’action", "quiz", "29 min", "Valider les acquis et choisir un engagement opérationnel.", ["QCM de 10 questions", "Seuil de réussite : 80 %", "Attestation automatique"]),
    ],
  },
  {
    id: "communication-patient", code: "MED-01", title: "Communication patient & relation thérapeutique", category: "Relation patient",
    description: "Développer l’écoute active, l’empathie et une communication claire tout au long du parcours patient.",
    objective: "Appliquer des techniques d’écoute active et de communication empathique pour installer une relation de confiance.",
    audience: "Médecins et professionnels en contact avec les patients", source: "Catalogue des formations médicales complémentaires 2026",
    duration: "3 h 00", modules: 5, completedModules: 0, progress: 0, status: "À commencer", accent: "blue", nextLesson: "Écoute active et questions ouvertes",
    moduleContent: [
      courseModule("Écoute active et questions ouvertes", "video", "28 min", "Créer les conditions d’une parole utile et structurée.", ["Questionner sans orienter", "Écouter les signaux faibles", "Synthétiser la demande"]),
      courseModule("Identifier et valider les émotions", "case", "38 min", "Répondre avec justesse aux émotions exprimées ou implicites.", ["Nommer sans juger", "Valider le vécu", "Éviter la minimisation"]),
      courseModule("Reformuler avec justesse", "lesson", "32 min", "Vérifier la compréhension et prévenir les malentendus.", ["Reformulation miroir", "Reformulation synthèse", "Teach-back"]),
      courseModule("Posture, silence et non-verbal", "video", "35 min", "Aligner les mots, la posture et le rythme de l’échange.", ["Présence professionnelle", "Silence thérapeutique", "Gestion de sa propre émotion"]),
      courseModule("Simulation de consultation", "quiz", "47 min", "S’entraîner sur un cas complet et recevoir un feedback guidé.", ["Scénario patient", "Grille d’observation", "Plan de progrès"]),
    ],
  },
  {
    id: "confidentialite", code: "IA-004", title: "Confidentialité, anonymisation & usage sécurisé des LLM", category: "Conformité",
    description: "Protéger les données de santé lors de l’usage d’outils numériques et d’intelligence artificielle.",
    objective: "Anonymiser une situation, choisir l’outil adapté et contrôler ce qui peut ou non être partagé.",
    audience: "Tous collaborateurs", source: "Catalogue CDL Academy 2026 complet",
    duration: "1 h 05", modules: 4, completedModules: 0, progress: 0, status: "À commencer", mandatory: true, accent: "violet", nextLesson: "Données sensibles et responsabilités",
    moduleContent: [
      courseModule("Données sensibles et responsabilités", "lesson", "15 min", "Reconnaître les données personnelles et de santé.", ["Donnée identifiable", "Secret professionnel", "Traçabilité"]),
      courseModule("Anonymiser avant de solliciter un LLM", "case", "20 min", "Transformer un cas réel en demande exploitable et non identifiante.", ["Retirer les identifiants", "Limiter le contexte", "Tester la ré-identification"]),
      courseModule("Vérifier une réponse générée", "video", "15 min", "Contrôler sources, exactitude et niveau de confiance.", ["Recouper l’information", "Repérer l’hallucination", "Garder une validation humaine"]),
      courseModule("Évaluation conformité", "quiz", "15 min", "Valider les réflexes de sécurité sur des situations concrètes.", ["8 mises en situation", "Seuil : 80 %", "Attestation automatique"]),
    ],
  },
  {
    id: "cybersecurite", code: "CYB-001", title: "Cybersécurité & hygiène numérique quotidienne", category: "Cybersécurité",
    description: "Adopter les réflexes qui protègent les comptes, les postes de travail et les données de santé.",
    objective: "Détecter une tentative de fraude, sécuriser ses accès et signaler rapidement un incident.",
    audience: "Tous collaborateurs", source: "Catalogue CDL Academy 2026 complet",
    duration: "1 h 20", modules: 5, completedModules: 0, progress: 0, status: "À commencer", mandatory: true, accent: "coral", nextLesson: "Les menaces qui concernent le CDL",
    moduleContent: [
      courseModule("Les menaces qui concernent le CDL", "video", "12 min", "Comprendre les attaques courantes dans un environnement de santé.", ["Phishing", "Rançongiciel", "Usurpation d’identité"]),
      courseModule("Reconnaître un message suspect", "case", "18 min", "Analyser l’expéditeur, le contexte, le lien et la pièce jointe.", ["Signaux d’urgence", "Nom de domaine", "Demande inhabituelle"]),
      courseModule("Mots de passe et double authentification", "lesson", "16 min", "Renforcer les accès sans complexifier le quotidien.", ["Phrase de passe", "Gestionnaire", "MFA"]),
      courseModule("Réagir à un incident", "case", "19 min", "Isoler, signaler et documenter sans aggraver l’incident.", ["Déconnecter sans effacer", "Alerter le bon canal", "Préserver les éléments utiles"]),
      courseModule("Évaluation cybersécurité", "quiz", "15 min", "Valider les réflexes sur des scénarios réalistes.", ["10 questions", "Seuil : 80 %", "Relance ciblée si échec"]),
    ],
  },
  {
    id: "management-equipe", code: "MED-08", title: "Leadership médical & management d’une équipe de soins", category: "Management",
    description: "Installer des rituels utiles, donner du feedback et soutenir la coopération interprofessionnelle.",
    objective: "Adapter son leadership au contexte, clarifier les responsabilités et réguler les tensions.",
    audience: "Médecins responsables, chefs de service et encadrants", source: "Catalogue des formations médicales complémentaires 2026",
    duration: "1 j", modules: 5, completedModules: 0, progress: 0, status: "À commencer", accent: "amber", nextLesson: "Posture de leader médical",
    moduleContent: [
      courseModule("Posture de leader médical", "lesson", "35 min", "Passer de l’expertise individuelle à l’animation collective.", ["Donner un cap", "Décider au bon niveau", "Créer la confiance"]),
      courseModule("Briefing et débriefing efficaces", "case", "45 min", "Conduire des rituels courts et orientés action.", ["Objectif partagé", "Risques du jour", "Boucle de retour"]),
      courseModule("Feedback qui fait progresser", "video", "40 min", "Formuler un retour observable, utile et respectueux.", ["Faits", "Impact", "Attente"]),
      courseModule("Tensions et décisions difficiles", "case", "55 min", "Réguler une situation sans laisser le conflit s’installer.", ["Cadre de discussion", "Arbitrage", "Suivi de l’accord"]),
      courseModule("Plan de leadership", "quiz", "45 min", "Construire un plan d’action à 30 jours.", ["Auto-positionnement", "Deux rituels à tester", "Indicateur de progrès"]),
    ],
  },
  {
    id: "ia-sante", code: "MED-15", title: "Introduction à l’IA et aux LLM en santé", category: "IA & numérique",
    description: "Comprendre les possibilités, limites et conditions d’usage responsables de l’IA générative en santé.",
    objective: "Choisir un cas d’usage adapté, rédiger une demande structurée et valider la réponse avant utilisation.",
    audience: "Médecins et professionnels de santé", source: "Catalogue des formations médicales complémentaires 2026",
    duration: "3 h 00", modules: 5, completedModules: 0, progress: 0, status: "À commencer", accent: "blue", nextLesson: "Comprendre le fonctionnement d’un LLM",
    moduleContent: [
      courseModule("Ce qu’un LLM fait réellement", "video", "30 min", "Comprendre prédiction, contexte et limites.", ["Tokens et contexte", "Réponse plausible", "Absence de raisonnement clinique autonome"]),
      courseModule("Cas d’usage utiles et interdits", "lesson", "30 min", "Classer les usages selon leur valeur et leur niveau de risque.", ["Synthèse", "Préparation pédagogique", "Décision médicale"]),
      courseModule("Construire un prompt professionnel", "case", "45 min", "Structurer rôle, objectif, contexte, contraintes et format.", ["Cadrage", "Critères de qualité", "Itération"]),
      courseModule("Biais, erreurs et hallucinations", "case", "45 min", "Repérer les réponses fragiles et organiser la vérification.", ["Signaux d’alerte", "Sources fiables", "Relecture humaine"]),
      courseModule("Évaluation et charte d’usage", "quiz", "30 min", "Valider les acquis et accepter les règles de bon usage.", ["10 questions", "Seuil : 80 %", "Engagement individuel"]),
    ],
  },
];

const rawCatalogue = [...(catalogueData.complete as CatalogCourse[]), ...(catalogueData.medical as CatalogCourse[])];
export const trainingCatalogue = rawCatalogue.sort((a, b) => a.code.localeCompare(b.code, "fr"));
export const catalogueTotals = catalogueData.totals;
export const readyCourseByCode = new Map(courses.map((course) => [course.code, course]));
