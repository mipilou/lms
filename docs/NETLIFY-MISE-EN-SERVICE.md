# Mise en service du LMS Walyah Académie sur Netlify

Ce guide part d’un dépôt GitHub contenant l’application à sa racine. Ne placez pas le projet dans un sous-dossier supplémentaire.

## 1. Contenu à mettre dans GitHub

Conservez notamment :

- `app/`, `public/`, `netlify/`, `scripts/`, `tests/` ;
- `package.json` et `package-lock.json` ;
- `next.config.ts`, `netlify.toml`, `tsconfig.json` et les fichiers de configuration ;
- `.env.example` sans jamais y mettre de vrai secret.

N’envoyez pas `node_modules/`, `.next/`, `dist/` ni un fichier `.env` contenant vos valeurs réelles. Le `.gitignore` les exclut déjà.

## 2. Importer le dépôt

1. Dans Netlify, choisissez **Add new project → Import an existing project**.
2. Sélectionnez GitHub puis le dépôt du LMS.
3. Laissez la racine du projet vide ou `/`.
4. Utilisez la commande de build `npm run build:netlify`.
5. Le dossier de publication est géré par l’adaptateur Next.js ; ne forcez pas un dossier `out`.
6. Lancez le premier déploiement.

Le fichier `netlify.toml` contient déjà la commande de build et le répertoire des fonctions.

## 3. Activer la base de données

Dans **Data & Storage → Database**, créez la base du projet si Netlify ne l’a pas encore provisionnée. Les migrations sont déjà rangées dans `netlify/database/migrations/` :

- `20260820000100_create_lms_schema.sql` crée le cœur du LMS ;
- `20260820000200_expand_lms_governance.sql` ajoute la gouvernance, les certificats et le passeport ;
- `20260820000300_seed_2026_catalogues.sql` importe les 144 formations ;
- `20260822000100_remove_automatic_enrollments.sql` supprime les anciennes affectations automatiques et trace la source des nouvelles affectations ;
- `20260822000200_content_studio_scorm_quizzes.sql` ajoute le studio de contenus, les métadonnées SCORM et les QCM enrichis ;
- `20260825000100_quiz_assignments_training_groups.sql` ajoute le cycle complet des QCM, leurs affectations ciblées et les groupes de formation ;
- `20260822000300_passport_employee_directory.sql` crée l’annuaire RH synchronisé et son cycle de création d’accès.

Netlify détecte ce dossier et applique les migrations juste avant la publication. Si une migration échoue, le déploiement n’est pas publié : corrigez la migration, créez-en une nouvelle et relancez le déploiement. Ne modifiez pas une migration déjà appliquée en production.

## 4. Activer l’authentification

1. Ouvrez **Project configuration → Identity**.
2. Activez Netlify Identity.
3. Pour ce LMS interne, choisissez l’inscription **sur invitation uniquement**. L’interface publique ne propose pas d’auto-inscription.
4. Configurez l’e-mail de confirmation et l’URL du site.
5. Créez normalement les accès depuis **Apprenants → Créer un accès → Depuis le Passeport**. La saisie exceptionnelle est réservée aux personnes qui ne figurent pas encore dans le Passeport.

Les nouveaux accès reçoivent le rôle `learner` par la fonction `netlify/functions/identity.mts`. Ils ne reçoivent aucune formation à la création : le tableau de bord reste vide jusqu’à une affectation réalisée depuis la fiche apprenant ou reçue par un événement explicite du Passeport.

### Confirmation et réinitialisation du mot de passe

- le lien de confirmation valide l’adresse puis ramène vers la connexion avec un message explicite ;
- le lien de récupération ouvre obligatoirement le formulaire « Choisissez un nouveau mot de passe » ;
- l’utilisateur saisit et confirme son nouveau mot de passe, puis revient à la connexion ;
- un lien utilisé, invalide ou expiré ne doit jamais ouvrir directement le tableau de bord.

## 5. Créer le premier super-administrateur

1. Invitez d’abord la personne dans **Project configuration → Identity → Users**.
2. Ouvrez sa fiche utilisateur.
3. Choisissez **Edit settings**.
4. Dans **Roles**, ajoutez exactement `super_admin` — avec le trait de soulignement.
5. Enregistrez.
6. Demandez à la personne de se déconnecter puis de se reconnecter. Un changement de rôle prend effet au prochain login ou au prochain renouvellement du jeton.

Pour un administrateur standard, utilisez exactement `admin`. Un compte ne doit pas recevoir simultanément `admin` et `super_admin`; le rôle le plus élevé est néanmoins reconnu en priorité par l’application.

La fiche « Paramètres » du LMS affiche le niveau reconnu. Les fonctions serveur vérifient également le rôle : masquer un bouton dans le navigateur ne suffit jamais à obtenir un accès.

### Règles de gouvernance conseillées

- gardez au moins deux super-administrateurs nominatifs ;
- n’utilisez jamais un compte partagé ;
- réservez `super_admin` à la gouvernance des accès et des intégrations ;
- attribuez `admin` aux personnes qui gèrent les contenus et les apprenants ;
- retirez le rôle dès qu’une responsabilité change ;
- contrôlez régulièrement `role_audit_events` et le journal Identity.

## 6. Variables d’environnement

Dans **Project configuration → Environment variables**, ajoutez :

| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL HTTPS finale du LMS, sans barre oblique finale |
| `PASSPORT_WEBHOOK_SECRET` | secret aléatoire d’au moins 32 caractères partagé uniquement entre les deux serveurs |
| `PASSPORT_ALLOWED_ORIGIN` | `https://passeportcdl.netlify.app` |

Après modification d’une variable, relancez un déploiement.

## 7. Fichiers pédagogiques

Les imports PDF, Word, PowerPoint, MP4/WebM, MP3/WAV/M4A/OGG/AAC et SCORM ZIP passent par `/.netlify/functions/upload`. Les fichiers sont validés, limités à 50 Mo et stockés dans Netlify Blobs, store `walyah-lms-content`. Le navigateur les envoie automatiquement par blocs de 3 Mo pour rester sous la limite des requêtes binaires des fonctions Netlify. Pour SCORM, le manifeste et l’intégrité du ZIP sont contrôlés après reconstitution. Les métadonnées sont enregistrées dans `resources`.

Les photos JPG, PNG et WebP sont limitées à 4 Mo et stockées séparément dans le store privé `walyah-lms-avatars`. Un apprenant modifie uniquement sa propre photo ; les administrateurs peuvent la consulter depuis sa fiche.

## 8. Vérifications après publication

1. envoyez un `employee.upsert` depuis le Passeport et vérifiez que la personne apparaît dans **Créer un accès → Depuis le Passeport** ;
2. créez son accès et vérifiez qu’il reçoit `learner`, avec zéro formation, zéro certificat et zéro progression ;
3. demandez une réinitialisation et vérifiez que le lien ouvre le formulaire de nouveau mot de passe, jamais directement le tableau de bord ;
4. créez un super-administrateur, reconnectez-vous et vérifiez le tableau de bord de gouvernance ;
5. connectez-vous avec un administrateur et vérifiez le tableau de bord de pilotage opérationnel ;
6. ouvrez **Apprenants**, cliquez sur un nom et vérifiez la fiche individuelle ;
7. depuis le profil apprenant, importez une petite photo JPG ou PNG ;
8. ouvrez **Catalogues 2026** et contrôlez le compteur de 144 formations ;
9. ouvrez la fiche de cet apprenant, assignez une formation et vérifiez qu’elle apparaît alors dans son espace ;
10. passez un QCM, vérifiez le certificat, puis importez un petit PDF et contrôlez les lignes dans la base.

## 9. Si le build Netlify échoue

La ligne « `npm run build` returned non-zero exit code » n’est qu’un résumé. Remontez dans le journal jusqu’à la première erreur TypeScript ou Next.js.

Vérifiez en priorité :

- la commande est bien `npm run build:netlify` ;
- `package.json` et `package-lock.json` sont tous deux présents ;
- la version de Node respecte `package.json` (`>=22.13.0`) ;
- aucun secret n’est importé côté navigateur ;
- les sept migrations portent des noms uniques et ordonnés ;
- `NEXT_PUBLIC_SITE_URL` contient une URL HTTPS valide.

## Documentation officielle utile

- [Gérer les utilisateurs Identity et leurs rôles](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/manage-existing-users/)
- [Migrations Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)
- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
