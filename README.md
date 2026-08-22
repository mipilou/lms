# Walyah Académie — LMS de pilotage des formations

Application de gestion de la formation conçue pour Walyah Académie : authentification e-mail, espaces apprenant, administrateur et super-administrateur, catalogue 2026, suivi individuel, contenus multimédias, QCM, certificats et interconnexion avec le Passeport de formation CDL.

## Ce qui est inclus

- authentification e-mail/mot de passe avec confirmation, récupération et formulaire sécurisé de nouveau mot de passe ;
- rôles serveur `learner`, `admin` et `super_admin` ;
- création de chaque compte apprenant sans formation, certificat, score ni progression préchargés ;
- affectation progressive des parcours uniquement par un administrateur, un super-administrateur ou le Passeport ;
- fiche complète de chaque apprenant accessible depuis le tableau de suivi ;
- photo de profil modifiable par l’apprenant, stockée dans Netlify Blobs ;
- tableaux de bord distincts pour l’administration opérationnelle et la super-administration ;
- historique des assignations, modules, scores, certificats et connexions ;
- 144 formations structurées issues des deux catalogues 2026 transmis ;
- 6 parcours déjà scénarisés avec modules pédagogiques ;
- studio guidé de préparation depuis le catalogue, modules réordonnables, liens vidéo/audio/web et dépôt segmenté compatible Netlify de PDF/DOCX/PPTX/MP4/WebM/audio/SCORM ;
- stockage relationnel dans Netlify Database et fichiers dans Netlify Blobs ;
- API HMAC bidirectionnelle pour le Passeport de formation ;
- éditeur de questions à choix unique, choix multiples, vrai/faux et réponse courte, avec imports QCM JSON et Excel documentés dans `docs/FORMAT-QCM.md` ;
- interface responsive, recherche, filtres, exports CSV et journal d’activité.

## Déploiement

Le guide complet se trouve dans [`docs/NETLIFY-MISE-EN-SERVICE.md`](docs/NETLIFY-MISE-EN-SERVICE.md). Le résumé :

1. pousser tout le contenu de ce dossier à la racine d’un dépôt GitHub ;
2. importer le dépôt dans Netlify ;
3. utiliser `npm run build:netlify` comme commande de build ;
4. activer Netlify Identity et Netlify Database ;
5. définir les variables décrites dans `.env.example` ;
6. inviter le premier compte puis lui attribuer le rôle exact `super_admin` dans **Project configuration → Identity → Users** ;
7. se déconnecter puis se reconnecter pour renouveler le jeton et activer le rôle.

Les migrations SQL placées dans `netlify/database/migrations/` sont appliquées automatiquement par Netlify au déploiement. Elles créent la structure métier, importent les 144 formations et suppriment les anciennes affectations automatiques.

## Commandes

- `npm run dev` : serveur de développement ;
- `npm run build:netlify` : build Next.js destiné à Netlify ;
- `npm run build` : build de la version Sites/Vinext ;
- `npm run lint` : contrôle ESLint ;
- `npm test` : build et vérification du HTML rendu ;
- `npm run catalog:migration` : régénération de la migration à partir de `app/catalogues.json`.

## Architecture des données

Les principales tables sont `users`, `courses`, `modules`, `resources`, `enrollments`, `module_progress`, `quizzes`, `quiz_questions`, `quiz_attempts`, `certificates`, `login_events`, `activity_events`, `training_requests`, `passport_connections`, `integration_events` et `role_audit_events`.

Les fichiers pédagogiques sont conservés dans le store Netlify Blobs `walyah-lms-content` et les photos de profil dans `walyah-lms-avatars`; la base conserve uniquement les métadonnées et les liens métier.

## Passeport de formation

Le contrat d’échange, les événements et la signature HMAC sont décrits dans [`docs/PASSEPORT-INTEGRATION.md`](docs/PASSEPORT-INTEGRATION.md). La clé de rapprochement prioritaire est le `matricule`, avec l’e-mail comme solution de secours.
