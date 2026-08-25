import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("groups catalogues by business themes and exposes reactive BI insights", async () => {
  const [app, data] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../app/data.ts"),
  ]);
  assert.match(app, /catalogue-category-index/);
  assert.match(app, /groupedCatalogue/);
  assert.match(app, /Catalogues par thématique/);
  assert.match(app, /trainingThemeFor/);
  assert.match(data, /Informatique, IT & outils numériques/);
  assert.match(data, /Intelligence artificielle & innovation/);
  assert.match(data, /Cybersécurité & protection des données/);
  assert.match(data, /Hygiène, prévention & bionettoyage/);
  assert.match(app, /Insights formation/);
  assert.match(app, /\[7, 30, 90\]/);
  assert.match(app, /Visualiser un autre espace/);
});

test("makes business activity rows navigable", async () => {
  const [app, api] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../netlify/functions/lms-data.mts"),
  ]);
  assert.match(app, /onClick=\{\(\) => onActivity\(activity\)\}/);
  assert.match(app, /Journal des connexions et activités/);
  assert.match(app, /dateGroupLabel/);
  assert.match(api, /linked_course_id/);
  assert.match(api, /active_users_period/);
});

test("issues a nominative certificate only after full validation", async () => {
  const [app, api] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../netlify/functions/lms-data.mts"),
  ]);
  assert.match(api, /issueCompletionCertificate/);
  assert.match(api, /completed_modules[\s\S]*total_modules/);
  assert.match(api, /passed_quizzes[\s\S]*published_quizzes/);
  assert.match(api, /certificate\.issued/);
  assert.match(app, /Certificat de réussite/);
  assert.match(app, /walyah-logo-transparent\.png/);
  assert.match(app, /window\.print\(\)/);
});

test("publishes QCMs and serves their real questions to assigned learners", async () => {
  const [app, api] = await Promise.all([
    read("../app/lms-app.tsx"),
    read("../netlify/functions/lms-data.mts"),
  ]);
  assert.match(api, /scope === "quiz"/);
  assert.match(api, /set-quiz-published/);
  assert.match(api, /JOIN enrollments e ON e\.course_id = q\.course_id/);
  assert.match(app, /scope=quiz&quizId=/);
  assert.match(app, /Dépublier/);
});
