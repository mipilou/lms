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
- `20260820000300_seed_2026_catalogues.sql` importe les 144 formations.
- `20260822000100_remove_automatic_enrollments.sql` supprime les anciennes affectations automatiques et trace la source des nouvelles affectations.

Netlify détecte ce dossier et applique les migrations juste avant la publication. Si une migration échoue, le déploiement n’est pas publié : corrigez la migration, créez-en une nouvelle et relancez le déploiement. Ne modifiez pas une migration déjà appliquée en production.

## 4. Activer l’authentification

1. Ouvrez **Project configuration → Identity**.
2. Activez Netlify Identity.
3. Pour un LMS interne, choisissez de préférence l’inscription **sur invitation uniquement**.
4. Configurez l’e-mail de confirmation et l’URL du site.
5. Invitez les apprenants depuis **Identity → Users** ou utilisez leur création de compte selon votre politique.

Les nouvelles inscriptions reçoivent automatiquement le rôle `learner` par la fonction `netlify/functions/identity.mts`. Elles ne reçoivent aucune formation à l’inscription : le tableau de bord reste vide jusqu’à une affectation réalisée depuis la fiche apprenant ou reçue du Passeport.

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
| `PASSPORT_ALLOWED_ORIGIN` | origine HTTPS exacte du Passeport de formation |

Après modification d’une variable, relancez un déploiement.

## 7. Fichiers pédagogiques

Les imports PDF, DOCX, PPTX et MP4 passent par `/.netlify/functions/upload`. Les fichiers sont validés, limités à 50 Mo et stockés dans Netlify Blobs, store `walyah-lms-content`. Les métadonnées sont enregistrées dans `resources`.

## 8. Vérifications après publication

1. créez un apprenant et vérifiez qu’il reçoit `learner`, avec zéro formation, zéro certificat et zéro progression ;
2. créez un super-administrateur et reconnectez-vous ;
3. ouvrez **Apprenants**, cliquez sur un nom et vérifiez la fiche individuelle ;
4. ouvrez **Catalogues 2026** et contrôlez le compteur de 144 formations ;
5. ouvrez la fiche de cet apprenant, assignez une formation et vérifiez qu’elle apparaît alors dans son espace ;
6. passez un QCM et vérifiez le certificat ;
7. importez un petit PDF ;
8. consultez les lignes dans **Data & Storage → Database**.

## 9. Si le build Netlify échoue

La ligne « `npm run build` returned non-zero exit code » n’est qu’un résumé. Remontez dans le journal jusqu’à la première erreur TypeScript ou Next.js.

Vérifiez en priorité :

- la commande est bien `npm run build:netlify` ;
- `package.json` et `package-lock.json` sont tous deux présents ;
- la version de Node respecte `package.json` (`>=22.13.0`) ;
- aucun secret n’est importé côté navigateur ;
- les quatre migrations portent des noms uniques et ordonnés ;
- `NEXT_PUBLIC_SITE_URL` contient une URL HTTPS valide.

## Documentation officielle utile

- [Gérer les utilisateurs Identity et leurs rôles](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/manage-existing-users/)
- [Migrations Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)
- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
