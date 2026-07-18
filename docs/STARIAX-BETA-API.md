# STARIAX — Contrat d'API « Versions beta »

> **À implémenter côté STARIAX** (`stariax-app`). Ce document est le contrat
> attendu par les produits clients (ici Challenger IA). Aucun de ces endpoints
> n'existe à ce jour : `/api/beta/{id}`, `/api/betas/{id}`,
> `/api/product/{id}/beta|betas|versions` renvoient tous **404**.

Objectif : gérer des **versions beta** d'un produit, les **attribuer / retirer**
à des utilisateurs, et cibler automatiquement des populations via des
**critères**, avec **filtrage** dans l'interface d'administration.

---

## 1. Modèle de données

### `BetaVersion`
Une version beta d'un produit.

| Champ | Type | Notes |
|---|---|---|
| `id` | string | cuid |
| `productId` | string | FK produit |
| `version` | string | ex. `2.1.0-beta.3` |
| `label` | string | nom lisible, ex. « Stratège & profil cognitif » |
| `notes` | string | changelog affichable au testeur |
| `features` | string[] | **drapeaux fonctionnels** activés par cette beta |
| `status` | enum | `draft` \| `open` \| `closed` |
| `capacity` | int \| null | nombre max de testeurs (null = illimité) |
| `rolloutPercent` | int | 0–100, pour un déploiement progressif |
| `publishedAt` | datetime \| null | |

`features[]` est la clé de voûte : le produit client n'a pas à connaître les
numéros de version, il lit des drapeaux (`new_composer`, `strategist_persona`…)
et active l'interface correspondante.

### `BetaMembership`
L'attribution d'une beta à un utilisateur.

| Champ | Type | Notes |
|---|---|---|
| `id` | string | |
| `versionId` | string | FK `BetaVersion` |
| `userId` | string | **identifiant utilisateur du produit** (pour Challenger IA : UID Firebase) |
| `email` | string \| null | dénormalisé, pour le filtrage/recherche admin |
| `status` | enum | `invited` \| `active` \| `revoked` |
| `source` | enum | `manual` \| `criteria` — d'où vient l'attribution |
| `assignedAt` / `revokedAt` | datetime | |

> **Contrainte** : un utilisateur ne peut avoir qu'**une seule** membership
> `active` par produit. Lui attribuer une autre beta doit automatiquement
> passer la précédente en `revoked` (cf. §3, `PATCH`).

### `BetaCriteria`
Règles d'éligibilité automatique, rattachées à une `BetaVersion`.

```json
{
  "match": "all",
  "rules": [
    { "field": "plan",         "op": "in",      "value": ["pro"] },
    { "field": "signupBefore", "op": "lt",      "value": "2026-01-01" },
    { "field": "messageCount", "op": "gte",     "value": 50 },
    { "field": "country",      "op": "in",      "value": ["FR", "BE"] },
    { "field": "tags",         "op": "contains","value": "beta-testeur" }
  ]
}
```

`match` : `all` (ET) ou `any` (OU). Opérateurs : `eq`, `neq`, `in`, `nin`,
`lt`, `lte`, `gte`, `gt`, `contains`.

Les attributs (`plan`, `messageCount`, `country`, `tags`…) sont **fournis par
le produit** lors de la résolution (§2) — STARIAX ne connaît pas la base
utilisateurs de Challenger IA et ne doit pas la répliquer.

---

## 2. Endpoint de résolution (appelé par le produit)

C'est le seul endpoint dont Challenger IA a besoin au runtime.

```http
POST /api/beta/{productId}/resolve
Authorization: Bearer <STARIAX_PRODUCT_SECRET>
Content-Type: application/json

{
  "userId": "firebase-uid-abc123",
  "attributes": { "plan": "pro", "messageCount": 128, "country": "FR", "tags": ["beta-testeur"] }
}
```

Réponse :

```json
{
  "enrolled": true,
  "version": { "id": "cbeta_1", "version": "2.1.0-beta.3", "label": "Stratège & profil cognitif" },
  "features": ["strategist_persona", "cognitive_strengths"],
  "source": "criteria"
}
```

Non éligible → `{ "enrolled": false, "version": null, "features": [] }`.

**Ordre de résolution :** membership `active` explicite → sinon évaluation des
critères des versions `open` (et `rolloutPercent` via un hash stable de
`userId`, pour que l'utilisateur reste dans le même groupe entre deux appels).

### 🔐 Pourquoi authentifié serveur-à-serveur

Un `GET /api/beta/{id}?userId=…` public serait une **fuite de données** :
n'importe qui pourrait énumérer les UID et lire le statut beta d'autrui, voire
le `plan` et l'activité des utilisateurs.

Côté Challenger IA, cet endpoint sera donc appelé depuis une fonction
serverless (`api/beta.js`), qui :
1. vérifie l'ID token Firebase de l'appelant (`firebase-admin`, déjà en place) ;
2. n'envoie à STARIAX que l'UID **vérifié**, jamais celui fourni par le client ;
3. garde `STARIAX_PRODUCT_SECRET` côté serveur (jamais dans le bundle).

Le secret produit doit être **distinct** du token d'ingest d'erreurs, qui est
public par design et en écriture seule.

---

## 3. Endpoints d'administration (interface STARIAX)

Authentifiés par la session admin STARIAX.

### Versions
```http
GET    /api/admin/beta/{productId}/versions
POST   /api/admin/beta/{productId}/versions
PATCH  /api/admin/beta/{productId}/versions/{versionId}
DELETE /api/admin/beta/{productId}/versions/{versionId}
PUT    /api/admin/beta/{productId}/versions/{versionId}/criteria
```

### Attribution / retrait — le cœur du besoin

```http
# Attribuer une beta à un utilisateur
POST /api/admin/beta/{productId}/members
{ "userId": "uid", "versionId": "cbeta_1", "email": "user@x.fr" }

# Retirer la beta d'un utilisateur
DELETE /api/admin/beta/{productId}/members/{membershipId}

# Retirer la beta actuelle ET en attribuer une autre (opération atomique)
PATCH /api/admin/beta/{productId}/members/{membershipId}
{ "versionId": "cbeta_2" }
```

Le `PATCH` doit être **transactionnel** : passer l'ancienne membership en
`revoked` et créer la nouvelle en `active` dans la même transaction, pour ne
jamais laisser un utilisateur avec deux betas actives ou aucune.

### Filtrage (liste admin)

```http
GET /api/admin/beta/{productId}/members
      ?versionId=cbeta_1
      &status=active
      &source=manual
      &q=morgan            # recherche email / userId
      &assignedAfter=2026-07-01
      &page=1&perPage=50
```

Réponse : `{ "items": [...], "total": 137, "page": 1, "perPage": 50 }`.

### Attribution en masse par critères

```http
POST /api/admin/beta/{productId}/versions/{versionId}/apply-criteria
{ "dryRun": true }
```

`dryRun: true` renvoie le nombre d'utilisateurs qui **seraient** affectés sans
rien modifier. À exposer dans l'UI avant toute application — une attribution de
masse irréversible sur des milliers de comptes doit être prévisualisable.

---

## 4. Intégration prévue côté Challenger IA

Une fois l'API disponible :

| Fichier | Rôle |
|---|---|
| `api/beta.js` *(nouveau)* | Proxy serveur : vérifie l'ID token Firebase, appelle `/resolve`, renvoie `{features}` |
| `src/stariax.ts` *(modif)* | `getBetaFeatures()` → appelle `/api/beta` (jamais STARIAX directement) |
| `src/App.tsx` *(modif)* | `useBetaFeature('nom_du_drapeau')` pour activer l'UI concernée |

Variables d'environnement à ajouter :
```
STARIAX_PRODUCT_SECRET=      # SERVEUR uniquement — jamais de préfixe VITE_
```

---

## 5. Récapitulatif des décisions à valider

1. **`userId` = UID Firebase.** STARIAX stocke un identifiant opaque, sans
   jamais répliquer la base utilisateurs du produit.
2. **Les attributs de ciblage sont poussés par le produit** à chaque
   résolution, pas synchronisés en amont.
3. **Résolution serveur-à-serveur uniquement**, avec un secret produit distinct
   du token d'ingest.
4. **Une seule beta active par utilisateur et par produit** ; le changement de
   beta est une opération atomique.
5. **Drapeaux fonctionnels plutôt que numéros de version** dans le contrat
   client, pour découpler l'UI du versionnage.
