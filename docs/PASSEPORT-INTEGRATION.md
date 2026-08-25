# Synchronisation du Passeport de formation avec le LMS Walyah Académie

Le Passeport est la source RH des collaborateurs. Le LMS est la source des accès, des affectations pédagogiques, de la progression, des QCM et des certificats. Une fiche RH synchronisée ne devient jamais automatiquement un compte de connexion.

## Parcours de création d’un collaborateur

1. Les RH ou un super-administrateur créent la personne dans le Passeport.
2. Le serveur du Passeport envoie un événement signé `employee.upsert` au LMS.
3. Le LMS ajoute ou met à jour la fiche dans `passport_employees`, au statut `pending` (« À créer »).
4. Dans le LMS, un administrateur ouvre **Apprenants → Créer un accès → Depuis le Passeport**.
5. Il recherche la personne par nom, matricule, e-mail, service ou fonction, puis clique sur **Créer l’accès**.
6. Le LMS crée ou rapproche le compte Netlify Identity, crée le profil `users` et envoie l’e-mail de définition du mot de passe.
7. Après la première connexion, le statut devient `active`.
8. Le tableau de bord de l’apprenant reste vide jusqu’à l’affectation explicite d’un parcours.

Le rapprochement utilise, dans cet ordre : identifiant externe du Passeport, matricule, puis e-mail normalisé. Si plusieurs fiches correspondent, l’API refuse l’opération afin qu’un administrateur corrige le doublon.

## Responsabilité de chaque système

| Donnée | Système maître | Effet dans l’autre système |
|---|---|---|
| identité RH, matricule, service, fonction, responsable, site | Passeport | mise à jour du dossier synchronisé et du profil LMS déjà relié |
| présence du collaborateur dans l’annuaire | Passeport | fiche disponible dans la liste « Depuis le Passeport » |
| compte de connexion et rôle | LMS / Netlify Identity | jamais créé automatiquement par le webhook RH |
| formations affectées | LMS, ou événement explicite du Passeport | une ligne `enrollments` par affectation |
| progression, résultats, certificats | LMS | événements sortants consultables par le Passeport |
| suspension de sécurité et gouvernance des rôles | LMS | ne peut pas être annulée par une simple mise à jour RH |

## Statuts de provisionnement

| Statut | Signification |
|---|---|
| `pending` | fiche reçue du Passeport, aucun accès LMS créé |
| `invited` | compte créé ou rapproché, première connexion attendue |
| `active` | compte relié et première connexion enregistrée |
| `blocked` | collaborateur inactif ou sorti dans le Passeport |
| `error` | conflit d’identifiant nécessitant un rapprochement manuel |

## API du LMS

La fonction est exposée à l’adresse :

```text
https://<domaine-du-lms>/.netlify/functions/passport-sync
```

| Méthode | Événement | Résultat |
|---|---|---|
| `POST` | `employee.upsert` | crée ou actualise une fiche dans l’annuaire RH en attente |
| `POST` | `training.requested` | crée une demande de formation pour un compte déjà relié |
| `POST` | `course.assigned` | assigne explicitement un parcours du catalogue |
| `POST` | `training.completed` | enregistre une réussite, un score et éventuellement un certificat |
| `POST` | `events.acknowledge` | confirme le traitement d’événements sortants |
| `GET` | — | renvoie jusqu’à 100 événements produits par le LMS et encore en attente |

Chaque message possède une `idempotencyKey` unique. Le même événement peut être renvoyé après une coupure réseau sans créer de doublon.

## Exemple de création ou mise à jour RH

```json
{
  "eventType": "employee.upsert",
  "idempotencyKey": "passport:employee:COL-0042:2026-08-22T11:30:00Z",
  "data": {
    "externalEmployeeId": "passeport-employee-0042",
    "matricule": "COL-0042",
    "email": "prenom.nom@entreprise.ga",
    "fullName": "Prénom Nom",
    "phone": "+241 00 00 00 00",
    "department": "Laboratoire",
    "jobTitle": "Technicien de laboratoire",
    "managerName": "Responsable du laboratoire",
    "hireDate": "2026-08-01",
    "location": "Libreville",
    "employmentStatus": "active",
    "updatedAt": "2026-08-22T11:30:00Z"
  }
}
```

Pour un départ ou une désactivation RH, envoyez `employmentStatus: "inactive"` ou `"departed"`. La fiche passe à `blocked` et le profil LMS relié devient inactif. Une mise à jour `active` ne lève pas une suspension de sécurité décidée dans le LMS.

## Signature HMAC obligatoire

Le serveur du Passeport envoie :

- `x-walyah-timestamp` : timestamp Unix en secondes ;
- `x-walyah-signature` : `sha256=` suivi du HMAC SHA-256 ;
- le corps JSON brut utilisé pour calculer la signature.

La chaîne signée est :

```text
<timestamp>.<corps JSON brut>
```

La clé est la variable serveur `PASSPORT_WEBHOOK_SECRET`. Les requêtes de plus de cinq minutes sont refusées. Le secret ne doit jamais être placé dans du JavaScript envoyé au navigateur, dans le dépôt GitHub ou dans le stockage local du Passeport.

Le site du Passeport doit donc appeler sa propre Netlify Function, par exemple `/.netlify/functions/sync-lms-employee`. Cette fonction serveur détient le secret, signe le message puis appelle l’API du LMS. Le navigateur n’envoie au serveur du Passeport que l’identifiant de la fiche à synchroniser.

## Variables à configurer

### Dans le LMS

| Variable | Valeur |
|---|---|
| `PASSPORT_WEBHOOK_SECRET` | secret aléatoire commun aux deux fonctions, au moins 32 caractères |
| `PASSPORT_ALLOWED_ORIGIN` | `https://passeportcdl.netlify.app` |
| `NEXT_PUBLIC_SITE_URL` | URL HTTPS finale du LMS |

### Dans le projet Netlify du Passeport

| Variable | Valeur |
|---|---|
| `LMS_SYNC_URL` | URL complète de `/.netlify/functions/passport-sync` sur le LMS |
| `PASSPORT_WEBHOOK_SECRET` | le même secret, enregistré uniquement dans Netlify |

Après tout changement de variable, relancez le déploiement des deux sites.

## Exemple : résultat envoyé au LMS

```json
{
  "eventType": "training.completed",
  "idempotencyKey": "passport:COL-0042:MED-01:2026-08-22",
  "data": {
    "matricule": "COL-0042",
    "courseCode": "MED-01",
    "score": 92,
    "certificate": true,
    "certificateNumber": "PASS-CDL-2026-0042"
  }
}
```

## Lire les événements produits par le LMS

Une requête `GET` signée renvoie les événements sortants en attente. Après traitement, le Passeport envoie :

```json
{
  "eventType": "events.acknowledge",
  "idempotencyKey": "ack:2026-08-22T12:00:00Z",
  "data": {
    "keys": ["completion:identite-utilisateur:identite-formation"]
  }
}
```

## Contrôles de recette

1. créer un collaborateur dans le Passeport ;
2. vérifier qu’il apparaît dans **Apprenants → Créer un accès → Depuis le Passeport** ;
3. vérifier qu’il n’apparaît pas encore dans la liste des apprenants actifs ;
4. cliquer sur **Créer l’accès** et contrôler la réception de l’e-mail ;
5. définir le mot de passe puis se connecter ;
6. vérifier que le nom vient du Passeport et que l’espace ne contient aucune formation ;
7. affecter un parcours depuis la fiche apprenant ;
8. modifier le service dans le Passeport et confirmer sa mise à jour dans le LMS ;
9. renvoyer le même événement et confirmer qu’aucun doublon n’est créé ;
10. tester un matricule en conflit et confirmer que l’opération est bloquée.

## Données sensibles

Ne transmettez que les données nécessaires à l’emploi et au suivi de formation. Les mots de passe, données médicales, diagnostics et documents patients ne doivent jamais circuler par cette API. Les journaux ne doivent contenir ni secret ni corps complet lorsqu’il inclut des données personnelles.
