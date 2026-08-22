-- Les comptes apprenants doivent être créés sans formation.
-- Les affectations sont toujours réalisées ensuite par un administrateur,
-- un super-administrateur ou la passerelle du Passeport de formation.

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS assignment_source TEXT;

UPDATE enrollments
SET assignment_source = CASE
  WHEN assigned_by IS NULL AND assignment_note IS NULL THEN 'legacy_auto'
  WHEN assignment_note ILIKE '%passeport%' THEN 'passport'
  ELSE 'admin'
END
WHERE assignment_source IS NULL;

-- Nettoyage ciblé des parcours ajoutés automatiquement par l’ancienne
-- fonction d’inscription. Les affectations administratives et Passeport
-- possèdent respectivement assigned_by ou assignment_note et sont conservées.
DELETE FROM enrollments
WHERE assignment_source = 'legacy_auto';

ALTER TABLE enrollments ALTER COLUMN assignment_source SET DEFAULT 'admin';
UPDATE enrollments SET assignment_source = 'admin' WHERE assignment_source IS NULL;
ALTER TABLE enrollments ALTER COLUMN assignment_source SET NOT NULL;
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_assignment_source_check;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_assignment_source_check
  CHECK (assignment_source IN ('admin', 'passport', 'import'));

CREATE INDEX IF NOT EXISTS enrollments_assignment_source_idx
  ON enrollments(assignment_source, assigned_at DESC);
