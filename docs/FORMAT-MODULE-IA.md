# Format d’import des modules générés par IA

Le Studio Walyah accepte un manifeste JSON versionné `walyah-lms-module-v1`. Un fichier peut contenir de 1 à 20 modules. Chaque module est contrôlé dans le navigateur puis à nouveau par la fonction serveur avant son insertion dans `modules.lesson_content`.

Le fichier de référence téléchargeable est `public/modeles/module-ia-walyah-exemple.json`.

## Mise en page attendue

L’IA doit construire un module lisible dans cet ordre recommandé :

1. `hero` : promesse du module et intérêt concret pour l’apprenant ;
2. `objectives` : trois à cinq objectifs observables ;
3. `text` : explication découpée en paragraphes courts ;
4. `steps` : méthode ou procédure applicable ;
5. `callout` : vigilance, bonne pratique ou information clé ;
6. `case_study` : situation professionnelle réaliste et consigne ;
7. `knowledge_check` : question flash avec deux à six options ;
8. `summary` : trois à cinq idées à retenir.

Trois styles sont disponibles : `signature` pour un rendu éditorial, `atelier` pour une progression très pratique et `essentiel` pour un module court et compact.

## Prompt à donner à une IA

```text
Crée un module de formation professionnel en français au format JSON strict Walyah.
Retourne uniquement du JSON valide, sans Markdown ni commentaire.
Utilise schemaVersion "walyah-lms-module-v1" et la structure exacte du fichier
module-ia-walyah-exemple.json. Le public est [PUBLIC], la durée est [DURÉE]
et le thème est [THÈME]. Utilise des phrases courtes, des objectifs observables,
un cas professionnel réaliste, une question de vérification avec l’index de la
bonne réponse commençant à 0, puis une synthèse. Tous les liens doivent être HTTPS.
N’invente aucune source, norme, obligation légale ou donnée personnelle.
```

## Règles d’import

- fichier `.json` de 2 Mo maximum ;
- 1 à 20 modules par fichier ;
- 1 à 30 blocs par module ;
- types de blocs : `hero`, `text`, `objectives`, `steps`, `callout`, `case_study`, `knowledge_check`, `summary` ;
- 20 objectifs maximum ;
- une question flash contient 2 à 6 options et `correctAnswer` est un index commençant à 0 ;
- 25 ressources maximum par module ;
- toutes les ressources utilisent une adresse HTTPS ;
- types de ressources : `video`, `audio`, `document`, `external`, `drive`.

Après l’import, l’administrateur peut modifier chaque bloc, changer le style, réordonner les sections et prévisualiser le rendu avant publication.
