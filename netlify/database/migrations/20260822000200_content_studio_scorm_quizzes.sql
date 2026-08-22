-- Studio de création de parcours, ressources multimédias/SCORM et QCM enrichis.
-- Migration additive : ne modifie aucun fichier de migration déjà appliqué.

ALTER TABLE modules DROP CONSTRAINT IF EXISTS modules_content_type_check;
ALTER TABLE modules ADD CONSTRAINT modules_content_type_check
  CHECK (content_type IN ('video', 'document', 'text', 'quiz', 'audio', 'scorm'));

ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'document';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_content_kind_check;
ALTER TABLE resources ADD CONSTRAINT resources_content_kind_check
  CHECK (content_kind IN ('document', 'presentation', 'video', 'audio', 'scorm', 'external'));

UPDATE resources SET content_kind = CASE
  WHEN mime_type IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation') THEN 'presentation'
  WHEN mime_type LIKE 'video/%' THEN 'video'
  WHEN mime_type LIKE 'audio/%' THEN 'audio'
  WHEN resource_type = 'link' THEN 'external'
  ELSE 'document'
END
WHERE content_kind = 'document';

CREATE INDEX IF NOT EXISTS resources_module_kind_idx ON resources(module_id, content_kind);

ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'single';
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS correct_answers JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS accepted_answers JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 1;
ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_question_type_check;
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_question_type_check
  CHECK (question_type IN ('single', 'multiple', 'true_false', 'short_text'));
ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_points_check;
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_points_check CHECK (points BETWEEN 1 AND 10);

UPDATE quiz_questions
SET correct_answers = JSONB_BUILD_ARRAY(correct_option)
WHERE correct_answers = '[]'::JSONB AND question_type <> 'short_text';

CREATE INDEX IF NOT EXISTS quiz_questions_type_idx ON quiz_questions(quiz_id, question_type);

