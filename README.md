# Walyah Académie — LMS de pilotage des formations

Application web de gestion et de suivi de la formation : authentification par e-mail, espace apprenant, administration, suivi des connexions et de l’avancement, contenus vidéo ou documentaires, QCM, certificats et exports.

## Fonctionnalités

- authentification e-mail/mot de passe avec Netlify Identity ;
- rôles `learner` et `admin`, vérifiés côté serveur ;
- tableau de bord apprenant et catalogue de formations ;
- lecteur de modules, liens vidéo, ressources téléchargeables et progression ;
- QCM interactifs avec seuil de réussite et résultats ;
- suivi administrateur des apprenants, connexions et taux de complétion ;
- création de formations et de QCM ;
- import de PDF, DOCX, PPTX et MP4 dans Netlify Blobs ;
- stockage relationnel dans Netlify Database (Postgres) ;
- export CSV du suivi des apprenants ;
- interface responsive aux couleurs de Walyah Académie.

## Mettre le projet sur GitHub

Créez un dépôt GitHub vide, par exemple `walyah-academie-lms`. Décompressez l’archive, puis envoyez **tout le contenu de ce dossier** dans le dépôt. N’envoyez pas l’archive ZIP elle-même : GitHub ne la décompressera pas.

Avec l’interface GitHub :

1. cliquez sur **New repository** et créez le dépôt sans ajouter de README, de licence ni de `.gitignore` ;
2. ouvrez le dépôt, puis **Add file → Upload files** ;
3. glissez tous les fichiers et dossiers de ce projet ;
4. cliquez sur **Commit changes**.

Avec Git en ligne de commande :

```bash
git init
git add .
git commit -m "Initialisation du LMS Walyah Académie"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/walyah-academie-lms.git
git push -u origin main
```

Ne publiez jamais `node_modules`, `.next`, `.netlify` ni un fichier `.env`. Le fichier `.gitignore` les exclut déjà.

## Déployer depuis GitHub sur Netlify

1. Dans Netlify, choisissez **Add new project → Import an existing project**.
2. Sélectionnez **GitHub**, autorisez l’accès, puis choisissez le dépôt.
3. Netlify détecte Next.js. Utilisez la commande de build `npm run build` et le répertoire de publication `.next`. Ces valeurs sont déjà définies dans `netlify.toml`.
4. Lancez **Deploy**.
5. Dans **Project configuration → Identity**, activez Netlify Identity.
6. Lors du déploiement, Netlify provisionne automatiquement la base et applique la migration de `netlify/database/migrations/`. Si la base n’apparaît pas, ouvrez la page **Database** du projet et choisissez **Create a database manually**, puis redéployez.
7. Dans **Project configuration → Environment variables**, ajoutez `NEXT_PUBLIC_SITE_URL` avec l’URL HTTPS Netlify finale ou votre domaine personnalisé, puis relancez le déploiement.
8. Dans **Identity → Users**, attribuez le rôle `admin` aux comptes administrateurs. Les nouveaux comptes reçoivent le rôle `learner`.

Le mode de démonstration reste accessible hors Netlify avec les boutons **Espace apprenant** et **Espace admin**.

## Développement local

```bash
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`.

Commandes disponibles :

- `npm run dev` : serveur de développement ;
- `npm run build` : build de production ;
- `npm run start` : exécution du build ;
- `npm run lint` : contrôle statique.

## Données et sécurité

La migration initialise les tables `users`, `courses`, `modules`, `resources`, `enrollments`, `module_progress`, `quizzes`, `quiz_questions`, `quiz_attempts` et `login_events`. Les fichiers sont stockés dans Netlify Blobs ; leurs métadonnées sont enregistrées dans la base.

Les fonctions Netlify vérifient la session et le rôle côté serveur. Les écritures contrôlent l’origine de la requête. Les imports sont limités à 50 Mo et à une liste de formats autorisés. Avant une mise en production publique, complétez les mentions légales, la politique de confidentialité, les durées de conservation et les règles d’attribution du rôle administrateur.
