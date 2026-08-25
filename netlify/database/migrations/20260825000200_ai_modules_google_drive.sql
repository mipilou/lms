-- Modules pédagogiques générés par IA et ressources Google Drive.
-- La structure éditoriale est stockée dans modules.lesson_content (JSONB).

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_content_kind_check;
ALTER TABLE resources ADD CONSTRAINT resources_content_kind_check
  CHECK (content_kind IN ('document', 'presentation', 'video', 'audio', 'scorm', 'external', 'drive'));

CREATE INDEX IF NOT EXISTS modules_lesson_content_gin_idx
  ON modules USING GIN (lesson_content);

CREATE INDEX IF NOT EXISTS resources_drive_idx
  ON resources(module_id, content_kind)
  WHERE content_kind = 'drive';
