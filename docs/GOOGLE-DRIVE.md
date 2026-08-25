# Connexion Google Drive au Studio Walyah

Le Studio propose deux modes : coller immédiatement un lien Google Drive partagé, ou ouvrir le sélecteur Google officiel après configuration. Dans les deux cas, le LMS enregistre uniquement l’URL et les métadonnées du fichier ; le contenu reste dans Drive.

## Configuration Google Cloud

1. Créer ou sélectionner un projet Google Cloud.
2. Activer **Google Picker API** et **Google Drive API**.
3. Configurer l’écran de consentement OAuth.
4. Créer un identifiant OAuth de type **Application Web**.
5. Ajouter l’URL Netlify de production dans les origines JavaScript autorisées, par exemple `https://votre-projet.netlify.app`.
6. Créer une clé API de navigateur et la restreindre aux domaines de production et à Google Picker API / Google Drive API.
7. Relever l’identifiant client OAuth, la clé API et le numéro de projet Google Cloud (`appId`).

## Variables Netlify

Dans **Project configuration → Environment variables**, créer :

```text
NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=000000000000-xxxx.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY=AIza...
NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID=000000000000
```

Relancer ensuite un déploiement complet. Ces trois valeurs sont des identifiants destinés au navigateur ; aucune clé secrète OAuth n’est utilisée par le sélecteur. La clé API doit néanmoins être restreinte dans Google Cloud.

Le scope demandé est `drive.file` : l’administrateur choisit explicitement le fichier auquel le LMS doit faire référence. Aucun jeton Google n’est enregistré dans la base Walyah.

## Droits du fichier

Le sélecteur ne modifie pas le partage. Avant d’affecter le module, vérifier que les apprenants concernés disposent du droit d’ouverture dans Google Drive. Pour un lien collé manuellement, le Studio accepte uniquement `https://drive.google.com` et `https://docs.google.com`.
