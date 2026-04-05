# Plan — Feature "Interview" dans la Bibliothèque

## Vue d'ensemble
Nouvel onglet **Interview** dans la LibraryPage, avec 6 modes de préparation.
Interface distincte du mode normal ET du mode débat.

---

## 1. Fichier à créer : `src/interviewTypes.ts`

Définit les 6 types d'interview :

| ID | Label | Interlocuteur IA | Thème UI |
|----|-------|-----------------|----------|
| `podcast` | Podcast & Médias | L'Animateur | Ambre/studio sombre |
| `job_interview` | Entretien d'embauche | Le Recruteur | Bleu/professionnel |
| `academic_oral` | Examen oral | Le Jury | Vert émeraude/académique |
| `presentation` | Présentation | Le Public | Jaune spotlight/scène |
| `pitch` | Pitch | L'Investisseur | Violet/startup électrique |
| `other` | Autre / Personnalisé | L'Interlocuteur | Neutre |

Chaque type contient :
- Icône lucide-react
- Couleurs accent + background
- Champs de formulaire spécifiques
- System prompt de base
- Phrase d'ouverture de l'IA

---

## 2. LibraryPage.tsx — Onglet Interview

- Onglets : `Débat` | `Interview` (même barre de navigation)
- 6 cartes de sélection de type (icône + label + courte description)
- Au clic sur une carte → **modal de configuration** :
  - Champs structurés par type (ex: poste/entreprise/secteur pour entretien)
  - Zone "infos en vrac" pour compléter librement
  - Bouton ✨ **"Reformuler avec l'IA"** → appelle Mistral pour nettoyer/structurer le contexte
  - Affichage du résultat reformulé (éditable)
  - Bouton **"Commencer"** → lance la session

---

## 3. App.tsx — Modifications

### Nouveaux champs dans `Conversation` :
```typescript
interviewType?: InterviewTypeId;
interviewContext?: string;   // contexte reformulé
interviewTitle?: string;     // ex: "Entretien Google SWE"
```

### Sérialisation : ajout de `interviewType`, `interviewContext`, `interviewTitle`

### Nouveau mode UI (interview) :
Distinct du débat (pas de banner VS) :

**Header interview** :
```
[Icône type] | "ENTRETIEN D'EMBAUCHE" | [Rôle IA — "Le Recruteur"]
```

**L'IA ouvre la session** avec une question d'introduction contextuelle (générée au lancement, pas de saisie utilisateur requise pour commencer).

**Messages** :
- User : couleur accent du type (border gauche)
- IA/interviewer : fond sombre avec couleur du type

**Input** : placeholder `"Votre réponse..."` au lieu de `"Posez votre question..."`

**Bouton "Terminer l'interview"** → affiche un bref feedback de l'IA sur la session

---

## 4. Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `src/interviewTypes.ts` | **Nouveau** — configs types |
| `src/LibraryPage.tsx` | +onglet Interview, +cartes, +modal setup |
| `src/App.tsx` | +champs Conversation, +UI interview mode |

---

## Ce qui n'est PAS dans le scope
- Pas de stockage séparé (réutilise Firestore conv existant)
- Pas de scoring automatique (feedback textuel seulement)
- Pas de timer/chronomètre
