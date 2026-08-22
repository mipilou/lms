# Structure de la base de données LMS

La base est relationnelle et sépare l’identité, le contenu, le suivi pédagogique, l’audit et les intégrations.

| Domaine | Tables | Responsabilité |
|---|---|---|
| Identité | `users`, `role_audit_events` | profils, matricules, rôles et changements sensibles |
| Catalogue | `courses`, `modules`, `resources` | 144 références 2026, parcours publiés, vidéos et fichiers |
| Suivi | `enrollments`, `module_progress` | assignations, échéances et progression détaillée |
| Évaluation | `quizzes`, `quiz_questions`, `quiz_attempts`, `certificates` | QCM, scores, réussite et attestations |
| Pilotage | `login_events`, `activity_events` | connexions et chronologie métier |
| Besoins | `training_requests` | demandes initiées par LMS, passeport ou import |
| Passeport | `passport_connections`, `integration_events` | rapprochement des personnes et file d’événements bidirectionnelle |

## Clés de référence

- une personne est identifiée techniquement par `users.id` (identifiant Netlify Identity) ;
- le `matricule` est l’identifiant métier prioritaire et possède un index unique lorsqu’il est renseigné ;
- l’e-mail est unique et sert de solution de rapprochement secondaire ;
- chaque formation possède un `code` catalogue unique (`MED-01`, `CYB-001`, etc.) ;
- les couples apprenant/formation et apprenant/module sont uniques pour empêcher les doublons ;
- `enrollments.assignment_source` indique si l’affectation vient de l’administration, du Passeport ou d’un import ;
- les appels d’intégration utilisent une `idempotency_key` unique.

## Principe de démarrage à vide

La création d’un compte ajoute uniquement une ligne dans `users`. Elle ne crée jamais de ligne dans `enrollments`, `module_progress`, `quiz_attempts` ou `certificates`. Une formation n’apparaît chez l’apprenant qu’après une affectation explicite. La migration du 22 août 2026 retire aussi les anciennes affectations automatiques reconnaissables à l’absence de source, d’administrateur et de consigne.

## Cycle d’une formation

`lifecycle_status` distingue :

- `catalog` : référence importée, contenu encore à produire ;
- `draft` : parcours en cours de préparation ;
- `published` : parcours assignable aux apprenants ;
- `archived` : conservé pour l’historique mais non proposé.

Les catalogues et les parcours prêts restent donc dans la même table sans être confondus.
