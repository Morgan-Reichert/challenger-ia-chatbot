<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:0a0a1a,40:1a1a3e,100:5D7BFF&height=160&section=header&text=Challenger%20IA%20—%20Chatbot&fontSize=36&fontColor=ffffff&fontAlignY=45&desc=Interface%20chatbot%20complète%20·%20Débats%20·%20Interviews%20·%20STARIAX&descAlignY=68&descColor=a5b4fc" />

</div>

<div align="center">

[![STARIAX](https://img.shields.io/badge/Groupe-STARIAX-5D7BFF?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Morgan-Reichert/STARIAX)
[![Version](https://img.shields.io/badge/version-1.1.0-5D7BFF?style=for-the-badge)](#)
[![React](https://img.shields.io/badge/React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)](#)
[![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white)](#)

</div>

---

## Présentation

**Challenger IA Chatbot** est l'interface conversationnelle complète de Challenger IA — une application full-page dédiée à l'entraînement de la pensée critique, au débat face à des personnalités historiques et publiques, et à la préparation d'interviews.

Contrairement au site landing ([challenger-ia](https://github.com/Morgan-Reichert/challenger-ia)), ce repo est un outil standalone autonome avec authentification, historique persistant et abonnement premium.

---

## Fonctionnalités

### Mode Challenge — 3 personas IA
| Persona | Rôle |
|---------|------|
| **L'Architecte Logique** | Analyse la structure logique de vos arguments, identifie les failles |
| **Le Fact-Checker** | Vérifie vos affirmations, confronte vos sources |
| **L'Opposant Idéologique** | Joue l'avocat du diable, retourne vos arguments contre vous |

**Niveaux de friction :** Doux · Moyen · Extrême

### Mode Débat — 30+ personnalités
Débattez face à des figures politiques, philosophiques et entrepreneuriales reconstruites par l'IA :

- **Politique FR/EU :** Macron, Le Pen, Bardella, Mélenchon, Merkel, Meloni, Zelensky, Poutine
- **Histoire :** De Gaulle, Churchill, Napoléon, Lincoln, Mandela, Guevara
- **Philosophie :** Voltaire, Rousseau, Marx, Nietzsche, Beauvoir, Sartre, Freud
- **Tech :** Zuckerberg, Bezos, Gates, Jobs
- **Activisme :** Thunberg, MLK, Simone Veil
- **Personnalité personnalisée** (custom)

Chaque persona dispose d'un contexte Wikipedia dynamique, d'une langue d'origine et de sujets suggérés.

### Mode Interview — 6 formats
Entraînez-vous face à un interlocuteur IA adapté au contexte :
- Podcast & Médias
- Entretien d'embauche
- Oral académique
- Soutenance / Présentation
- Pitch investisseur
- Autre (personnalisable)

### Autres fonctionnalités
- **Authentification** — Google Sign-In + email/password (Firebase Auth)
- **Historique persistant** — conversations sauvegardées dans Firestore par compte
- **Projets & Dossiers** — organisation des conversations en projets colorés
- **Bibliothèque** — page dédiée à l'exploration de l'historique
- **Paramètres** — profil utilisateur, préférences, abonnement
- **Profil utilisateur** — contexte personnalisé injecté dans chaque conversation
- **Export PDF** — export de sessions complètes (jsPDF)
- **Pièces jointes** — images, texte, code, tableurs
- **Saisie vocale** — entrée par microphone
- **Réinitialisation mémoire** — efface le contexte API d'une conversation sans supprimer l'historique
- **Plan Free / Premium** — 20 messages/jour en gratuit, illimité en premium (Stripe + Supabase)

---

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Framework | React 19 + TypeScript 5 + Vite 6 |
| Styles | Tailwind CSS 4 |
| Animations | Motion (Framer Motion) 12 |
| Auth & BDD | Firebase Auth + Firestore |
| Abonnement | Supabase + Stripe |
| PDF | jsPDF + pdfjs-dist |
| Markdown | react-markdown |
| Icônes | Lucide React |
| Déploiement | Vercel |

---

## Installation & Lancement

**Prérequis :** Node.js 18+

```bash
git clone https://github.com/Morgan-Reichert/challenger-ia-chatbot.git
cd challenger-ia-chatbot
npm install
cp .env.example .env.local
# Remplir les variables d'environnement (voir ci-dessous)
npm run dev
# → http://localhost:3000
```

Variables d'environnement requises :
```env
VITE_GEMINI_API_KEY=...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=...
```

---

## Structure du Projet

```
challenger-ia-chatbot/
├── src/
│   ├── App.tsx              # Application principale + logique de chat
│   ├── LibraryPage.tsx      # Page bibliothèque (historique)
│   ├── SettingsPage.tsx     # Page paramètres + abonnement
│   ├── debatePersonas.ts    # 30+ personnalités pour le mode débat
│   ├── interviewTypes.ts    # 6 types d'interviews
│   ├── userProfile.ts       # Profil utilisateur + injection contexte
│   ├── pdfExport.ts         # Export PDF des sessions
│   ├── firebase.ts          # Config Firebase Auth + Firestore
│   ├── supabase.ts          # Config Supabase + gestion plans
│   ├── index.css            # Styles globaux
│   └── main.tsx             # Point d'entrée
├── api/
│   ├── search-context.js    # API Wikipedia pour contexte débat
│   └── stripe-webhook.js    # Webhook Stripe (gestion abonnements)
├── public/
├── vercel.json
├── vite.config.ts
└── tsconfig.json
```

---

## Plans

| | Free | Premium |
|--|------|---------|
| Messages/jour | 20 | Illimité |
| Modes | Challenge · Débat · Interview | Challenge · Débat · Interview |
| Historique | ✅ | ✅ |
| Export PDF | ✅ | ✅ |
| Pièces jointes | ✅ | ✅ |
| Profil utilisateur | ✅ | ✅ |
| Saisie vocale | ✅ | ✅ |

---

## Groupe Stariax

| Projet | Description | Statut |
|--------|-------------|--------|
| [Challenger IA](https://github.com/Morgan-Reichert/challenger-ia) | Plateforme IA — site landing | ✅ Live |
| [Challenger IA Chatbot](https://github.com/Morgan-Reichert/challenger-ia-chatbot) | Interface chatbot complète | ✅ Live |
| [MindScope](https://github.com/Morgan-Reichert/mindscope) | Suivi santé mentale avec IA locale | ✅ v1.0 |
| [NightWatch](https://github.com/Morgan-Reichert/nightwatch) | PWA sociale de suivi en soirée | ✅ Live |
| [Stariax Showcase](https://github.com/Morgan-Reichert/stariax-showcase) | Site vitrine du groupe | ✅ Live |

---

*Stariax Belgium — Bruxelles, 2026*
