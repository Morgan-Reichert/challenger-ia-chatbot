# -*- coding: utf-8 -*-
"""Document 1 — Documentation technique complète."""
import sys
sys.path.insert(0, '/private/tmp/claude-501/-Users-morganreichert-Desktop/fac985ec-9a3a-45eb-aaad-b8999a34be87/scratchpad')
from pdfkit_cia import generer_document, AMBRE, ROUGE
import legal_cia as L

SORTIE = '/Users/morganreichert/Desktop/challenger-ia-chatbot/docs/CIA-DOC-01_Documentation-technique.pdf'

META = dict(
    titre="Documentation technique",
    sous_titre="Architecture, infrastructure, modules et exploitation<br/>Application web et mobile native",
    reference="CIA-DOC-01",
    version=L.VERSION,
    date=L.DATE,
    resume="",
)


def remplir(d):
    d.couverture()
    d.mentions_legales(L.blocs(
        "Le présent document constitue la documentation technique de référence du "
        "logiciel Challenger IA : architecture applicative, pile technologique, "
        "inventaire des modules, interfaces de programmation, modèle de données, "
        "sécurité et procédures d'exploitation."))
    d.sommaire()

    # ─── Présentation ────────────────────────────────────────────────────────
    d.titre1("Présentation générale du système")
    d.para("Challenger IA est une application conversationnelle d'entraînement à la "
           "pensée critique. Contrairement à un assistant conversationnel généraliste, "
           "dont l'objectif implicite est de satisfaire l'utilisateur, le système est "
           "conçu pour le contredire de manière argumentée, vérifier ses affirmations "
           "et mesurer dans la durée la qualité de son raisonnement.")
    d.para("Le système repose sur trois piliers techniques distinctifs : un moteur de "
           "personas différenciés structurellement, chacun imposant sa propre structure "
           "de sortie ; un moteur de vérification factuelle multidimensionnel ; et un "
           "profil cognitif longitudinal qui alimente en retour les instructions "
           "système des conversations suivantes.")

    d.titre2("Caractéristiques du produit")
    d.tableau(["Caractéristique", "Valeur"], [
        ["Nom du produit", "Challenger IA"],
        ["Version applicative", "1.1.0 (package.json)"],
        ["Éditeur", "STARIAX GROUP — European Tech Group"],
        ["Domaine public", "challengeria.fr"],
        ["Hébergement de production", "Vercel (fonctions serverless et réseau de diffusion)"],
        ["Identifiant applicatif natif", "tech.stariax.challengeria"],
        ["Plateformes", "Web (application web progressive), iOS, Android"],
        ["Langue de l'interface et des réponses", "Français"],
        ["Volume de code applicatif", "16 581 lignes TypeScript (src/) et 1 372 lignes JavaScript (api/)"],
    ], largeurs=[38, 62])

    d.titre2("Périmètre fonctionnel")
    d.puces([
        "<b>Chat critique</b> — cinq personas (Architecte, Fact-Checker, Opposant, "
        "Arbitre, Stratège) déclinables sur trois niveaux de friction.",
        "<b>Mode débat</b> — incarnation de trente-cinq personnalités historiques et "
        "contemporaines, complétée par un persona personnalisable.",
        "<b>Mode entraînement</b> — douze formats de simulation d'entretien : podcast, "
        "entretien d'embauche, oral académique, jurys, présentation, argumentaire.",
        "<b>Vérification factuelle</b> — moteur de deuxième génération avec recherche "
        "web intégrée, notation de fiabilité des sources et carte de verdict "
        "multidimensionnelle.",
        "<b>Profil cognitif</b> — détection des biais de raisonnement récurrents et des "
        "réflexes solides, avec suivi de progression hebdomadaire.",
        "<b>Défi quotidien</b> — sujet renouvelé chaque jour, généré par lot "
        "hebdomadaire, récompensé en crédits.",
        "<b>Outils partenaires</b> — six déclinaisons métier : journalisme, éducation, "
        "santé, politique, entreprise, création de contenu.",
        "<b>Monétisation</b> — offre gratuite, abonnement Pro et crédits à l'unité, "
        "opérés via Stripe.",
    ])

    # ─── Architecture ────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Architecture applicative")

    d.titre2("Vue d'ensemble")
    d.para("L'architecture est une application monopage servie statiquement, adossée à "
           "des fonctions serverless pour tout traitement nécessitant un secret ou une "
           "autorité. Aucun appel à un fournisseur de modèle de langage n'est effectué "
           "depuis le navigateur : la clé d'interface de programmation demeure "
           "exclusivement côté serveur.")
    d.code("""  NAVIGATEUR / APPLICATION NATIVE (Capacitor)
      |  React 19 + Vite 6 + Tailwind 4
      |  Firebase Auth (jeton d'identite) .......... identite
      |  Firestore ................................. conversations, profils
      |
      |  apiFetch() : injecte Authorization: Bearer <jeton>
      v
  RESEAU DE PERIPHERIE (Vercel Edge)
      |  middleware.ts ............................. coupure de site (STARIAX)
      v
  FONCTIONS SERVERLESS  /api/*
      |  verifyIdToken() (Firebase Admin) .......... l'uid vient TOUJOURS du jeton
      |  check_chat_quota() (procedure Supabase) ... debit atomique
      |
      +--> Mistral AI .............................. inference
      +--> Tavily ................................. recherche web
      +--> Supabase ............................... credits, quotas, abonnements
      +--> Stripe ................................. paiement
      +--> Resend ................................. courriel transactionnel
      +--> STARIAX ................................ maintenance, beta, erreurs""")

    d.titre2("Principe de sécurité structurant")
    d.encadre(
        "L'identifiant utilisateur n'est jamais accepté depuis le client",
        "Toutes les fonctions serverless dérivent l'identifiant utilisateur du jeton "
        "Firebase vérifié (api/_lib/admin.js), jamais du corps de la requête. Cette "
        "règle rend structurellement impossible la lecture ou la modification du compte "
        "d'un tiers par manipulation de la requête. Elle s'applique sans exception aux "
        "points d'entrée /api/chat, /api/credits et /api/beta.")

    d.titre2("Pile technologique")
    d.titre3("Dépendances de production")
    d.tableau(["Domaine", "Bibliothèque", "Version", "Rôle"], [
        ["Interface", "react / react-dom", "^19.0.0", "Rendu"],
        ["Interface", "motion", "^12.23.24", "Animations"],
        ["Interface", "lucide-react", "^0.546.0", "Iconographie"],
        ["Interface", "react-markdown, remark-gfm", "^10.1.0 / ^4.0.1", "Rendu des réponses"],
        ["Construction", "vite", "^6.2.0", "Empaquetage et serveur de développement"],
        ["Construction", "tailwindcss, @tailwindcss/vite", "^4.1.14", "Styles"],
        ["Identité", "firebase", "^11.0.0", "Authentification et Firestore côté client"],
        ["Identité", "firebase-admin", "^12.7.0", "Vérification des jetons côté serveur"],
        ["Données", "@supabase/supabase-js", "^2.101.1", "Crédits, quotas, abonnements"],
        ["Paiement", "stripe", "^22.0.0", "Abonnements et crédits"],
        ["Natif", "@capacitor/core, ios, android", "^8.4.2", "Encapsulation mobile"],
        ["Natif", "@capacitor/share, filesystem", "^8.0.1 / ^8.1.2", "Partage de verdict"],
        ["Documents", "jspdf", "^4.2.1", "Export PDF de session"],
        ["Documents", "pdfjs-dist", "^5.6.205", "Lecture des pièces jointes PDF"],
        ["Documents", "jszip", "^3.10.1", "Export groupé"],
        ["Notification", "web-push", "^3.6.7", "Notifications poussées"],
        ["Mesure", "@vercel/analytics", "^2.0.1", "Audience"],
    ], largeurs=[15, 30, 22, 33])

    d.titre3("Outillage de développement")
    d.para("typescript ~5.8.2, @types/node ^22.14.0, @types/react-dom ^19.2.3. La "
           "vérification de types constitue l'unique contrôle automatisé du projet : "
           "la commande npm run lint exécute tsc --noEmit.")

    d.encadre(
        "Points de vigilance relevés lors de l'inventaire",
        "1) Le fichier tsconfig.json ne déclare que le répertoire src : les fonctions "
        "serverless (api/*.js) et middleware.ts échappent donc à la vérification de "
        "types exécutée en intégration continue. 2) Le paquet @types/react n'est pas "
        "déclaré dans package.json. 3) Aucun test automatisé n'est présent dans le "
        "projet. 4) Plusieurs outils de construction (vite, tailwindcss, @capacitor/cli) "
        "sont déclarés en dépendances de production plutôt qu'en dépendances de "
        "développement.", AMBRE)

    # ─── Modules ─────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Inventaire des modules applicatifs")
    d.para("Le répertoire src/ comprend trente-trois fichiers TypeScript pour "
           "16 581 lignes. Le composant racine App.tsx en concentre 40 %, ce qui "
           "constitue le principal point de dette technique structurelle du projet.")

    d.titre2("Modules principaux")
    d.tableau(["Fichier", "Lignes", "Rôle"], [
        ["src/App.tsx", "6 630", "Composant racine : chat, authentification, personas, barre latérale, dossiers, pièces jointes, mode vocal, crédits"],
        ["src/debatePersonas.ts", "1 708", "Bibliothèque des trente-cinq personas de débat et persona personnalisable"],
        ["src/SettingsPage.tsx", "1 511", "Réglages : profil, neuro-atypies, Big Five, abonnement, crédits, export et import"],
        ["src/outils/JournalismeApp.tsx", "1 351", "Outil partenaire Journalisme"],
        ["src/interviewTypes.ts", "722", "Configuration des douze formats d'entraînement à l'entretien"],
        ["src/outils/OutilsPage.tsx", "701", "Portail des outils partenaires"],
        ["src/LibraryPage.tsx", "515", "Bibliothèque d'entraînements"],
    ], largeurs=[30, 10, 60])

    d.titre2("Modules de traitement")
    d.tableau(["Fichier", "Lignes", "Rôle"], [
        ["src/viz/VizBlocks.tsx", "349", "Rendu des visuels honnêtes : balance, carte d'argument, verdict"],
        ["src/viz/vizParse.ts", "199", "Analyse tolérante des marqueurs de visuel"],
        ["src/cognitive.ts", "229", "Profil cognitif : biais, forces, progression"],
        ["src/pdfExport.ts", "316", "Export PDF de session"],
        ["src/markdownExport.ts", "191", "Export Markdown"],
        ["src/verdictShare.ts", "158", "Partage natif d'une carte de verdict"],
        ["src/dailyChallenges.ts", "146", "Défis quotidiens et progression"],
        ["src/sounds.ts", "186", "Effets sonores générés par synthèse audio, sans aucun fichier son"],
        ["src/factcheck/SourcesPanel.tsx", "118", "Panneau de sources et puces de citation"],
    ], largeurs=[30, 10, 60])

    d.titre2("Modules d'infrastructure")
    d.tableau(["Fichier", "Lignes", "Rôle"], [
        ["src/stariax.ts", "136", "Client STARIAX : maintenance, logo, offres, remontée d'erreurs"],
        ["src/StariaxGate.tsx", "107", "Neutralisation d'interface côté client, indispensable en natif"],
        ["src/beta.ts", "101", "Résolution du statut bêta via le relais serveur"],
        ["src/BetaBadge.tsx", "47", "Badge de version bêta"],
        ["src/supabase.ts", "94", "Client Supabase navigateur, clé anonyme"],
        ["src/firebase.ts", "81", "Initialisation Firebase et persistance de session"],
        ["src/apiClient.ts", "35", "Enveloppe de requête : injection du jeton, base d'appel native"],
        ["src/push.ts", "62", "Agent de service et abonnement aux notifications"],
        ["src/userProfile.ts", "154", "Types et persistance du profil utilisateur"],
        ["src/ErrorBoundary.tsx", "57", "Écran de secours et remontée des erreurs de rendu"],
        ["src/stariaxErrors.ts", "32", "Capture des erreurs d'exécution non gérées"],
        ["src/main.tsx", "20", "Point d'entrée de l'application"],
    ], largeurs=[30, 10, 60])

    # ─── API ─────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Interfaces de programmation serverless")
    d.para("Quinze fonctions serverless, écrites en JavaScript, totalisant 1 372 lignes. "
           "Trois modules partagés assurent l'authentification, la gestion des origines "
           "et le contrôle de quota.")

    d.titre2("Modules partagés")
    d.tableau(["Module", "Rôle", "Variables d'environnement"], [
        ["api/_lib/admin.js", "Vérification du jeton Firebase transmis en en-tête d'autorisation. Mode dégradé si non configuré.",
         "FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY"],
        ["api/_lib/cors.js", "En-têtes d'origine pour l'application native et traitement de la requête préalable.", "—"],
        ["api/_lib/quota.js", "Limitation de débit, quota journalier et débit de crédits, de manière atomique.",
         "VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHAT_RATE_LIMIT_PER_MIN (30), CHAT_FREE_DAILY_LIMIT (20), CHAT_PRO_DAILY_LIMIT (150)"],
    ], largeurs=[22, 40, 38])

    d.titre2("Points d'entrée")
    d.tableau(["Route", "Méthode", "Rôle"], [
        ["/api/chat", "POST", "Relais vers Mistral AI avec diffusion en flux, recherche web automatique et notation des sources. Authentifié et soumis à quota."],
        ["/api/credits", "GET, POST", "Lecture du solde et de l'offre ; réclamation de la récompense quotidienne et débit d'un crédit."],
        ["/api/beta", "GET", "Résolution du statut bêta via STARIAX, sans exposer l'identifiant utilisateur ni le secret produit."],
        ["/api/generate-challenges", "Planifié", "Génération hebdomadaire de sept défis quotidiens, écrits dans Firestore."],
        ["/api/reengagement", "Planifié", "Relance par courriel des utilisateurs inactifs ayant consenti aux communications."],
        ["/api/send-reset", "POST", "Courriel de réinitialisation de mot de passe personnalisé."],
        ["/api/stripe-webhook", "POST", "Réception des événements Stripe, avec vérification de signature sur le corps brut."],
        ["/api/push-subscribe", "POST", "Enregistrement de l'abonnement aux notifications."],
        ["/api/push-broadcast", "POST", "Diffusion d'une notification à l'ensemble des abonnés. Protégé par jeton partagé."],
        ["/api/marketing-consent", "POST", "Enregistrement du consentement aux communications et désabonnement."],
        ["/api/search-context", "GET", "Contexte encyclopédique pour les personas de débat."],
        ["/api/reset-debug", "—", "Diagnostic de configuration du service de courriel. Marqué TEMPORAIRE dans le code."],
    ], largeurs=[24, 12, 64])

    d.encadre(
        "Points d'entrée nécessitant une révision",
        "api/search-context.js ne comporte ni contrôle d'origine, ni authentification, "
        "ni limitation de débit : il relaie des requêtes arbitraires vers des services "
        "tiers. api/reset-debug.js porte la mention « TEMPORAIRE — À SUPPRIMER » dans "
        "son en-tête, n'est pas authentifié et ne vérifie pas la méthode HTTP ; il "
        "expose publiquement l'état de configuration du service d'envoi de courriels. "
        "Ces deux points devraient être traités avant une ouverture large du service.",
        ROUGE)

    d.titre2("Chaîne de traitement d'une requête de conversation")
    d.para("La fonction api/chat.js applique la séquence suivante, dans cet ordre :")
    d.puces([
        "Application des en-têtes d'origine et rejet de toute méthode autre que POST.",
        "Validation du corps de requête : la liste de messages et le modèle sont obligatoires.",
        "<b>Refus par défaut en production</b> — si la vérification de jeton n'est pas "
        "active, la fonction répond 503 plutôt que de servir une requête non authentifiée.",
        "Vérification du jeton Firebase ; en l'absence d'identifiant, réponse 401.",
        "Calcul du coût : un crédit, majoré de trois crédits par pièce jointe, dans la "
        "limite de trois pièces jointes.",
        "Contrôle atomique de quota. Une limitation de débit renvoie 429, un solde "
        "insuffisant renvoie 402.",
        "Détection du besoin de recherche web, interrogation du moteur de recherche puis "
        "notation de fiabilité des sources.",
        "Appel au modèle et diffusion en flux, précédée d'un événement de métadonnées "
        "portant les sources citées.",
    ])

    # ─── Modèle de données ───────────────────────────────────────────────────
    d.saut()
    d.titre1("Modèle de données")
    d.para("La persistance est répartie entre trois systèmes selon la nature de la "
           "donnée : Firestore pour le contenu utilisateur, Supabase pour les données "
           "transactionnelles et de quota, le stockage local du navigateur pour les "
           "préférences d'interface.")

    d.titre2("Firestore — contenu utilisateur")
    d.tableau(["Chemin", "Contenu"], [
        ["users/{uid}/conversations/{id}", "Conversation complète : titre, persona, niveau, messages, pièces jointes, sources"],
        ["users/{uid}/projects/{id}", "Dossier de classement : nom, couleur, état replié"],
        ["users/{uid}/meta/usage", "Compteurs d'usage journalier et hebdomadaire"],
        ["users/{uid}/meta/consent", "Preuve de consentement aux conditions générales et horodatage"],
        ["users/{uid}/meta/profile", "Copie serveur du profil utilisateur"],
        ["users/{uid}/meta/cognitive", "Profil cognitif : compteurs de biais, de forces et série hebdomadaire"],
        ["shared/{shareId}", "Conversation partagée par lien. Lecture publique."],
        ["daily_challenges/{AAAA-MM-JJ}", "Défi du jour. Lecture publique, écriture réservée au serveur."],
    ], largeurs=[32, 68])

    d.titre2("Supabase — données transactionnelles")
    d.tableau(["Table", "Colonnes principales", "Rôle"], [
        ["user_credits", "user_id (clé), credits, lifetime_credits", "Solde de crédits"],
        ["subscriptions", "user_id (clé), email, stripe_customer_id, plan, status, current_period_end", "Abonnement"],
        ["chat_usage", "user_id (clé), day, day_count, minute_window, minute_count", "Quota et limitation de débit"],
        ["daily_rewards", "user_id et day (clé composite)", "Récompense quotidienne, une par jour"],
        ["user_contacts", "user_id (clé), email, marketing_opt_in, opt_in_at, last_reengaged_at", "Consentement aux communications"],
        ["push_subscriptions", "endpoint (clé), user_id, subscription", "Abonnement aux notifications"],
        ["subscribers", "email (clé)", "Inscriptions à la lettre d'information"],
        ["daily_challenges_cache", "day (clé), payload", "Cache des défis"],
    ], largeurs=[20, 45, 35])

    d.titre3("Procédures stockées")
    d.puces([
        "<b>check_chat_quota</b> — contrôle atomique combinant la fenêtre de limitation "
        "d'une minute, le quota journalier selon l'offre, et la bascule sur les crédits "
        "lorsque le quota est épuisé. Retourne un motif normalisé.",
        "<b>claim_daily_reward</b> — attribution de la récompense quotidienne, "
        "idempotente par contrainte d'unicité sur le couple utilisateur et jour.",
        "<b>add_credits</b> et <b>deduct_one_credit</b> — mouvements de crédits.",
    ])

    d.titre2("Modèle d'habilitation")
    d.para("La sécurité d'accès repose sur deux mécanismes complémentaires, l'un dans "
           "Firestore, l'autre dans Supabase.")
    d.puces([
        "<b>Firestore</b> — les documents rattachés à un utilisateur ne sont accessibles "
        "qu'à leur propriétaire. Les défis quotidiens sont en lecture publique et en "
        "écriture interdite. Une règle terminale refuse tout accès non explicitement "
        "autorisé.",
        "<b>Supabase</b> — la sécurité au niveau des lignes est activée sans aucune "
        "politique sur les tables sensibles, ce qui équivaut à un refus total pour les "
        "rôles anonyme et authentifié. Seul le rôle de service, détenu par le serveur, "
        "y accède. Les droits d'exécution des procédures stockées sont révoqués pour "
        "ces mêmes rôles.",
    ])

    d.encadre(
        "Anomalie constatée sur le partage de conversation",
        "Les documents de partage sont en lecture publique par conception, ce qui "
        "correspond à la fonction de partage par lien. Toutefois, la charge écrite par "
        "l'application ne contient pas de champ propriétaire, alors que les règles de "
        "modification et de suppression l'exigent. En conséquence, une conversation "
        "partagée ne peut être ni modifiée ni supprimée par son auteur. Ce point a une "
        "incidence directe sur le droit à l'effacement et doit être corrigé.", ROUGE)

    # ─── Déploiement ─────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Déploiement et exploitation")

    d.titre2("Chaîne de construction")
    d.tableau(["Élément", "Valeur"], [
        ["Commande de construction", "npm run build"],
        ["Répertoire de sortie", "dist"],
        ["Cadre déclaré", "vite"],
        ["Réécritures", "Les routes /api/ sont conservées ; toute autre route est servie par index.html"],
        ["Intégration continue", "Node 20, installation verrouillée, vérification de types, construction"],
    ], largeurs=[30, 70])

    d.titre2("Tâches planifiées")
    d.tableau(["Route", "Planification", "Objet"], [
        ["/api/generate-challenges", "Dimanche, 03h00 UTC", "Génération de sept défis quotidiens"],
        ["/api/reengagement", "Lundi, 10h00 UTC", "Relance des utilisateurs inactifs"],
    ], largeurs=[28, 28, 44])
    d.para("Les deux tâches vérifient un jeton partagé. La fonction de diffusion de "
           "notifications est protégée par le même secret mais n'est déclarée dans "
           "aucune planification : son déclenchement est manuel.")

    d.titre2("Coupure de service pilotée à distance")
    d.para("Le fichier middleware.ts, exécuté sur le réseau de périphérie de "
           "l'hébergeur, interroge la plateforme STARIAX à chaque requête afin de "
           "déterminer si le produit doit être rendu indisponible. La réponse est mise "
           "en cache trente secondes par instance.")
    d.puces([
        "Périmètre : toutes les routes hors interfaces de programmation, ressources "
        "statiques et fichiers portant une extension.",
        "Coupure globale : redirection temporaire vers la page de maintenance hébergée "
        "par STARIAX.",
        "Coupure partielle : réponse 503 accompagnée d'un en-tête de réessai.",
        "<b>Comportement en cas de défaillance</b> — toute erreur réseau ou de "
        "traitement laisse passer la requête. La plateforme de pilotage ne peut donc "
        "jamais rendre le produit indisponible par sa propre panne.",
    ])
    d.encadre(
        "Limite structurelle du middleware",
        "L'application native chargeant ses ressources depuis une origine locale, elle "
        "ne traverse jamais le réseau de périphérie de l'hébergeur. Le middleware est "
        "donc sans effet sur iOS et Android. C'est le module src/StariaxGate.tsx, côté "
        "client, qui assure la coupure sur ces plateformes.", AMBRE)

    d.titre2("Applications natives")
    d.tableau(["Élément", "Valeur"], [
        ["Encapsulation", "Capacitor 8.4"],
        ["Identifiant applicatif", "tech.stariax.challengeria, cohérent sur iOS, Android et la configuration"],
        ["Répertoire web", "dist"],
        ["Couleur de fond", "#F0F4FF"],
        ["Particularité iOS", "Marge de contenu neutralisée"],
        ["Synchronisation", "npm run cap:sync, cap:ios, cap:android"],
    ], largeurs=[30, 70])
    d.para("La persistance de session est initialisée en privilégiant la base de "
           "données du navigateur, avec repli sur le stockage local. Cette "
           "configuration est nécessaire au fonctionnement de l'authentification dans "
           "le conteneur natif, dont l'origine diffère de celle du web.")

    d.titre2("Variables d'environnement")
    d.para("Les variables préfixées VITE_ sont incorporées au paquet client au moment "
           "de la construction : elles sont donc publiques et ne doivent contenir aucun "
           "secret. Leur modification impose une reconstruction, la seule mise à jour de "
           "la valeur étant sans effet sur un paquet déjà construit.")
    d.tableau(["Portée", "Variables"], [
        ["Serveur uniquement (secrets)",
         "MISTRAL_API_KEY, TAVILY_API_KEY, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_ADMIN_PROJECT_ID, "
         "FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY, STRIPE_SECRET_KEY, "
         "STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, VAPID_PRIVATE_KEY, CRON_SECRET, STARIAX_PRODUCT_SECRET"],
        ["Client (publiques par conception)",
         "VITE_FIREBASE_*, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY, "
         "VITE_STRIPE_*, VITE_API_BASE, VITE_STARIAX_BASE, VITE_STARIAX_PRODUCT_ID, VITE_STARIAX_INGEST_TOKEN"],
        ["Serveur, non secrètes",
         "STARIAX_BASE, STARIAX_PRODUCT_ID, APP_URL, SUPPORT_URL, RESEND_FROM, "
         "CHAT_RATE_LIMIT_PER_MIN, CHAT_FREE_DAILY_LIMIT, CHAT_PRO_DAILY_LIMIT"],
    ], largeurs=[26, 74])

    # ─── Sécurité ────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Sécurité applicative")

    d.titre2("Mesures en place")
    d.tableau(["Mesure", "Mise en œuvre"], [
        ["Authentification serveur", "Vérification systématique du jeton ; l'identifiant provient du jeton, jamais de la requête"],
        ["Refus par défaut en production", "La fonction de conversation répond 503 si la vérification d'identité n'est pas active"],
        ["Cloisonnement des données", "Règles Firestore par propriétaire ; refus total au niveau des lignes sur Supabase"],
        ["Révocation des procédures", "Droits d'exécution retirés aux rôles anonyme et authentifié, accordés au seul rôle de service"],
        ["Limitation de débit et quota", "Contrôle atomique en base, insensible aux appels concurrents"],
        ["Intégrité des paiements", "Vérification de la signature des événements sur le corps brut"],
        ["Anti-énumération de comptes", "La réinitialisation de mot de passe ne révèle pas l'existence d'une adresse"],
        ["Protection des tâches planifiées", "Jeton partagé exigé"],
        ["Injection d'instructions", "Vingt-trois motifs de détection appliqués aux personas personnalisés, avec nettoyage des balises"],
        ["Confinement des secrets", "Aucun secret dans le paquet client, vérifié par recherche dans les fichiers construits"],
    ], largeurs=[28, 72])

    d.titre2("Risques identifiés")
    d.tableau(["Risque", "Portée", "Recommandation"], [
        ["Point d'entrée de contexte ouvert", "Relais de requêtes arbitraires, absence de quota", "Ajouter authentification et limitation de débit"],
        ["Point d'entrée de diagnostic exposé", "Divulgation de l'état de configuration", "Supprimer, conformément à la mention portée dans le code"],
        ["Origines autorisées sans restriction", "En-tête d'origine permissif sur tous les points d'entrée", "Restreindre à une liste d'origines connues"],
        ["Collections Firestore inutilisées", "Collections déclarées et lisibles par tout compte authentifié", "Retirer les règles devenues sans objet"],
        ["Absence de chiffrement applicatif", "Contenus stockés en clair chez les hébergeurs", "Évaluer un chiffrement des champs les plus sensibles"],
        ["Absence de tests automatisés", "Aucune couverture de non-régression", "Introduire des tests sur les fonctions pures à fort enjeu"],
    ], largeurs=[27, 38, 35])

    # ─── Glossaire ───────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Glossaire technique")
    d.tableau(["Terme", "Définition"], [
        ["Persona", "Configuration de comportement du modèle, définie par un rôle, une structure de sortie imposée et un niveau de friction"],
        ["Niveau de friction", "Intensité contradictoire appliquée : doux, moyen ou extrême"],
        ["Marqueur", "Balise textuelle insérée par le modèle dans sa réponse, interprétée puis retirée avant affichage"],
        ["Carte de verdict", "Représentation multidimensionnelle d'une vérification factuelle"],
        ["Profil cognitif", "Historique agrégé des biais et des réflexes de raisonnement observés chez un utilisateur"],
        ["Steelman", "Reformulation d'une thèse dans sa version la plus forte avant de la contester"],
        ["Tolérance à la panne ouverte", "Comportement consistant à laisser passer en cas de défaillance d'un contrôle non critique"],
        ["Refus par défaut", "Comportement consistant à refuser le service en cas de défaillance d'un contrôle critique"],
        ["Drapeau fonctionnel", "Clé activant une fonctionnalité pour une population restreinte d'utilisateurs"],
    ], largeurs=[22, 78])

    d.titre1("Historique du document")
    d.tableau(["Version", "Date", "Objet"], [
        ["1.0", L.DATE, "Émission initiale"],
    ], largeurs=[15, 25, 60])


if __name__ == '__main__':
    n = generer_document(SORTIE, META, remplir)
    print(f"OK — {SORTIE} ({n} pages)")
