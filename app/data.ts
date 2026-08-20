export type CourseStatus = "En cours" | "Terminée" | "À commencer";

export type Course = {
  id: string;
  title: string;
  category: string;
  description: string;
  duration: string;
  modules: number;
  completedModules: number;
  progress: number;
  status: CourseStatus;
  mandatory?: boolean;
  accent: "teal" | "blue" | "violet" | "amber" | "coral";
  nextLesson: string;
  dueDate?: string;
};

export type Learner = {
  id: string;
  name: string;
  initials: string;
  email: string;
  department: string;
  progress: number;
  completed: number;
  assigned: number;
  lastLogin: string;
  lastLoginDetail: string;
  status: "Actif" | "À relancer" | "Inactif";
};

export const courses: Course[] = [
  {
    id: "hygiene-mains",
    title: "Hygiène des mains & prévention des infections",
    category: "Hygiène",
    description:
      "Maîtriser les gestes essentiels et les protocoles de prévention applicables au quotidien.",
    duration: "2 h 15",
    modules: 8,
    completedModules: 5,
    progress: 65,
    status: "En cours",
    mandatory: true,
    accent: "teal",
    nextLesson: "Précautions standard",
    dueDate: "28 août 2026",
  },
  {
    id: "communication-patient",
    title: "Communication patient & accueil",
    category: "Soft skills",
    description:
      "Développer l’écoute active, l’empathie et une communication claire dans le parcours patient.",
    duration: "1 h 40",
    modules: 5,
    completedModules: 2,
    progress: 40,
    status: "En cours",
    accent: "blue",
    nextLesson: "Reformuler avec justesse",
  },
  {
    id: "confidentialite",
    title: "Confidentialité des données de santé",
    category: "Conformité",
    description:
      "Appliquer les bons réflexes de protection et de partage des données médicales sensibles.",
    duration: "55 min",
    modules: 4,
    completedModules: 4,
    progress: 100,
    status: "Terminée",
    mandatory: true,
    accent: "violet",
    nextLesson: "Formation terminée",
  },
  {
    id: "securite-incendie",
    title: "Sécurité incendie en établissement de santé",
    category: "Sécurité",
    description:
      "Identifier les risques, donner l’alerte et agir efficacement selon le plan d’évacuation.",
    duration: "1 h 20",
    modules: 6,
    completedModules: 0,
    progress: 0,
    status: "À commencer",
    mandatory: true,
    accent: "coral",
    nextLesson: "Comprendre le risque incendie",
    dueDate: "12 septembre 2026",
  },
  {
    id: "management-equipe",
    title: "Management d’équipe en milieu médical",
    category: "Management",
    description:
      "Installer des rituels utiles, donner du feedback et soutenir la performance collective.",
    duration: "2 h 30",
    modules: 7,
    completedModules: 1,
    progress: 20,
    status: "En cours",
    accent: "amber",
    nextLesson: "Le briefing efficace",
  },
];

export const learners: Learner[] = [
  { id: "lrn-001", name: "Arielle Ndong", initials: "AN", email: "arielle.ndong@cdl.ga", department: "Accueil", progress: 82, completed: 5, assigned: 6, lastLogin: "Aujourd’hui", lastLoginDetail: "08:42", status: "Actif" },
  { id: "lrn-002", name: "Marc Obame", initials: "MO", email: "marc.obame@cdl.ga", department: "Laboratoire", progress: 64, completed: 4, assigned: 7, lastLogin: "Aujourd’hui", lastLoginDetail: "07:58", status: "Actif" },
  { id: "lrn-003", name: "Carène Moussavou", initials: "CM", email: "carene.moussavou@cdl.ga", department: "Imagerie", progress: 47, completed: 2, assigned: 6, lastLogin: "Hier", lastLoginDetail: "17:21", status: "Actif" },
  { id: "lrn-004", name: "Dimitri Essono", initials: "DE", email: "dimitri.essono@cdl.ga", department: "Sécurité", progress: 31, completed: 2, assigned: 7, lastLogin: "Il y a 4 jours", lastLoginDetail: "11:04", status: "À relancer" },
  { id: "lrn-005", name: "Sarah Bekale", initials: "SB", email: "sarah.bekale@cdl.ga", department: "Optique", progress: 73, completed: 5, assigned: 7, lastLogin: "Aujourd’hui", lastLoginDetail: "09:12", status: "Actif" },
  { id: "lrn-006", name: "Franck Mouketou", initials: "FM", email: "franck.mouketou@cdl.ga", department: "Maintenance", progress: 12, completed: 1, assigned: 6, lastLogin: "Il y a 12 jours", lastLoginDetail: "15:49", status: "Inactif" },
];

export const recentActivities = [
  { initials: "SB", name: "Sarah Bekale", action: "a terminé le QCM", item: "Communication patient & accueil", detail: "Score : 90 %", time: "Il y a 18 min", tone: "teal" },
  { initials: "MO", name: "Marc Obame", action: "a repris sa formation", item: "Hygiène des mains", detail: "Module 6 sur 8", time: "Il y a 42 min", tone: "blue" },
  { initials: "AN", name: "Arielle Ndong", action: "a obtenu un certificat", item: "Confidentialité des données", detail: "Validé à 96 %", time: "Il y a 1 h", tone: "violet" },
];
