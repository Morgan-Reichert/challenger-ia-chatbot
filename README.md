<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:0a0a1a,40:1a1a3e,100:5D7BFF&height=160&section=header&text=Challenger%20IA&fontSize=44&fontColor=ffffff&fontAlignY=45&desc=Ton%20adversaire%20intellectuel.%20Challengé%20pour%20progresser.&descAlignY=68&descColor=a5b4fc" />

</div>

<div align="center">

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)
![Firebase](https://img.shields.io/badge/Firebase-11-FFCA28?style=flat-square&logo=firebase)
![Mistral AI](https://img.shields.io/badge/Mistral-AI-FF6B35?style=flat-square)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=flat-square&logo=stripe)
![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?style=flat-square&logo=vercel)

</div>

---

Challenger IA est une application web de chat IA conçue pour entraîner la **pensée critique**, l'**argumentation** et la **prise de parole en public**. L'IA ne valide pas — elle challenge, contredit, fact-check et pousse à aller plus loin.

> Développé par [Stariax Group](https://stariax.be) — Belgique

---

## Table des matières

- [Fonctionnalités](#fonctionnalités)
- [Modèle économique](#modèle-économique)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Installation locale](#installation-locale)
- [Variables d'environnement](#variables-denvironnement)
- [Déploiement](#déploiement)

---

## Fonctionnalités

### Modes de challengers

#### 3 Personas IA avec niveaux de friction

| Persona | Rôle |
|---|---|
| **L'Architecte Logique** | Déconstruit la structure argumentative, identifie les sophismes et incohérences logiques |
| **Le Fact-Checker** | Vérifie les données, exige des sources, distingue corrélation et causalité |
| **L'Opposant Idéologique** | Défend systématiquement la position contraire avec des arguments documentés |

Chaque persona dispose de **3 niveaux de friction** :

| Niveau | Comportement |
|---|---|
| **Doux** | Maïeutique bienveillante — guide et encourage |
| **Moyen** | Sceptique rationnel — rigueur sans hostilité |
| **Extrême** | Avocat du diable — déconstruction sans concession |

---

#### Mode Débat — 30+ personnages historiques

Débatez face à des personnages réels enrichis par des données **Wikipedia en temps réel**. Chaque personnage adopte son style, sa langue et son registre propre.

| Catégorie | Personnages |
|---|---|
| **Politique contemporaine** | Macron, Le Pen, Bardella, Mélenchon, Trump, Poutine, Zelensky, Merkel, Meloni, Musk |
| **Figures historiques** | De Gaulle, Churchill, Napoléon, Lincoln, Mandela, Guevara |
| **Philosophes & penseurs** | Voltaire, Rousseau, Marx, Nietzsche, Beauvoir, Sartre, Freud |
| **Entrepreneurs & tech** | Zuckerberg, Bezos, Gates, Jobs |
| **Militants & figures sociales** | Thunberg, MLK, Simone Veil |
| **Personnage custom** | Crée ton propre opposant avec son nom, son idéologie et ses positions |

Chaque personnage propose 3 sujets de débat suggérés.

---

#### Mode Interview — 6 simulations de prise de parole

Simulations immersives avec un interlocuteur IA qui pose des questions **une par une** et relance sur tes réponses.

| Type | Interlocuteur | Usage |
|---|---|---|
| **Podcast & Médias** | L'Animateur | Interview, podcast, passage radio ou TV |
| **Entretien d'embauche** | Le Recruteur | RH, technique, managérial — méthode STAR |
| **Examen oral** | Le Jury | Partiel, soutenance, concours, agrégation |
| **Présentation** | L'Évaluateur | Face à un comité, direction générale, investisseurs |
| **Pitch** | L'Investisseur | Face à des business angels ou VC |
| **Autre / Personnalisé** | L'Interlocuteur | N'importe quelle situation sur mesure |

Chaque type dispose de champs de configuration dédiés pour construire un prompt système précis.

---

### Chat intelligent

#### Mémoire conversationnelle complète
L'IA se souvient de l'intégralité de l'historique, construit sur les échanges précédents, et ne répète jamais une question déjà répondue.

#### Questions interactives
Quand l'IA juge utile d'obtenir une information avant de répondre (niveau, vocabulaire, contexte, secteur), elle affiche une **carte de question interactive** :
- **Choix multiples** — boutons cliquables qui envoient la réponse automatiquement
- **Texte libre** — champ de saisie avec envoi par Entrée

Format détecté dans la réponse IA : `[CIA_Q:{"type":"choice","q":"...","options":["A","B","C"]}]`

#### Slash Commands

| Commande | Description |
|---|---|
| `/note` | L'IA évalue la conversation et donne des conseils ciblés |
| `/oublier` | Réinitialise la mémoire contextuelle (historique conservé à l'écran) |
| `/clear` | Supprime tous les messages de la session |
| `/noprofil` | Active / désactive l'injection du profil personnel |
| `/resumepdf` | Génère et télécharge un résumé PDF structuré par l'IA |
| `/exportjson` | Télécharge la conversation en JSON brut |
| `/exportmd` | Télécharge la conversation en Markdown enrichi |
| `/copiernotion` | Copie la conversation formatée pour Notion dans le presse-papier |

---

### Pièces jointes — Analyse multimodale

Jusqu'à **3 fichiers par message** — réservé aux abonnés Pro (3 crédits par fichier).

| Type | Formats | Traitement |
|---|---|---|
| **Images** | JPG, PNG, GIF, WebP, SVG | Compression canvas (max 1024px, 85% JPEG) → Mistral Pixtral |
| **PDF** | `.pdf` | Extraction texte via pdfjs-dist (max 60 pages) |
| **Word** | `.docx` | Extraction texte via jszip |
| **PowerPoint** | `.pptx` | Extraction slide par slide |
| **Excel / Numbers** | `.xlsx`, `.numbers` | Extraction cellules via shared strings |
| **Code** | `.js`, `.ts`, `.py`, `.go`, `.rs`, `.java`, `.sql`… | Texte brut |
| **Texte** | `.txt`, `.md`, `.csv`, `.json`, `.yaml`… | Texte brut |

Taille maximale : **25 MB par fichier**.

**Drag & drop** sur toute la zone de chat avec overlay visuel animé (fond bleu translucide, bordure en pointillés, types de fichiers supportés).

---

### Profil IA Personnel

Profil utilisateur injecté dans chaque conversation pour personnaliser les réponses selon qui tu es.

| Section | Champs |
|---|---|
| **Identité** | Nom d'affichage, background personnel |
| **Professionnel** | LinkedIn, CV texte ou import PDF |
| **Personnalité** | Notes libres, type MBTI (16 types) |
| **Big Five** | Quiz intégré 10 questions → score 1–10 (Ouverture, Conscience, Extraversion, Agréabilité, Neuroticisme) |
| **Neurodiversité** | Tags TDAH / HPI / Autisme TSA / Dyslexie / Dyscalculie / Dyspraxie / Hypersensibilité / Zèbre / Autre |
| **Intérêts** | Tags libres + notes |

Export et import du profil en **JSON**.

---

### Défi Quotidien

Un défi intellectuel différent chaque jour parmi **30 thèmes rotatifs** (basé sur le jour de l'année).

- Affiché sur l'écran d'accueil avec barre de progression
- Thèmes : Philosophie, Technologie, Politique, Écologie, Économie, Bioéthique, Justice, Sciences, Cognition, Médias, Finance, Robotique, Langage, Histoire…
- **Récompense : +1 crédit** après 3 messages dans le cadre du défi
- Progression persistée en localStorage

---

### Projets & organisation

- Création de projets avec **couleur personnalisée**
- **Drag & drop** des conversations d'un projet à l'autre dans la sidebar
- Réduction / expansion des projets
- Renommage inline, suppression avec confirmation

---

### Partage de conversation

- Bouton **Partager** dans le header du chat
- Génère un lien unique `?share={id}` stocké dans Firestore (`shared/`)
- Accessible en **lecture seule sans inscription**
- Vue partagée avec CTA "Essayer Challenger IA"
- Copie du lien en un clic

---

### Exports

| Format | Commande | Contenu |
|---|---|---|
| **PDF résumé** | `/resumepdf` | Résumé structuré généré par l'IA (jsPDF) |
| **JSON brut** | `/exportjson` | Conversation complète avec métadonnées |
| **Markdown enrichi** | `/exportmd` | Fichier `.md` avec titre, date, persona, échanges horodatés |
| **Notion** | `/copiernotion` | Markdown formaté pour coller dans Notion (callouts, titres) |

---

### Mode vocal

- **Speech-to-Text** — Dictée vocale via Web Speech API
- **Text-to-Speech** — L'IA lit ses réponses à voix haute avec sélection automatique de la meilleure voix française disponible
- Nettoyage automatique du Markdown avant synthèse vocale

---

### Expérience utilisateur

| Fonctionnalité | Description |
|---|---|
| **Dark Mode** | Toggle dans la sidebar, persistance localStorage |
| **Rendu Markdown GFM** | Titres, gras, italique, listes, blockquotes, code, tableaux, séparateurs, liens |
| **Bouton Copier** | Sur chaque réponse IA — état "Copié !" pendant 2 secondes |
| **Collapse messages** | Réponses longues (> 500 caractères) condensables |
| **Recherche sidebar** | Filtre les conversations en temps réel |
| **Responsive mobile** | Sidebar en overlay, bottom nav, masquage barre sur focus input |
| **Onboarding** | Parcours guidé 3 étapes (persona → niveau → première thèse) |
| **Notifications in-chat** | Système warning / info / error avec bouton d'action, auto-dismiss 5s |
| **Consentement CGU** | Modal à la première connexion Firebase |

---

### Authentification

- **Google OAuth** — Connexion en un clic
- **Email / Mot de passe** — Inscription + connexion avec confirmation de mot de passe
- Synchronisation Firestore au login (conversations, projets, profil, usage quotidien)

---

## Modèle économique

### Plans

| | **Free** | **Pro** |
|---|---|---|
| Messages / jour | 20 | 150 |
| Messages / semaine | 100 | 700 |
| Pièces jointes | ✗ | ✓ (3 crédits / fichier) |
| Projets | ✗ | ✓ illimités |
| Débats & interviews | ✓ | ✓ |
| Profil IA | ✓ | ✓ |
| Crédits additionnels | ✓ | ✓ |

### Crédits additionnels (paiement unique)

Utilisés quand le quota journalier ou hebdomadaire est atteint. 1 message = 1 crédit. 1 fichier joint = 3 crédits supplémentaires.

| Pack | Crédits | Prix |
|---|---|---|
| Starter | 50 | 1,99 € |
| Standard | 200 | 5,99 € |
| Boost | 1 000 | 24,99 € |

### Option "Crédits automatiques"

Toggle dans les réglages : utiliser automatiquement les crédits quand le quota gratuit est épuisé, sans confirmation à chaque envoi.

### Infrastructure de paiement

- **Stripe** — Abonnement Pro (récurrent) + packs crédits (one-time via Payment Links)
- **Portail client Stripe** — Gestion de l'abonnement, factures, résiliation en libre-service
- Webhook Stripe → RPC Supabase `add_credits` pour crédit instantané après achat
- Redirection post-paiement avec bannière de confirmation dans l'app

---

## Stack technique

### Frontend

| Technologie | Version | Usage |
|---|---|---|
| **React** | 19 | Framework UI |
| **TypeScript** | 5.8 | Typage statique |
| **Vite** | 6 | Bundler & dev server |
| **Tailwind CSS** | 4 | Styling utility-first |
| **Motion** (Framer) | 12 | Animations & transitions |
| **Lucide React** | 0.546 | Bibliothèque d'icônes |
| **react-markdown** | 10 | Rendu Markdown |
| **remark-gfm** | 4 | Extension GFM (tableaux, strikethrough…) |

### Backend — Vercel Serverless Functions

| Fichier | Description |
|---|---|
| `api/chat.js` | Proxy Mistral AI avec streaming SSE |
| `api/stripe-webhook.js` | Traitement webhooks Stripe → crédits Supabase |

### Modèle IA

| | |
|---|---|
| **Fournisseur** | Mistral AI |
| **Modèle texte** | `mistral-large-latest` (ou équivalent) |
| **Modèle vision** | Pixtral (images multimodales) |
| **Streaming** | SSE (Server-Sent Events) chunk par chunk |

### Authentification & base de données

| Technologie | Usage |
|---|---|
| **Firebase Auth** | Google OAuth + Email/Password |
| **Firestore** | Conversations, projets, usage quotidien, profil utilisateur, partages |

### Paiement & crédits

| Technologie | Usage |
|---|---|
| **Stripe** | Abonnements + paiements one-time |
| **Supabase PostgreSQL** | Table `user_credits`, table `subscriptions`, RPC atomiques |

### Traitement de fichiers

| Bibliothèque | Usage |
|---|---|
| **pdfjs-dist** | Extraction texte PDF (max 60 pages) |
| **jszip** | Extraction texte Word / PowerPoint / Excel |
| **Canvas API** (natif) | Compression images avant envoi |
| **jsPDF** | Génération résumé PDF |

### Autres

| Technologie | Usage |
|---|---|
| **Vercel Analytics** | Tracking pages vues et performances |
| **Web Speech API** (natif) | Speech-to-Text + Text-to-Speech |

---

## Architecture

```
challenger-ia-chatbot/
├── api/
│   ├── chat.js                 # Proxy Mistral — SSE streaming
│   └── stripe-webhook.js       # Webhook Stripe → add_credits Supabase
├── src/
│   ├── App.tsx                 # Composant principal (~5000 lignes)
│   ├── SettingsPage.tsx        # Profil IA, abonnement, crédits, usage
│   ├── LibraryPage.tsx         # Bibliothèque — débats & interviews
│   ├── dailyChallenges.ts      # 30 défis quotidiens rotatifs
│   ├── debatePersonas.ts       # 30+ personnages avec system prompts
│   ├── interviewTypes.ts       # 6 types d'interview avec system prompts
│   ├── markdownExport.ts       # Export Markdown standard + Notion
│   ├── pdfExport.ts            # Génération résumé PDF (jsPDF)
│   ├── userProfile.ts          # Type UserProfile, MBTI, Big Five, NeuroTags
│   ├── firebase.ts             # Config Firebase Auth + Firestore
│   ├── supabase.ts             # Client Supabase, crédits, plans
│   ├── index.css               # Styles globaux, variables thème, animations
│   └── main.tsx                # Point d'entrée React
├── firestore.rules             # Règles de sécurité Firestore
├── vite.config.ts
└── package.json
```

### Flux streaming chat

```
Client → POST /api/chat
  → Vercel Function
  → Mistral API (SSE stream)
  → text/event-stream chunks → Client
  → Mise à jour React state par chunk
  → Firestore save (fin de stream)
```

### Flux achat de crédits

```
Client → Stripe Payment Link (?client_reference_id=uid)
  → Stripe checkout
  → Stripe webhook → POST /api/stripe-webhook
  → Vérification signature Stripe
  → Supabase RPC add_credits(user_id, amount)
  → Redirect client ?payment=credits
  → Rechargement solde + bannière confirmation
```

---

## Installation locale

### Prérequis

- Node.js 18+
- Compte Firebase (Firestore + Auth activés)
- Compte Supabase
- Clé API Mistral AI
- Compte Stripe (avec webhook configuré)

```bash
git clone https://github.com/Morgan-Reichert/challenger-ia-chatbot.git
cd challenger-ia-chatbot
npm install
cp .env.example .env.local
# Remplir les variables d'environnement (voir section ci-dessous)
npm run dev
```

L'application démarre sur `http://localhost:3000`.

---

## Variables d'environnement

```env
# ── Mistral AI ─────────────────────────────────────────────────────────────────
MISTRAL_API_KEY=

# ── Firebase ───────────────────────────────────────────────────────────────────
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# ── Supabase ───────────────────────────────────────────────────────────────────
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# ── Stripe — Abonnement Pro ────────────────────────────────────────────────────
VITE_STRIPE_PRO_LINK=          # Payment Link abonnement Pro
VITE_STRIPE_PORTAL_LINK=       # Lien portail client Stripe
STRIPE_WEBHOOK_SECRET=         # Secret webhook Stripe (whsec_...)

# ── Stripe — Packs crédits (Payment Links avec ?client_reference_id=uid) ──────
VITE_STRIPE_CREDITS_50=        # 50 crédits — 1,99 €
VITE_STRIPE_CREDITS_200=       # 200 crédits — 5,99 €
VITE_STRIPE_CREDITS_1000=      # 1000 crédits — 24,99 €
```

---

## Déploiement

Déploiement continu sur **Vercel** depuis la branche `main`.

```bash
git push origin main
# Vercel déclenche le build automatiquement
```

### Firestore — Règles de sécurité à publier

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{collection}/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /shared/{shareId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Supabase — Tables requises

```sql
-- Crédits utilisateurs
CREATE TABLE user_credits (
  user_id text PRIMARY KEY,
  credits int NOT NULL DEFAULT 0,
  lifetime_credits int NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Abonnements (mis à jour via webhook Stripe)
CREATE TABLE subscriptions (
  user_id text PRIMARY KEY,
  plan text NOT NULL DEFAULT 'free',
  status text,
  current_period_end timestamptz
);

-- RPC atomique : ajouter des crédits
CREATE OR REPLACE FUNCTION add_credits(p_user_id text, p_amount int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_credits (user_id, credits, lifetime_credits)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    credits = user_credits.credits + p_amount,
    lifetime_credits = user_credits.lifetime_credits + p_amount,
    updated_at = now();
END;
$$;

-- RPC atomique : déduire un crédit
CREATE OR REPLACE FUNCTION deduct_one_credit(p_user_id text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_credits SET credits = GREATEST(0, credits - 1), updated_at = now()
  WHERE user_id = p_user_id AND credits >= 1;
END;
$$;
```

---

<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:5D7BFF,100:0a0a1a&height=80&section=footer" />

**© 2026 Stariax Group — Belgique**

</div>
