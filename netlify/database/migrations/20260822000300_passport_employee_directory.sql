-- Annuaire RH synchronisé depuis le Passeport de formation.
-- Les collaborateurs restent en attente tant qu'un administrateur ne crée pas leur accès LMS.

CREATE TABLE IF NOT EXISTS passport_employees (
  id TEXT PRIMARY KEY,
  external_employee_id TEXT,
  matricule TEXT,
  email TEXT,
  full_name TEXT NOT NULL,
  phone TEXT,
  department TEXT,
  job_title TEXT,
  manager_name TEXT,
  hire_date DATE,
  location TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'inactive', 'departed')),
  provisioning_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'invited', 'active', 'blocked', 'error')),
  lms_user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  source_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS passport_employees_external_id_unique_idx
  ON passport_employees(external_employee_id)
  WHERE external_employee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS passport_employees_matricule_unique_idx
  ON passport_employees(matricule)
  WHERE matricule IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS passport_employees_email_unique_idx
  ON passport_employees(LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS passport_employees_provisioning_idx
  ON passport_employees(provisioning_status, employment_status, full_name);
