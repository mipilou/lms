# Walyah Académie — LMS de pilotage des formations

Application de gestion de la formation conçue pour Walyah Académie : authentification e-mail, espaces apprenant, administrateur et super-administrateur, catalogue 2026, suivi individuel, contenus multimédias, QCM, certificats et interconnexion avec le Passeport de formation CDL.

## Ce qui est inclus

- authentification e-mail/mot de passe avec confirmation, récupération et formulaire sécurisé de nouveau mot de passe ;
- rôles serveur `learner`, `admin` et `super_admin` ;
- création de chaque compte apprenant sans formation, certificat, score ni progression préchargés ;
- annuaire RH synchronisé depuis le Passeport, avec recherche et création contrôlée des accès apprenants ;
- répertoire des apprenants organisé en rubriques par service, avec recherche et suivi individuel ;
- groupes de formation multi-apprenants, mono-service ou transverses, modifiables et réutilisables pour les affectations ;
- auto-inscription publique désactivée dans l’interface au profit du processus RH → administrateur → apprenant ;
- affectation progressive des parcours uniquement par un administrateur, un super-administrateur ou le Passeport ;
- fiche complète de chaque apprenant accessible depuis le tableau de suivi ;
- photo de profil modifiable par l’apprenant, stockée dans Netlify Blobs ;
- tableaux de bord distincts pour l’administration opérationnelle et la super-administration, avec sélecteur de prévisualisation super-admin/admin/apprenant ;
- cockpit d’insights dynamique sur 7, 30 ou 90 jours : engagement, affectations, certifications et comparaison des services ;
- journal intelligent des connexions et activités, classé par période et catégorie, filtrable, exportable et navigable par clic ;
- 144 formations structurées issues des deux catalogues 2026 transmis, classées dans 13 domaines thématiques (IT, IA, cybersécurité, soins, hygiène, management, administration, etc.) ;
- 6 parcours déjà scénarisés avec modules pédagogiques ;
- recherche globale fonctionnelle au clavier ou au clic, avec résultats navigables vers les apprenants, parcours, catalogues et rubriques ;
- studio guidé de préparation depuis le catalogue, modules réordonnables, liens vidéo/audio/web et dépôt segmenté compatible Netlify de PDF/DOCX/PPTX/MP4/WebM/audio/SCORM ;
- import direct de modules produits par une IA au format JSON Walyah v1, double validation client/serveur, trois mises en page et éditeur visuel par blocs ;
- connexion Google Drive par sélecteur officiel ou lien partagé pour référencer les fichiers volumineux sans les faire transiter par la fonction d’import ;
- stockage relationnel dans Netlify Database et fichiers dans Netlify Blobs ;
- API HMAC bidirectionnelle pour le Passeport de formation ;
- éditeur de questions à choix unique, choix multiples, vrai/faux et réponse courte, avec import JSON/Excel confirmé par la base, modification, suppression tracée, publication et affectation à un apprenant ou à un groupe ;
- certificat nominatif automatique après validation complète des modules et évaluations, avec logo Walyah, numéro unique et impression/enregistrement PDF ;
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

Les principales tables sont `users`, `passport_employees`, `courses`, `modules`, `resources`, `enrollments`, `module_progress`, `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_assignments`, `training_groups`, `training_group_members`, `certificates`, `login_events`, `activity_events`, `training_requests`, `passport_connections`, `integration_events` et `role_audit_events`.

Les fichiers pédagogiques sont conservés dans le store Netlify Blobs `walyah-lms-content` et les photos de profil dans `walyah-lms-avatars`; la base conserve uniquement les métadonnées et les liens métier.

Le format d’import IA est documenté dans [`docs/FORMAT-MODULE-IA.md`](docs/FORMAT-MODULE-IA.md). La mise en service du sélecteur Google Drive est décrite dans [`docs/GOOGLE-DRIVE.md`](docs/GOOGLE-DRIVE.md).

## Passeport de formation

Le contrat d’échange, les événements et la signature HMAC sont décrits dans [`docs/PASSEPORT-INTEGRATION.md`](docs/PASSEPORT-INTEGRATION.md). Le Passeport alimente d’abord un annuaire RH en attente ; l’administrateur choisit ensuite les personnes auxquelles créer un accès LMS. Le rapprochement privilégie l’identifiant externe, puis le matricule et enfin l’e-mail.
