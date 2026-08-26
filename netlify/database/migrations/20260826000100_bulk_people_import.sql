-- Import structuré des collaborateurs depuis Excel ou Google Sheets.
-- Une importation alimente l'annuaire RH sans créer automatiquement de compte LMS.

ALTER TABLE passport_employees ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE passport_employees ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE passport_employees ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE passport_employees ADD COLUMN IF NOT EXISTS import_source TEXT;
ALTER TABLE passport_employees ADD COLUMN IF NOT EXISTS import_batch_id TEXT;
ALTER TABLE passport_employees ADD COLUMN IF NOT EXISTS imported_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE passport_employees DROP CONSTRAINT IF EXISTS passport_employees_import_source_check;
ALTER TABLE passport_employees ADD CONSTRAINT passport_employees_import_source_check
  CHECK (import_source IS NULL OR import_source IN ('excel', 'google_sheets', 'passport', 'manual'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE INDEX IF NOT EXISTS passport_employees_import_batch_idx
  ON passport_employees(import_batch_id, updated_at DESC)
  WHERE import_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS passport_employees_name_idx
  ON passport_employees(last_name, first_name);
