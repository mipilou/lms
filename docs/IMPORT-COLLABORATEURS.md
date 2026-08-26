# Importer une liste de collaborateurs

L’import se trouve dans **Administration → Apprenants → Importer une liste**.

Il alimente l’annuaire RH du LMS. Il ne crée ni compte de connexion, ni formation, ni affectation automatique. Après l’import, un administrateur peut ouvrir **Créer un accès**, rechercher la personne par son nom ou son matricule, ajouter son e-mail si nécessaire, puis créer son accès LMS.

## Colonnes reconnues

Les six premières colonnes sont obligatoires :

| Colonne | Obligatoire | Règle |
|---|---:|---|
| `matricule` | Oui | Identifiant unique, utilisé pour mettre à jour une fiche existante sans la dupliquer |
| `nom` | Oui | Nom de famille |
| `prenom` | Oui | Prénom |
| `date_de_naissance` | Oui | `JJ/MM/AAAA` ou `AAAA-MM-JJ` |
| `date_entree` | Oui | `JJ/MM/AAAA` ou `AAAA-MM-JJ` |
| `poste` | Oui | Intitulé du poste |
| `service` | Non | Utilisé pour le classement par service |
| `email` | Non | Peut être ajouté au moment de créer l’accès LMS |

Le modèle prêt à remplir est disponible dans l’application : **Modèle Excel**.

## Import Excel

1. Télécharger le modèle.
2. Remplacer ou supprimer la ligne d’exemple.
3. Conserver les en-têtes de la ligne 4.
4. Enregistrer au format `.xlsx`.
5. Sélectionner le fichier dans le LMS.
6. Corriger les erreurs signalées, puis confirmer l’import.

L’import est limité à 500 personnes par opération. La première feuille du classeur est utilisée.

## Import Google Sheets

Deux méthodes sont disponibles :

- **Choisir dans Google Drive** : le sélecteur Google lit uniquement la feuille privée choisie avec l’autorisation déjà configurée pour le LMS. Le jeton d’accès reste dans le navigateur et n’est jamais enregistré dans la base.
- **Coller un lien partagé** : utile lorsqu’on ne souhaite pas ouvrir le sélecteur Google.

Pour la méthode par lien :

1. Reprendre les mêmes en-têtes dans la feuille Google Sheets.
2. Ouvrir **Partager**.
3. Dans **Accès général**, choisir **Toute personne disposant du lien** puis **Lecteur**.
4. Copier le lien de l’onglet à importer ; le paramètre `gid` permet au LMS de sélectionner le bon onglet.
5. Coller le lien dans le LMS puis cliquer sur **Analyser la feuille**.
6. Vérifier la prévisualisation et confirmer.

Seuls les liens HTTPS du domaine `docs.google.com` sont acceptés. La fonction refuse les adresses arbitraires, les feuilles privées et les fichiers trop volumineux.

## Doublons et corrections

- Le matricule est la clé principale.
- Un matricule déjà présent met à jour la fiche existante.
- Deux lignes portant le même matricule dans un même fichier sont refusées.
- Un e-mail déjà rattaché à un autre matricule est refusé.
- Les lignes invalides sont affichées avant tout enregistrement.

Les dates de naissance sont des données personnelles : l’accès à l’import et à l’annuaire reste réservé aux administrateurs authentifiés.
