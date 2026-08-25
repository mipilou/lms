-- Gestion durable des QCM importés, des affectations ciblées et des groupes de formation.
-- Migration additive : les questionnaires et tentatives existants sont conservés.

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS targeted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS quizzes_active_course_idx
  ON quizzes(course_id, published, created_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS training_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_group_members (
  group_id TEXT NOT NULL REFERENCES training_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS training_group_members_user_idx
  ON training_group_members(user_id, group_id);

CREATE TABLE IF NOT EXISTS quiz_assignments (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  training_group_id TEXT REFERENCES training_groups(id) ON DELETE SET NULL,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  assignment_note TEXT,
  assignment_source TEXT NOT NULL DEFAULT 'individual'
    CHECK (assignment_source IN ('individual', 'group', 'import')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quiz_id, user_id)
);

CREATE INDEX IF NOT EXISTS quiz_assignments_user_idx
  ON quiz_assignments(user_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS quiz_assignments_group_idx
  ON quiz_assignments(training_group_id, assigned_at DESC)
  WHERE training_group_id IS NOT NULL;
