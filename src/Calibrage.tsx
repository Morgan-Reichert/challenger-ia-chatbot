/**
 * Calibrage — série de questions posée APRÈS la création du compte.
 *
 * Placée après, et non avant : chaque question posée pendant l'inscription est
 * une occasion d'abandonner, et un abandon à ce moment-là fait perdre le compte
 * lui-même. Ici, le compte existe déjà — un abandon ne coûte qu'une
 * personnalisation, que les réglages permettent de reprendre plus tard.
 *
 * Toutes les questions alimentent des champs réellement injectés dans le
 * contexte du modèle (voir buildProfileContext) ou des réglages effectifs.
 * En poser dont la réponse ne servirait à rien coûterait la confiance qu'on
 * cherche justement à établir.
 *
 * Le passage est possible à chaque étape, par un bouton volontairement discret
 * mais toujours visible : un échappatoire caché produit de l'abandon pur, pas
 * de la complétion.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight, ArrowLeft, Check, Sparkles,
  Target, Scale, Search, Swords, Compass, Feather, Wind, Flame,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserProfile } from './userProfile';

// Redéclarés ici : les types d'origine vivent dans App.tsx sans être exportés,
// et importer App depuis un de ses enfants créerait un cycle.
type Persona = 'architect' | 'factchecker' | 'opponent' | 'strategist' | 'arbiter';
type FrictionLevel = 'doux' | 'moyen' | 'extreme';

export type ResultatCalibrage = {
  profil: Partial<UserProfile>;
  persona?: Persona;
  level?: FrictionLevel;
};

type Choix = { valeur: string; label: string; desc: string; icone: LucideIcon };

const OBJECTIFS: (Choix & { persona: Persona })[] = [
  { valeur: 'decision', label: 'Trancher une décision', persona: 'architect',
    desc: 'Vous hésitez, et vous voulez que vos raisons soient testées.',
    icone: Scale },
  { valeur: 'verifier', label: 'Vérifier ce que je lis', persona: 'factchecker',
    desc: 'Vous voulez démêler le vrai du plausible, sources à l’appui.',
    icone: Search },
  { valeur: 'argumenter', label: 'Muscler mes arguments', persona: 'opponent',
    desc: 'Vous préparez un débat, un dossier, une négociation.',
    icone: Swords },
  { valeur: 'construire', label: 'Mener un projet', persona: 'strategist',
    desc: 'Vous avez une idée et cherchez un plan qui tienne.',
    icone: Compass },
];

const FRICTIONS: (Choix & { level: FrictionLevel })[] = [
  { valeur: 'doux', label: 'En douceur', level: 'doux',
    desc: 'On vous accompagne. La contradiction reste enveloppée.', icone: Feather },
  { valeur: 'moyen', label: 'Franchement', level: 'moyen',
    desc: 'Sobre et direct. Le défaut recommandé.', icone: Wind },
  { valeur: 'extreme', label: 'Sans ménagement', level: 'extreme',
    desc: 'Aucune concession sur le fond. Réservé aux estomacs solides.', icone: Flame },
];

const RAPPORTS: Choix[] = [
  { valeur: "J'encaisse bien la contradiction directe et je préfère qu'on aille droit au but.",
    label: 'Je vais droit au but', desc: 'Dites-moi où ça cloche, sans détour.', icone: Swords },
  { valeur: "J'ai besoin qu'on reconnaisse ce qui tient avant de me montrer ce qui ne tient pas.",
    label: "J'ai besoin d'un appui", desc: "Dites-moi d'abord ce qui est solide.", icone: Scale },
  { valeur: "Je me braque facilement : mieux vaut m'amener à trouver la faille moi-même par des questions.",
    label: 'Amenez-moi à le voir', desc: 'Par des questions plutôt que des verdicts.', icone: Search },
];

const NOMS_PERSONA: Record<Persona, string> = {
  architect:   "l’Architecte",
  factchecker: 'le Fact-Checker',
  opponent:    "l’Opposant",
  strategist:  'le Stratège',
  arbiter:     "l’Arbitre",
};

const DOMAINES = [
  'Politique', 'Économie', 'Sciences', 'Technologie', 'Philosophie', 'Éducation',
  'Santé', 'Écologie', 'Entreprise', 'Droit', 'Médias', 'Culture',
];

export default function Calibrage({
  prenomInitial, onTerminer, onPasser,
}: {
  prenomInitial: string;
  onTerminer: (r: ResultatCalibrage) => void;
  onPasser: () => void;
}) {
  const [etape, setEtape] = useState(0);
  const [prenom, setPrenom] = useState(prenomInitial);
  const [objectif, setObjectif] = useState('');
  const [friction, setFriction] = useState('moyen');
  const [rapport, setRapport] = useState('');
  const [domaines, setDomaines] = useState<string[]>([]);
  const [parcours, setParcours] = useState('');

  const objectifChoisi = OBJECTIFS.find((o) => o.valeur === objectif);
  const frictionChoisie = FRICTIONS.find((f) => f.valeur === friction);
  const rapportChoisi = RAPPORTS.find((r) => r.valeur === rapport);

  const ETAPES = useMemo(() => [
    'prenom', 'objectif', 'friction', 'rapport', 'domaines', 'parcours', 'bilan',
  ] as const, []);
  const courante = ETAPES[etape];
  const derniere = etape === ETAPES.length - 1;

  // Une étape n'est jamais bloquante : « Continuer » reste actif même sans
  // réponse. Forcer un choix ferait répondre au hasard, ce qui pollue le profil
  // plus sûrement qu'une absence de réponse.
  const avancer = () => (derniere ? terminer() : setEtape((e) => e + 1));
  const reculer = () => setEtape((e) => Math.max(0, e - 1));

  const terminer = () => {
    onTerminer({
      profil: {
        displayName: prenom.trim(),
        objectif: objectifChoisi?.label ?? '',
        // Persistés dans le profil, et pas seulement appliqués à la session :
        // sans cela, un rechargement avant le premier message ramènerait au
        // contradicteur par défaut, et l'écran de bilan aurait menti.
        personaPrefere: objectifChoisi?.persona ?? '',
        frictionPreferee: frictionChoisie?.level ?? '',
        rapportContradiction: rapport,
        interests: domaines,
        background: parcours.trim(),
        calibrageFait: true,
      },
      persona: objectifChoisi?.persona,
      level: frictionChoisie?.level,
    });
  };

  const progression = Math.round((etape / (ETAPES.length - 1)) * 100);

  return (
    <div className="fixed inset-0 z-[60] bg-[#F0F4FF] flex flex-col overflow-y-auto">

      {/* ── Progression ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/35">
              Calibrage · {Math.min(etape + 1, ETAPES.length)} / {ETAPES.length}
            </p>
            <button
              onClick={onPasser}
              className="text-[9px] font-black uppercase tracking-widest text-[#141414]/25 hover:text-[#141414]/60 transition-colors"
            >
              Passer
            </button>
          </div>
          {/* Remplissage par `scaleX` et non par `width` : Motion animait la
              largeur depuis la valeur mesurée au montage (barre aux trois quarts
              dès la première étape), et la classe utilitaire arbitraire chargée
              de la transition écrasait la largeur à zéro. Une transformation
              échappe aux deux écueils et s'anime sans recalcul de mise en page. */}
          <div className="h-1 bg-[#141414]/8 overflow-hidden">
            <div
              className="h-full w-full bg-[#5D7BFF] origin-left transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${progression / 100})` }}
            />
          </div>
        </div>
      </div>

      {/* ── Contenu ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <motion.div
          key={courante}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          {courante === 'prenom' && (
            <Question
              titre="Comment doit-on vous appeler ?"
              sous="Un prénom suffit. Il sert à vous adresser la parole, pas à vous identifier."
            >
              <input
                type="text"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') avancer(); }}
                maxLength={40}
                autoFocus
                placeholder="Votre prénom"
                className="w-full px-4 py-3.5 text-base border-2 border-[#141414]/12 bg-white focus:outline-none focus:border-[#5D7BFF] transition-colors"
              />
            </Question>
          )}

          {courante === 'objectif' && (
            <Question
              titre="Qu’est-ce qui vous amène ?"
              sous="Cela détermine par quel contradicteur vous commencez. Vous pourrez en changer à tout moment."
            >
              <ListeChoix options={OBJECTIFS} valeur={objectif} definir={(v) => { setObjectif(v); }} />
            </Question>
          )}

          {courante === 'friction' && (
            <Question
              titre="À quel point voulez-vous être bousculé ?"
              sous="Ce réglage change le ton, jamais l’exigence sur le fond."
            >
              <ListeChoix options={FRICTIONS} valeur={friction} definir={setFriction} />
            </Question>
          )}

          {courante === 'rapport' && (
            <Question
              titre="Comment encaissez-vous la contradiction ?"
              sous="Répondez honnêtement — personne ne lit cette réponse, elle sert seulement à vous être utile."
            >
              <ListeChoix options={RAPPORTS} valeur={rapport} definir={setRapport} />
            </Question>
          )}

          {courante === 'domaines' && (
            <Question
              titre="Sur quoi débattez-vous le plus ?"
              sous="Plusieurs choix possibles. Sert à ancrer les exemples dans ce que vous connaissez."
            >
              <div className="flex flex-wrap gap-2">
                {DOMAINES.map((d) => {
                  const actif = domaines.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => setDomaines((p) => actif ? p.filter((x) => x !== d) : [...p, d])}
                      aria-pressed={actif}
                      className={
                        'px-3.5 py-2 border-2 text-[11px] font-bold transition-colors '
                        + (actif
                          ? 'border-[#5D7BFF] text-[#5D7BFF] bg-[#5D7BFF]/[0.06]'
                          : 'border-[#141414]/12 text-[#141414]/50 hover:border-[#141414]/30 bg-white')
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Question>
          )}

          {courante === 'parcours' && (
            <Question
              titre="En une phrase, d’où parlez-vous ?"
              sous="Métier, formation, expérience — ce qui donne du contexte à vos raisonnements. Facultatif."
            >
              <textarea
                value={parcours}
                onChange={(e) => setParcours(e.target.value)}
                rows={3}
                maxLength={300}
                autoFocus
                placeholder="Ex. : ingénieure en aéronautique, je bascule vers la formation d’adultes."
                className="w-full px-4 py-3.5 text-sm border-2 border-[#141414]/12 bg-white focus:outline-none focus:border-[#5D7BFF] transition-colors resize-none leading-relaxed"
              />
            </Question>
          )}

          {/* ── Bilan : restitution de ce qui a été compris ─────────────────
              L'étape qui donne sa valeur au questionnaire. Sans elle, on a
              donné des informations sans jamais voir ce qu'elles produisent. */}
          {courante === 'bilan' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[#5D7BFF]" />
                <p className="text-[9px] font-black uppercase tracking-widest text-[#5D7BFF]">
                  Voici comment on va vous challenger
                </p>
              </div>
              <h2 className="text-2xl font-black text-[#141414] tracking-tight leading-tight mb-5">
                {prenom.trim() ? `C’est noté, ${prenom.trim()}.` : 'C’est noté.'}
              </h2>

              <div className="space-y-2">
                {[
                  objectifChoisi && {
                    icone: objectifChoisi.icone,
                    titre: `On démarre avec ${NOMS_PERSONA[objectifChoisi.persona]}`,
                    detail: objectifChoisi.desc,
                  },
                  frictionChoisie && {
                    icone: frictionChoisie.icone,
                    titre: `Ton : ${frictionChoisie.label.toLowerCase()}`,
                    detail: frictionChoisie.desc,
                  },
                  rapportChoisi && {
                    icone: rapportChoisi.icone,
                    titre: rapportChoisi.label,
                    detail: rapportChoisi.desc,
                  },
                  domaines.length > 0 && {
                    icone: Target,
                    titre: `${domaines.length} domaine${domaines.length > 1 ? 's' : ''} de prédilection`,
                    detail: domaines.join(' · '),
                  },
                ].filter(Boolean).map((l) => {
                  const ligne = l as { icone: LucideIcon; titre: string; detail: string };
                  return (
                    <div key={ligne.titre} className="flex items-start gap-3 px-4 py-3 bg-white border-2 border-[#141414]/10">
                      <ligne.icone className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#5D7BFF]" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-[#141414]">{ligne.titre}</p>
                        <p className="text-[10px] text-[#141414]/50 mt-0.5 leading-relaxed">{ligne.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-[#141414]/40 leading-relaxed mt-4">
                Tout cela reste modifiable dans <strong>Paramètres › Profil IA</strong>.
                Rien n’est figé.
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-6 pb-6 border-t-2 border-[#141414]/8 bg-white/60 backdrop-blur-sm pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {etape > 0 && (
            <button
              onClick={reculer}
              aria-label="Étape précédente"
              className="flex-shrink-0 p-3 border-2 border-[#141414]/12 text-[#141414]/40 hover:text-[#141414]/70 hover:border-[#141414]/30 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={avancer}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-[#5D7BFF] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-colors"
            style={{ boxShadow: '0 4px 14px rgba(93,123,255,0.35)' }}
          >
            {derniere ? <>Commencer <Check className="w-4 h-4" /></> : <>Continuer <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function Question({ titre, sous, children }: { titre: string; sous: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-black text-[#141414] tracking-tight leading-tight">{titre}</h2>
      <p className="text-[11px] text-[#141414]/45 mt-2 mb-5 leading-relaxed">{sous}</p>
      {children}
    </div>
  );
}

function ListeChoix({
  options, valeur, definir,
}: {
  options: Choix[];
  valeur: string;
  definir: (v: string) => void;
}) {
  return (
    <div className="space-y-2" role="radiogroup">
      {options.map((o) => {
        const actif = valeur === o.valeur;
        return (
          <button
            key={o.valeur}
            role="radio"
            aria-checked={actif}
            onClick={() => definir(o.valeur)}
            className={
              'w-full flex items-start gap-3.5 px-4 py-3.5 border-2 text-left transition-colors '
              + (actif
                ? 'border-[#5D7BFF] bg-[#5D7BFF]/[0.06]'
                : 'border-[#141414]/12 bg-white hover:border-[#141414]/30')
            }
          >
            <o.icone
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              style={{ color: actif ? '#5D7BFF' : 'rgba(20,20,20,0.3)' }}
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-black text-[#141414]">{o.label}</span>
              <span className="block text-[10px] text-[#141414]/50 mt-0.5 leading-relaxed">{o.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
