-- Évolution non destructive du LMS Walyah Académie.
-- Cette migration peut être appliquée après la première version déjà déployée.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('learner', 'admin', 'super_admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;
DROP INDEX IF EXISTS users_matricule_unique_idx;
CREATE UNIQUE INDEX users_matricule_unique_idx ON users(matricule);
CREATE INDEX IF NOT EXISTS users_department_role_idx ON users(department, role);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS axis TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS source_catalog TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS need TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS methods TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS benefit TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS program JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_lifecycle_status_check;
ALTER TABLE courses ADD CONSTRAINT courses_lifecycle_status_check CHECK (lifecycle_status IN ('catalog', 'draft', 'published', 'archived'));
DROP INDEX IF EXISTS courses_code_unique_idx;
CREATE UNIQUE INDEX courses_code_unique_idx ON courses(code);
CREATE INDEX IF NOT EXISTS courses_catalog_filters_idx ON courses(source_catalog, axis, category);

UPDATE courses SET code = 'HS-INF05', axis = 'Hardskills', source_catalog = 'Catalogue CDL Academy 2026 complet', lifecycle_status = 'published' WHERE id = 'hygiene-mains';
UPDATE courses SET code = 'MED-01', axis = 'Softskills', source_catalog = 'Catalogue des formations médicales complémentaires 2026', lifecycle_status = 'published' WHERE id = 'communication-patient';
UPDATE courses SET code = 'IA-004', axis = 'IA & numérique', source_catalog = 'Catalogue CDL Academy 2026 complet', lifecycle_status = 'published' WHERE id = 'confidentialite';
UPDATE courses SET code = 'HS-SEC02', axis = 'Hardskills', source_catalog = 'Catalogue CDL Academy 2026 complet', lifecycle_status = 'published' WHERE id = 'securite-incendie';

ALTER TABLE modules ADD COLUMN IF NOT EXISTS learning_objectives JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS lesson_content JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_progress_percent_check;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_progress_percent_check CHECK (progress_percent BETWEEN 0 AND 100);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS assignment_note TEXT;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE module_progress ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE module_progress ADD COLUMN IF NOT EXISTS last_position_seconds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  certificate_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  quiz_attempt_id TEXT REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  storage_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  reason TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'approved', 'assigned', 'rejected', 'completed')),
  source TEXT NOT NULL DEFAULT 'lms' CHECK (source IN ('lms', 'passport', 'import')),
  history JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passport_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  external_employee_id TEXT,
  match_key TEXT NOT NULL DEFAULT 'matricule' CHECK (match_key IN ('matricule', 'email', 'manual')),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'connected', 'error', 'disabled')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY,
  integration TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS role_audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  previous_role TEXT,
  new_role TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'netlify_identity',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS certificates_user_date_idx ON certificates(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS activity_user_date_idx ON activity_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS training_requests_user_status_idx ON training_requests(user_id, status);
CREATE INDEX IF NOT EXISTS integration_events_status_date_idx ON integration_events(status, occurred_at);

INSERT INTO courses (id, code, title, slug, category, axis, audience, source_catalog, description, objective, duration_minutes, mandatory, published, lifecycle_status)
VALUES
  ('cybersecurite', 'CYB-001', 'Cybersécurité & hygiène numérique quotidienne', 'cybersecurite-hygiene-numerique', 'Cybersécurité', 'Cybersécurité', 'Tous collaborateurs', 'Catalogue CDL Academy 2026 complet', 'Adopter les réflexes qui protègent les comptes, les postes de travail et les données de santé.', 'Détecter une tentative de fraude, sécuriser ses accès et signaler rapidement un incident.', 80, TRUE, TRUE, 'published'),
  ('management-equipe', 'MED-08', 'Leadership médical & management d’une équipe de soins', 'leadership-medical-management-equipe', 'Management', 'Softskills', 'Médecins responsables, chefs de service et encadrants', 'Catalogue des formations médicales complémentaires 2026', 'Installer des rituels utiles, donner du feedback et soutenir la coopération interprofessionnelle.', 'Adapter son leadership au contexte, clarifier les responsabilités et réguler les tensions.', 420, FALSE, TRUE, 'published'),
  ('ia-sante', 'MED-15', 'Introduction à l’IA et aux LLM en santé', 'introduction-ia-llm-sante', 'IA & numérique', 'IA & numérique', 'Médecins et professionnels de santé', 'Catalogue des formations médicales complémentaires 2026', 'Comprendre les possibilités, limites et conditions d’usage responsables de l’IA générative en santé.', 'Choisir un cas d’usage adapté, rédiger une demande structurée et valider la réponse avant utilisation.', 180, FALSE, TRUE, 'published')
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, objective = EXCLUDED.objective, audience = EXCLUDED.audience, source_catalog = EXCLUDED.source_catalog, lifecycle_status = EXCLUDED.lifecycle_status;

INSERT INTO modules (id, course_id, position, title, description, content_type, duration_minutes, learning_objectives, lesson_content, published)
VALUES
  ('cybersecurite-module-1', 'cybersecurite', 1, 'Les menaces qui concernent le CDL', 'Comprendre les attaques courantes dans un environnement de santé.', 'video', 12, '["Identifier le phishing", "Comprendre le rançongiciel"]'::JSONB, '{"format":"video","status":"ready"}'::JSONB, TRUE),
  ('cybersecurite-module-2', 'cybersecurite', 2, 'Reconnaître un message suspect', 'Analyser l’expéditeur, le contexte, le lien et la pièce jointe.', 'text', 18, '["Repérer les signaux d’urgence", "Vérifier un nom de domaine"]'::JSONB, '{"format":"case","status":"ready"}'::JSONB, TRUE),
  ('cybersecurite-module-3', 'cybersecurite', 3, 'Mots de passe et double authentification', 'Renforcer les accès sans complexifier le quotidien.', 'text', 16, '["Créer une phrase de passe", "Activer le MFA"]'::JSONB, '{"format":"lesson","status":"ready"}'::JSONB, TRUE),
  ('cybersecurite-module-4', 'cybersecurite', 4, 'Réagir à un incident', 'Isoler, signaler et documenter sans aggraver l’incident.', 'text', 19, '["Alerter le bon canal", "Préserver les éléments utiles"]'::JSONB, '{"format":"case","status":"ready"}'::JSONB, TRUE),
  ('cybersecurite-module-5', 'cybersecurite', 5, 'Évaluation cybersécurité', 'Valider les réflexes sur des scénarios réalistes.', 'quiz', 15, '["Atteindre 80 %"]'::JSONB, '{"format":"quiz","status":"ready"}'::JSONB, TRUE),
  ('management-equipe-module-1', 'management-equipe', 1, 'Posture de leader médical', 'Passer de l’expertise individuelle à l’animation collective.', 'text', 35, '["Donner un cap", "Décider au bon niveau"]'::JSONB, '{"format":"lesson","status":"ready"}'::JSONB, TRUE),
  ('management-equipe-module-2', 'management-equipe', 2, 'Briefing et débriefing efficaces', 'Conduire des rituels courts et orientés action.', 'text', 45, '["Partager l’objectif", "Faire une boucle de retour"]'::JSONB, '{"format":"case","status":"ready"}'::JSONB, TRUE),
  ('management-equipe-module-3', 'management-equipe', 3, 'Feedback qui fait progresser', 'Formuler un retour observable, utile et respectueux.', 'video', 40, '["Décrire les faits", "Clarifier l’attente"]'::JSONB, '{"format":"video","status":"ready"}'::JSONB, TRUE),
  ('management-equipe-module-4', 'management-equipe', 4, 'Tensions et décisions difficiles', 'Réguler une situation sans laisser le conflit s’installer.', 'text', 55, '["Poser un cadre", "Suivre l’accord"]'::JSONB, '{"format":"case","status":"ready"}'::JSONB, TRUE),
  ('management-equipe-module-5', 'management-equipe', 5, 'Plan de leadership', 'Construire un plan d’action à 30 jours.', 'quiz', 45, '["Choisir deux rituels", "Définir un indicateur"]'::JSONB, '{"format":"quiz","status":"ready"}'::JSONB, TRUE),
  ('ia-sante-module-1', 'ia-sante', 1, 'Ce qu’un LLM fait réellement', 'Comprendre prédiction, contexte et limites.', 'video', 30, '["Comprendre les tokens", "Identifier les limites"]'::JSONB, '{"format":"video","status":"ready"}'::JSONB, TRUE),
  ('ia-sante-module-2', 'ia-sante', 2, 'Cas d’usage utiles et interdits', 'Classer les usages selon leur valeur et leur niveau de risque.', 'text', 30, '["Qualifier le risque", "Garder une validation humaine"]'::JSONB, '{"format":"lesson","status":"ready"}'::JSONB, TRUE),
  ('ia-sante-module-3', 'ia-sante', 3, 'Construire un prompt professionnel', 'Structurer rôle, objectif, contexte, contraintes et format.', 'text', 45, '["Cadrer la demande", "Définir les critères de qualité"]'::JSONB, '{"format":"case","status":"ready"}'::JSONB, TRUE),
  ('ia-sante-module-4', 'ia-sante', 4, 'Biais, erreurs et hallucinations', 'Repérer les réponses fragiles et organiser la vérification.', 'text', 45, '["Recouper les sources", "Repérer les signaux d’alerte"]'::JSONB, '{"format":"case","status":"ready"}'::JSONB, TRUE),
  ('ia-sante-module-5', 'ia-sante', 5, 'Évaluation et charte d’usage', 'Valider les acquis et accepter les règles de bon usage.', 'quiz', 30, '["Atteindre 80 %", "Accepter la charte"]'::JSONB, '{"format":"quiz","status":"ready"}'::JSONB, TRUE)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, learning_objectives = EXCLUDED.learning_objectives, lesson_content = EXCLUDED.lesson_content, updated_at = NOW();
