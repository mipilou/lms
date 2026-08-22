# Connexion entre le LMS et le Passeport de formation CDL

Le Passeport v29 actuel conserve ses données dans le navigateur et permet l’import/export Excel. Pour une synchronisation durable, il doit appeler l’API serveur du LMS ou passer par un petit service sécurisé. Le secret ne doit jamais être intégré dans le fichier HTML du passeport.

## Principe

La fonction `/.netlify/functions/passport-sync` reçoit et expose des événements. Les deux systèmes se rapprochent d’abord sur `matricule`, puis sur l’e-mail si le matricule n’est pas disponible.

| Sens | Événements | Résultat |
|---|---|---|
| Passeport → LMS | `employee.upsert` | crée ou actualise le dossier collaborateur |
| Passeport → LMS | `training.requested` | crée une demande de formation |
| Passeport → LMS | `course.assigned` | assigne un parcours du catalogue |
| Passeport → LMS | `training.completed` | enregistre la réussite, le score et le certificat |
| LMS → Passeport | `training.completed` | transmet une réussite ou un certificat produit dans le LMS |
| Passeport → LMS | `events.acknowledge` | confirme que les événements sortants ont été traités |

Chaque message comporte une `idempotencyKey` unique. Un même événement peut être renvoyé sans créer de doublon.

## Sécurité HMAC

Le client serveur envoie :

- `x-walyah-timestamp` : timestamp Unix en secondes ;
- `x-walyah-signature` : `sha256=` suivi du HMAC SHA-256 ;
- le corps JSON brut.

La chaîne signée est :

```text
<timestamp>.<corps JSON brut>
```

La clé est la variable Netlify `PASSPORT_WEBHOOK_SECRET`. Les requêtes de plus de cinq minutes sont refusées. `PASSPORT_ALLOWED_ORIGIN` limite également l’origine web autorisée, mais la signature HMAC reste le contrôle principal.

## Exemple : résultat de formation envoyé au LMS

```json
{
  "eventType": "training.completed",
  "idempotencyKey": "passport:CDL-ACC-014:MED-01:2026-08-20",
  "data": {
    "matricule": "CDL-ACC-014",
    "email": "nom.prenom@entreprise.ga",
    "courseCode": "MED-01",
    "score": 92,
    "certificate": true,
    "certificateNumber": "PASS-CDL-2026-0042"
  }
}
```

## Exemple : demande de formation

```json
{
  "eventType": "training.requested",
  "idempotencyKey": "passport:req:CDL-LAB-027:2026-08-20T09:30:00Z",
  "data": {
    "matricule": "CDL-LAB-027",
    "courseCode": "HS-LAB03",
    "title": "Gestion des échantillons biologiques",
    "reason": "Besoin identifié lors de l’entretien annuel",
    "priority": "high"
  }
}
```

## Lire les événements produits par le LMS

Une requête `GET` signée sur `/.netlify/functions/passport-sync` renvoie au maximum 100 événements sortants en attente. Une fois traités, le passeport envoie :

```json
{
  "eventType": "events.acknowledge",
  "idempotencyKey": "ack:2026-08-20T10:00:00Z",
  "data": {
    "keys": ["completion:identite-utilisateur:identite-formation"]
  }
}
```

## Adaptation recommandée du Passeport v29

1. conserver son interface, sa gestion des rôles et ses vues collaborateur/manager ;
2. ajouter une file locale des changements tant que l’utilisateur est hors ligne ;
3. envoyer cette file à un service serveur qui détient le secret HMAC ;
4. stocker dans le passeport l’identifiant externe renvoyé par le LMS ;
5. afficher la date et l’état de la dernière synchronisation ;
6. prévoir une résolution manuelle lorsque matricule et e-mail désignent des personnes différentes ;
7. garder l’import/export Excel comme solution de reprise, pas comme source principale.

## Données sensibles

Ne transmettez que les données nécessaires au suivi de formation. Les mots de passe, notes médicales, diagnostics et documents patients ne doivent jamais circuler par cette API. Journalisez les erreurs sans enregistrer le secret ni le corps complet lorsqu’il contient des données personnelles.
