/**
 * Calibrage — questionnaire posé APRÈS la création du compte.
 *
 * Placé après, et non avant : chaque question posée pendant l'inscription est
 * une occasion d'abandonner, et un abandon à ce moment-là fait perdre le compte
 * lui-même. Ici le compte existe déjà — un abandon ne coûte qu'une
 * personnalisation, que les réglages permettent de reprendre.
 *
 * ── Sur la déduction ──────────────────────────────────────────────────────
 * Les questions ont l'air anodines et en disent beaucoup : le contexte
 * d'ouverture révèle l'usage, la réaction à l'erreur révèle la tolérance à la
 * friction, le temps disponible détermine la longueur des réponses.
 *
 * Mais tout ce qui est déduit est MONTRÉ au dernier écran, avec le
 * raisonnement. Déduire en silence serait du profilage dissimulé — contraire à
 * l'article 13 du RGPD, et surtout à ce que ce produit prétend défendre. Et
 * l'effet recherché — « il m'a cerné » — vient justement de voir le
 * raisonnement, pas de le subir.
 *
 * Aucune question n'est bloquante et le passage reste possible partout : forcer
 * un choix ferait répondre au hasard, ce qui pollue le profil plus sûrement
 * qu'une absence de réponse.
 */
import { useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import type { UserProfile } from './userProfile';
import {
  IllusIdentite, IllusContexte, IllusContradiction, IllusDecision,
  IllusTemps, IllusDomaines, IllusParcours, IllusBilan,
} from './calibrageIllustrations';

type Persona = 'architect' | 'factchecker' | 'opponent' | 'strategist' | 'arbiter';
type FrictionLevel = 'doux' | 'moyen' | 'extreme';
type Usage = 'pro' | 'perso' | 'etudes';
type Longueur = 'concise' | 'standard' | 'approfondie';

export type ResultatCalibrage = {
  profil: Partial<UserProfile>;
  persona?: Persona;
  level?: FrictionLevel;
  /** Épure l'écran d'accueil pour un usage professionnel. */
  masquerDefiDuJour?: boolean;
};

/* ─── Questions ──────────────────────────────────────────────────────────── */

type Option = { id: string; label: string; detail: string };

const CONTEXTES: (Option & { usage: Usage })[] = [
  { id: 'pro',    usage: 'pro',
    label: 'Pour le travail',
    detail: 'Un dossier à défendre, une décision à prendre, une réunion à préparer.' },
  { id: 'perso',  usage: 'perso',
    label: 'Pour moi',
    detail: 'Une idée qui me trotte dans la tête et que je veux mettre à l’épreuve.' },
  { id: 'etudes', usage: 'etudes',
    label: 'Pour mes études',
    detail: 'Un devoir, un mémoire, un oral, un concours.' },
];

const REACTIONS: (Option & { level: FrictionLevel; rapport: string })[] = [
  { id: 'verifie', level: 'extreme',
    label: 'Je vérifie si l’argument tient',
    detail: 'Avant même de me demander si ça m’arrange.',
    rapport: "Encaisse bien la contradiction directe. Aller droit au but ; inutile d'amortir." },
  { id: 'pique', level: 'extreme',
    label: 'Ça me pique — et j’aime ça',
    detail: 'La contradiction me réveille plus qu’elle ne me blesse.',
    rapport: 'Recherche activement la contradiction. Ne pas ménager ; le désaccord franc est apprécié.' },
  { id: 'rumine', level: 'moyen',
    label: 'Je concède, puis je rumine',
    detail: 'J’ai besoin de temps pour digérer avant de reconnaître.',
    rapport: "A besoin qu'on reconnaisse ce qui tient avant de montrer ce qui ne tient pas." },
  { id: 'defends', level: 'doux',
    label: 'Je défends, puis je révise en privé',
    detail: 'Je n’aime pas céder sur le moment.',
    rapport: 'Se braque si la faille est assénée. Mieux vaut amener à la trouver soi-même, par questions.' },
];

const APPUIS: (Option & { persona: Persona })[] = [
  { id: 'sources', persona: 'factchecker',
    label: 'Aux chiffres et aux sources',
    detail: 'Ce qui n’est pas sourcé ne compte pas vraiment.' },
  { id: 'logique', persona: 'architect',
    label: 'À la cohérence du raisonnement',
    detail: 'Si la logique cloche, les faits ne sauveront rien.' },
  { id: 'epreuve', persona: 'opponent',
    label: 'À ce qui résiste à la contradiction',
    detail: 'Une thèse ne vaut que ce qu’elle encaisse.' },
  { id: 'plan',    persona: 'strategist',
    label: 'À ce que ça implique concrètement',
    detail: 'Une idée sans plan reste une opinion.' },
];

const TEMPS: (Option & { longueur: Longueur })[] = [
  { id: 'court',  longueur: 'concise',
    label: 'Cinq minutes, entre deux choses',
    detail: 'Allez à l’essentiel.' },
  { id: 'normal', longueur: 'standard',
    label: 'Le temps qu’il faudra',
    detail: 'Ni pressé, ni contemplatif.' },
  { id: 'long',   longueur: 'approfondie',
    label: 'J’aime creuser longtemps',
    detail: 'Les nuances et les contre-exemples m’intéressent.' },
];

const DOMAINES = [
  'Politique', 'Économie', 'Sciences', 'Technologie', 'Philosophie', 'Éducation',
  'Santé', 'Écologie', 'Entreprise', 'Droit', 'Médias', 'Culture',
];

const NOMS_PERSONA: Record<Persona, string> = {
  architect: 'l’Architecte', factchecker: 'le Fact-Checker', opponent: 'l’Opposant',
  strategist: 'le Stratège', arbiter: 'l’Arbitre',
};

/* ─── Composant ──────────────────────────────────────────────────────────── */

export default function Calibrage({
  prenomInitial, onTerminer, onPasser,
}: {
  prenomInitial: string;
  onTerminer: (r: ResultatCalibrage) => void;
  onPasser: () => void;
}) {
  const [etape, setEtape] = useState(0);
  const [prenom, setPrenom] = useState(prenomInitial);
  const [contexte, setContexte] = useState('');
  const [reaction, setReaction] = useState('');
  const [appui, setAppui] = useState('');
  const [temps, setTemps] = useState('');
  const [domaines, setDomaines] = useState<string[]>([]);
  const [parcours, setParcours] = useState('');

  const ctx = CONTEXTES.find((c) => c.id === contexte);
  const rea = REACTIONS.find((r) => r.id === reaction);
  const app = APPUIS.find((a) => a.id === appui);
  const tps = TEMPS.find((t) => t.id === temps);

  const ETAPES = useMemo(() => [
    {
      cle: 'ouverture', narration: 'Avant de vous contredire, autant savoir à qui l’on parle.',
      titre: 'Six questions. Deux minutes.', sous:
        'Elles ont l’air anodines. Elles déterminent le persona qu’on vous assigne, '
        + 'le ton qu’il adopte et la longueur de ses réponses. Le dernier écran vous montrera '
        + 'exactement ce qu’on en a déduit.',
      illus: IllusIdentite,
    },
    { cle: 'prenom', narration: 'Le plus simple d’abord.',
      titre: 'Comment doit-on vous appeler ?',
      sous: 'Un prénom suffit. Il sert à s’adresser à vous, pas à vous identifier.',
      illus: IllusIdentite },
    { cle: 'contexte', narration: 'Le contexte change tout.',
      titre: 'Vous ouvrez Challenger un mardi soir. C’est plutôt…',
      sous: 'Cela détermine si l’écran d’accueil vous propose des défis ou reste sobre.',
      illus: IllusContexte },
    { cle: 'reaction', narration: 'Voici la question qui compte vraiment.',
      titre: 'On vient de vous démontrer que vous aviez tort. Votre premier réflexe ?',
      sous: 'Honnêtement — personne ne lit cette réponse. Elle règle la dureté du ton.',
      illus: IllusContradiction },
    { cle: 'appui', narration: 'Encore une.',
      titre: 'Pour trancher, vous vous fiez d’abord…',
      sous: 'C’est ce qui choisit lequel des personas vous accueille.',
      illus: IllusDecision },
    { cle: 'temps', narration: 'Presque terminé.',
      titre: 'Combien de temps avez-vous, d’habitude ?',
      sous: 'Règle la longueur des réponses. Rien n’est plus inutile qu’une analyse de trois pages quand on en a trois lignes.',
      illus: IllusTemps },
    { cle: 'domaines', narration: 'Deux dernières, plus faciles.',
      titre: 'Sur quoi débattez-vous le plus ?',
      sous: 'Plusieurs choix possibles. Sert à ancrer les exemples dans ce que vous connaissez.',
      illus: IllusDomaines },
    { cle: 'parcours', narration: 'La dernière.',
      titre: 'En une phrase, d’où parlez-vous ?',
      sous: 'Métier, formation, expérience. Facultatif — et le plus utile de toutes.',
      illus: IllusParcours },
    { cle: 'bilan', narration: 'Voilà ce qu’on en a déduit.',
      titre: '', sous: '', illus: IllusBilan },
  ] as const, []);

  const e = ETAPES[etape];
  const derniere = etape === ETAPES.length - 1;
  const progression = etape / (ETAPES.length - 1);

  const avancer = () => (derniere ? terminer() : setEtape((n) => n + 1));
  const reculer = () => setEtape((n) => Math.max(0, n - 1));

  const terminer = () => {
    onTerminer({
      profil: {
        displayName: prenom.trim(),
        objectif: ctx?.label ?? '',
        usage: ctx?.usage ?? '',
        personaPrefere: app?.persona ?? '',
        frictionPreferee: rea?.level ?? '',
        longueurReponse: tps?.longueur ?? '',
        rapportContradiction: rea?.rapport ?? '',
        interests: domaines,
        background: parcours.trim(),
        calibrageFait: true,
      },
      persona: app?.persona,
      level: rea?.level,
      // Un usage professionnel n'a que faire d'un défi quotidien et d'un crédit
      // offert : l'accueil s'épure de lui-même, sans réglage à aller chercher.
      masquerDefiDuJour: ctx?.usage === 'pro',
    });
  };

  /** Ce qui a été déduit, et à partir de quoi. Le « à partir de quoi » est
      l'essentiel : c'est lui qui distingue une déduction d'une devinette. */
  const deductions = [
    app && {
      cle: 'persona',
      titre: `On vous confie à ${NOMS_PERSONA[app.persona]}`,
      parce: `parce que vous vous fiez ${app.label.replace(/^À /, 'à ').toLowerCase()}`,
    },
    rea && {
      cle: 'ton',
      titre: rea.level === 'extreme' ? 'Ton sans ménagement'
           : rea.level === 'doux' ? 'Ton mesuré, par questions'
           : 'Ton franc, avec appui',
      parce: `parce qu’au moment d’avoir tort, ${rea.label.charAt(0).toLowerCase()}${rea.label.slice(1)}`,
    },
    tps && {
      cle: 'longueur',
      titre: tps.longueur === 'concise' ? 'Réponses courtes'
           : tps.longueur === 'approfondie' ? 'Réponses développées'
           : 'Réponses de longueur standard',
      parce: `parce que vous avez « ${tps.label.toLowerCase()} »`,
    },
    ctx && {
      cle: 'ecran',
      titre: ctx.usage === 'pro' ? 'Accueil épuré, sans défi du jour' : 'Accueil complet, défis compris',
      parce: `parce que vous venez ${ctx.label.toLowerCase()}`,
    },
    domaines.length > 0 && {
      cle: 'domaines',
      titre: `Exemples ancrés dans ${domaines.length} domaine${domaines.length > 1 ? 's' : ''}`,
      parce: domaines.join(' · ').toLowerCase(),
    },
  ].filter(Boolean) as { cle: string; titre: string; parce: string }[];

  const Illus = e.illus;

  return (
    <div className="fixed inset-0 z-[60] bg-[#F0F4FF] flex flex-col overflow-y-auto">

      {/* ── Bandeau : progression segmentée ─────────────────────────────────
          Des segments plutôt qu'une barre continue : on voit combien il reste
          d'écrans, ce qu'une jauge lisse ne dit jamais. C'est ce décompte qui
          retient — pas la promesse vague d'être « bientôt fini ».
          Le remplissage passe par `scaleX` et non par la largeur : une
          transformation ne déclenche aucun recalcul de mise en page. */}
      <div className="flex-shrink-0 px-6 pt-6"
           style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <div className="flex gap-1 flex-1">
            {ETAPES.map((s, i) => (
              <div key={s.cle} className="h-[3px] flex-1 overflow-hidden bg-[#141414]/8">
                <div
                  className="h-full bg-[#5D7BFF] origin-left transition-transform duration-500 ease-out"
                  style={{ transform: `scaleX(${i <= etape ? 1 : 0})`, transitionDelay: `${i * 20}ms` }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={onPasser}
            className="flex-shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-[#141414]/25 hover:text-[#141414]/60 transition-colors"
          >
            Passer
          </button>
        </div>
      </div>

      {/* ── Corps ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center px-6 py-8">
        <div className="w-full max-w-4xl mx-auto grid md:grid-cols-[200px_1fr] gap-8 md:gap-12 items-start">

          {/* Colonne de gauche : numéro d'étape et figure. Masquée sur mobile,
              où la hauteur doit revenir aux réponses. */}
          <div className="hidden md:block sticky top-8">
            <p
              key={`n-${e.cle}`}
              className="cal-entree text-[64px] leading-none font-black tracking-tighter text-[#5D7BFF]/15 tabular-nums"
            >
              {String(etape).padStart(2, '0')}
            </p>
            <div key={`i-${e.cle}`} className="cal-entree w-full aspect-square mt-4"
                 style={{ animationDelay: '60ms' }}>
              <Illus />
            </div>
          </div>

          {/* Colonne de droite : narration, question, réponses */}
          <div key={e.cle} className="cal-entree min-w-0">
            {/* La narration est en serif italique, seule rupture typographique
                de l'application : elle marque une voix qui commente, distincte
                de l'interface qui interroge. */}
            <p className="font-serif italic text-[#5D7BFF] text-lg md:text-xl mb-3 leading-snug">
              {e.narration}
            </p>

            {e.cle === 'bilan' ? (
              <>
                <h2 className="text-3xl md:text-4xl font-black text-[#141414] tracking-tighter leading-[0.95] mb-6">
                  {prenom.trim() ? `C’est noté, ${prenom.trim()}.` : 'C’est noté.'}
                </h2>

                <div className="space-y-px bg-[#141414]/10 border-2 border-[#141414]">
                  {deductions.map((d, i) => (
                    <div
                      key={d.cle}
                      className="cal-decale bg-white px-4 py-3"
                      style={{ animationDelay: `${120 + i * 80}ms` }}
                    >
                      <p className="text-[12px] font-black text-[#141414] leading-snug">{d.titre}</p>
                      <p className="text-[11px] text-[#141414]/45 mt-0.5 leading-relaxed">
                        <span className="font-serif italic">{d.parce}</span>
                      </p>
                    </div>
                  ))}
                  {deductions.length === 0 && (
                    <div className="bg-white px-4 py-4">
                      <p className="text-[11px] text-[#141414]/45 leading-relaxed">
                        Vous n’avez rien renseigné — c’est votre droit. Les réglages par défaut
                        s’appliquent, et tout reste modifiable dans Paramètres › Profil IA.
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-[#141414]/40 leading-relaxed mt-4">
                  Rien n’est figé : <strong>Paramètres › Profil IA</strong> reprend chacun de ces
                  réglages, un par un.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl md:text-3xl font-black text-[#141414] tracking-tight leading-[1.05]">
                  {e.titre}
                </h2>
                <p className="text-[11px] text-[#141414]/45 mt-2.5 mb-6 leading-relaxed max-w-lg">
                  {e.sous}
                </p>

                {e.cle === 'ouverture' && (
                  <div className="md:hidden w-32 aspect-square mb-2"><Illus /></div>
                )}

                {e.cle === 'prenom' && (
                  <input
                    type="text"
                    value={prenom}
                    onChange={(ev) => setPrenom(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') avancer(); }}
                    maxLength={40}
                    autoFocus
                    placeholder="Votre prénom"
                    className="w-full max-w-md px-4 py-3.5 text-base font-medium border-2 border-[#141414] bg-white focus:outline-none focus:border-[#5D7BFF] transition-colors"
                    style={{ boxShadow: '4px 4px 0 0 rgba(20,20,20,0.08)' }}
                  />
                )}

                {e.cle === 'contexte'  && <Choix options={CONTEXTES} valeur={contexte} definir={setContexte} />}
                {e.cle === 'reaction'  && <Choix options={REACTIONS} valeur={reaction} definir={setReaction} />}
                {e.cle === 'appui'     && <Choix options={APPUIS}    valeur={appui}    definir={setAppui} />}
                {e.cle === 'temps'     && <Choix options={TEMPS}     valeur={temps}    definir={setTemps} />}

                {e.cle === 'domaines' && (
                  <div className="flex flex-wrap gap-1.5 max-w-xl">
                    {DOMAINES.map((d) => {
                      const actif = domaines.includes(d);
                      return (
                        <button
                          key={d}
                          onClick={() => setDomaines((p) => actif ? p.filter((x) => x !== d) : [...p, d])}
                          aria-pressed={actif}
                          className={
                            'px-3.5 py-2 border-2 text-[11px] font-bold transition-all '
                            + (actif
                              ? 'border-[#141414] bg-[#5D7BFF] text-white'
                              : 'border-[#141414]/15 bg-white text-[#141414]/55 hover:border-[#141414]/45')
                          }
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                )}

                {e.cle === 'parcours' && (
                  <textarea
                    value={parcours}
                    onChange={(ev) => setParcours(ev.target.value)}
                    rows={3}
                    maxLength={300}
                    autoFocus
                    placeholder="Ex. : ingénieure en aéronautique, je bascule vers la formation d’adultes."
                    className="w-full max-w-xl px-4 py-3.5 text-sm border-2 border-[#141414] bg-white focus:outline-none focus:border-[#5D7BFF] transition-colors resize-none leading-relaxed"
                    style={{ boxShadow: '4px 4px 0 0 rgba(20,20,20,0.08)' }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Pied : navigation ───────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-6 pt-4 pb-6 border-t-2 border-[#141414]/10 bg-white/70 backdrop-blur-sm"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-2.5">
          {etape > 0 && (
            <button
              onClick={reculer}
              aria-label="Étape précédente"
              className="flex-shrink-0 p-3.5 border-2 border-[#141414]/15 text-[#141414]/40 hover:text-[#141414] hover:border-[#141414] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={avancer}
            className="flex-1 md:flex-none md:px-10 flex items-center justify-center gap-2.5 py-3.5 bg-[#141414] text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#5D7BFF] transition-colors"
            style={{ boxShadow: '4px 4px 0 0 rgba(93,123,255,0.35)' }}
          >
            {etape === 0 ? <>Commencer <ArrowRight className="w-4 h-4" /></>
              : derniere ? <>C’est parti <Check className="w-4 h-4" /></>
              : <>Continuer <ArrowRight className="w-4 h-4" /></>}
          </button>
          <p className="hidden md:block ml-auto text-[9px] font-black uppercase tracking-[0.2em] text-[#141414]/20 tabular-nums">
            {Math.round(progression * 100)} %
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function Choix<T extends Option>({
  options, valeur, definir,
}: {
  options: readonly T[];
  valeur: string;
  definir: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 max-w-xl" role="radiogroup">
      {options.map((o) => {
        const actif = valeur === o.id;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={actif}
            onClick={() => definir(o.id)}
            className={
              'w-full flex items-start gap-3.5 px-4 py-3.5 border-2 text-left transition-all '
              + (actif
                ? 'border-[#141414] bg-white'
                : 'border-[#141414]/12 bg-white/60 hover:border-[#141414]/40 hover:bg-white')
            }
            style={actif ? { boxShadow: '4px 4px 0 0 #5D7BFF' } : undefined}
          >
            {/* Repère carré et non rond : l'interface n'a aucun arrondi ailleurs. */}
            <span
              className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 border-2 transition-colors"
              style={{
                borderColor: actif ? '#5D7BFF' : 'rgba(20,20,20,0.2)',
                background: actif ? '#5D7BFF' : 'transparent',
              }}
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-black text-[#141414] leading-snug">{o.label}</span>
              <span className="block text-[11px] text-[#141414]/45 mt-1 leading-relaxed">{o.detail}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
