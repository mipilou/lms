# Importer des QCM dans Walyah Académie

Le studio accepte deux formats :

- `public/modeles/qcm-walyah-modele.xlsx` pour une préparation simple dans Excel ;
- `public/modeles/qcm-walyah-exemple.json` pour un échange avec un outil informatique.

Chaque import est contrôlé avant l’enregistrement. L’interface indique la ligne et la règle concernées lorsqu’une donnée est invalide. Les lignes valides restent disponibles dans l’aperçu.

## Modèle Excel

La feuille à importer doit s’appeler `Questions` ou être la première feuille du classeur. La première ligne contient les en-têtes suivants :

| Colonne | Obligatoire | Règle |
|---|---:|---|
| `type` | Oui | `choix_unique`, `choix_multiple`, `vrai_faux` ou `reponse_courte` |
| `question` | Oui | Intitulé visible par l’apprenant |
| `reponse_a` à `reponse_f` | Selon le type | De 2 à 6 propositions pour les choix uniques ou multiples |
| `bonnes_reponses` | Oui | Lettre unique `B`, lettres séparées par `|` comme `A|C`, ou réponses textuelles séparées par `|` |
| `explication` | Non | Correction pédagogique affichable après la réponse |
| `points` | Oui | Nombre entier de 1 à 10 |

Règles particulières :

- `choix_unique` : une seule lettre dans `bonnes_reponses` ;
- `choix_multiple` : une ou plusieurs lettres, par exemple `A|C` ;
- `vrai_faux` : `A` signifie Vrai et `B` signifie Faux ;
- `reponse_courte` : les formulations acceptées sont séparées par `|` et les colonnes de réponses A à F restent vides ;
- 100 questions maximum par questionnaire ;
- les cellules fusionnées et les formules ne doivent pas être utilisées dans la feuille `Questions` ;
- les lignes totalement vides sont ignorées.

## Modèle JSON

Le JSON accepte la structure suivante :

```json
{
  "title": "Évaluation finale",
  "courseId": "hygiene-mains",
  "threshold": 80,
  "questions": [
    {
      "type": "multiple",
      "prompt": "Quels éléments doivent être vérifiés ?",
      "options": ["Élément A", "Élément B", "Élément C", "Élément D"],
      "correctAnswers": [0, 2],
      "acceptedAnswers": [],
      "explanation": "Les éléments A et C sont indispensables.",
      "points": 2
    }
  ]
}
```

- `threshold` est compris entre 0 et 100 ;
- les index de `correctAnswers` commencent à `0` ;
- `acceptedAnswers` est utilisé uniquement pour `short_text` ;
- l’ancien champ JSON `correct` reste accepté pour les questionnaires à choix unique.

## Formats de fichiers pédagogiques

Dans chaque module, le studio accepte les PDF, Word, PowerPoint, vidéos MP4/WebM, audios MP3/WAV/M4A/OGG/AAC et packages SCORM au format ZIP. La taille maximale est de 50 Mo par fichier. Le navigateur segmente automatiquement l’envoi en blocs de 3 Mo afin de respecter la limite des requêtes binaires des fonctions Netlify, puis le serveur reconstitue et contrôle le fichier avant de l’enregistrer. Un package SCORM doit contenir un fichier `imsmanifest.xml` valide ; les chemins dangereux et les archives endommagées sont refusés.
