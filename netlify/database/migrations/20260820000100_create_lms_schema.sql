CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'admin')),
  department TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'video' CHECK (content_type IN ('video', 'document', 'text', 'quiz')),
  video_url TEXT,
  body TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, position)
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('file', 'link')),
  storage_key TEXT,
  external_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue')),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS module_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  watch_seconds INTEGER NOT NULL DEFAULT 0 CHECK (watch_seconds >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, module_id)
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pass_threshold INTEGER NOT NULL DEFAULT 80 CHECK (pass_threshold BETWEEN 0 AND 100),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option INTEGER NOT NULL CHECK (correct_option >= 0),
  explanation TEXT,
  UNIQUE (quiz_id, position)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  answers JSONB NOT NULL DEFAULT '{}'::JSONB,
  passed BOOLEAN NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'login',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS modules_course_position_idx ON modules(course_id, position);
CREATE INDEX IF NOT EXISTS enrollments_user_status_idx ON enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS enrollments_course_status_idx ON enrollments(course_id, status);
CREATE INDEX IF NOT EXISTS progress_user_completed_idx ON module_progress(user_id, completed);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_date_idx ON quiz_attempts(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS login_events_date_idx ON login_events(occurred_at DESC);

INSERT INTO courses (id, title, slug, category, description, duration_minutes, mandatory, published)
VALUES
  ('hygiene-mains', 'Hygiène des mains & prévention des infections', 'hygiene-mains', 'Hygiène', 'Maîtriser les gestes essentiels et les protocoles de prévention applicables au quotidien.', 135, TRUE, TRUE),
  ('communication-patient', 'Communication patient & accueil', 'communication-patient', 'Soft skills', 'Développer l’écoute active, l’empathie et une communication claire dans le parcours patient.', 100, FALSE, TRUE),
  ('confidentialite', 'Confidentialité des données de santé', 'confidentialite-donnees-sante', 'Conformité', 'Appliquer les bons réflexes de protection et de partage des données médicales sensibles.', 55, TRUE, TRUE),
  ('securite-incendie', 'Sécurité incendie en établissement de santé', 'securite-incendie', 'Sécurité', 'Identifier les risques, donner l’alerte et agir efficacement selon le plan d’évacuation.', 80, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO modules (id, course_id, position, title, description, content_type, video_url, duration_minutes)
VALUES
  ('hygiene-mains-module-1', 'hygiene-mains', 1, 'Introduction et objectifs', '', 'video', 'https://www.youtube.com/', 8),
  ('hygiene-mains-module-2', 'hygiene-mains', 2, 'Comprendre les risques', '', 'video', 'https://www.youtube.com/', 14),
  ('hygiene-mains-module-3', 'hygiene-mains', 3, 'Les indications essentielles', '', 'video', 'https://www.youtube.com/', 18),
  ('hygiene-mains-module-4', 'hygiene-mains', 4, 'Le bon geste pas à pas', '', 'video', 'https://www.youtube.com/', 16),
  ('hygiene-mains-module-5', 'hygiene-mains', 5, 'Erreurs fréquentes', '', 'video', 'https://www.youtube.com/', 12),
  ('hygiene-mains-module-6', 'hygiene-mains', 6, 'Précautions standard', '', 'video', 'https://www.youtube.com/', 20),
  ('hygiene-mains-module-7', 'hygiene-mains', 7, 'Mise en situation', '', 'text', NULL, 25),
  ('hygiene-mains-module-8', 'hygiene-mains', 8, 'Évaluation finale', '', 'quiz', NULL, 22),
  ('communication-patient-module-1', 'communication-patient', 1, 'Les fondamentaux de l’accueil', '', 'video', 'https://www.youtube.com/', 20),
  ('communication-patient-module-2', 'communication-patient', 2, 'Écouter activement', '', 'video', 'https://www.youtube.com/', 20),
  ('communication-patient-module-3', 'communication-patient', 3, 'Reformuler avec justesse', '', 'video', 'https://www.youtube.com/', 20),
  ('communication-patient-module-4', 'communication-patient', 4, 'Gérer une situation sensible', '', 'text', NULL, 25),
  ('communication-patient-module-5', 'communication-patient', 5, 'Évaluation finale', '', 'quiz', NULL, 15),
  ('confidentialite-module-1', 'confidentialite', 1, 'Données sensibles et responsabilités', '', 'video', 'https://www.youtube.com/', 15),
  ('confidentialite-module-2', 'confidentialite', 2, 'Partager les données en sécurité', '', 'video', 'https://www.youtube.com/', 15),
  ('confidentialite-module-3', 'confidentialite', 3, 'Les bons réflexes au quotidien', '', 'text', NULL, 15),
  ('confidentialite-module-4', 'confidentialite', 4, 'Évaluation finale', '', 'quiz', NULL, 10),
  ('securite-incendie-module-1', 'securite-incendie', 1, 'Comprendre le risque incendie', '', 'video', 'https://www.youtube.com/', 15),
  ('securite-incendie-module-2', 'securite-incendie', 2, 'Prévenir le départ de feu', '', 'video', 'https://www.youtube.com/', 15),
  ('securite-incendie-module-3', 'securite-incendie', 3, 'Donner l’alerte', '', 'video', 'https://www.youtube.com/', 10),
  ('securite-incendie-module-4', 'securite-incendie', 4, 'Utiliser un extincteur', '', 'video', 'https://www.youtube.com/', 15),
  ('securite-incendie-module-5', 'securite-incendie', 5, 'Organiser l’évacuation', '', 'text', NULL, 15),
  ('securite-incendie-module-6', 'securite-incendie', 6, 'Évaluation finale', '', 'quiz', NULL, 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO quizzes (id, course_id, title, pass_threshold, published)
VALUES ('hygiene-mains-quiz', 'hygiene-mains', 'Évaluation finale — Hygiène des mains', 80, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO quiz_questions (id, quiz_id, position, prompt, options, correct_option)
VALUES
  ('hygiene-q1', 'hygiene-mains-quiz', 1, 'Quelle est la durée minimale recommandée pour une friction hydroalcoolique efficace ?', '["5 secondes", "10 secondes", "20 à 30 secondes", "Plus de 2 minutes"]'::JSONB, 2),
  ('hygiene-q2', 'hygiene-mains-quiz', 2, 'Dans quelle situation faut-il privilégier le lavage à l’eau et au savon ?', '["Avant chaque appel téléphonique", "Lorsque les mains sont visiblement souillées", "Après avoir utilisé un clavier", "Uniquement en fin de journée"]'::JSONB, 1),
  ('hygiene-q3', 'hygiene-mains-quiz', 3, 'Quel élément réduit l’efficacité de l’hygiène des mains ?', '["Des ongles courts", "Des avant-bras dégagés", "Le port de bagues et bracelets", "Une dose adaptée de produit"]'::JSONB, 2),
  ('hygiene-q4', 'hygiene-mains-quiz', 4, 'L’hygiène des mains doit notamment être réalisée…', '["Avant et après un contact patient", "Seulement après un soin invasif", "Une fois par vacation", "Uniquement si des gants ont été portés"]'::JSONB, 0)
ON CONFLICT (id) DO NOTHING;
