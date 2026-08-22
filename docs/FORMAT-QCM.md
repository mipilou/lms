# Format d’import des QCM

Le modèle téléchargeable est `public/modeles/qcm-walyah-exemple.json`. Le fichier doit être encodé en UTF-8 et respecter cette structure :

```json
{
  "title": "Évaluation finale",
  "courseId": "hygiene-mains",
  "threshold": 80,
  "questions": [
    {
      "prompt": "Texte de la question",
      "options": ["Réponse A", "Réponse B", "Réponse C", "Réponse D"],
      "correct": 1,
      "explanation": "La réponse B est correcte parce que…"
    }
  ]
}
```

- `title` : titre affiché à l’apprenant ;
- `courseId` : identifiant technique du parcours publié ;
- `threshold` : score de réussite entre 0 et 100 ;
- `questions` : de 1 à 100 questions ;
- `options` : de 2 à 6 réponses ;
- `correct` : index de la bonne réponse, en commençant à `0` ;
- `explanation` : correction pédagogique affichable après la réponse.

L’interface permet aussi de créer, supprimer et modifier les questions sans fichier.
