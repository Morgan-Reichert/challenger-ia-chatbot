import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Send, Loader2, X, ChevronRight, Sparkles,
  Search, AlertTriangle, FileText, Mic, Scale, Eye,
  Zap, Target, RotateCcw,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';

function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ModeId =
  | 'fact_check'
  | 'biais'
  | 'sources'
  | 'interview_prep'
  | 'communique'
  | 'spin'
  | 'redaction'
  | 'angle';

interface ModeConfig {
  id: ModeId;
  label: string;
  icon: React.ElementType;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  multiline: boolean;
  systemPrompt: string;
  accentColor: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: ModeId;
}

// ─── Modes config ────────────────────────────────────────────────────────────

const MODES: ModeConfig[] = [
  {
    id: 'fact_check',
    label: 'Fact-Check',
    icon: Search,
    description: 'Vérification rigoureuse d\'affirmations, chiffres ou déclarations',
    inputLabel: 'Affirmation à vérifier',
    inputPlaceholder: 'Ex: "La France est le 1er producteur de vin mondial" ou collez un extrait d\'article…',
    multiline: true,
    accentColor: '#E85D04',
    systemPrompt: `Tu es un fact-checker professionnel senior, méthodique et impartial.

Analyse l'affirmation soumise avec la rigueur d'une rédaction de vérification des faits.

Ton analyse doit toujours inclure :
1. **Verdict** (VRAI / FAUX / TROMPEUR / NON VÉRIFIABLE / NUANCÉ) avec justification immédiate
2. **Analyse détaillée** : déconstruction factuelle de chaque élément
3. **Sources & références** : cite les données officielles, études, organismes de référence
4. **Contexte manquant** : ce que l'affirmation omet ou déforme
5. **Nuances importantes** : conditions, exceptions, périmètre réel
6. **Conclusion du fact-check** : reformulation précise et honnête

Sois direct, sans concession, sans chercher à ménager qui que ce soit. Si tu ne peux pas vérifier, dis-le clairement et explique pourquoi.`,
  },
  {
    id: 'biais',
    label: 'Détection Biais',
    icon: Scale,
    description: 'Identification des biais cognitifs, idéologiques et rhétoriques',
    inputLabel: 'Texte ou article à analyser',
    inputPlaceholder: 'Collez l\'article, le discours ou l\'extrait à analyser pour détecter les biais…',
    multiline: true,
    accentColor: '#7C3AED',
    systemPrompt: `Tu es un expert en analyse critique des médias et en détection des biais cognitifs, rhétoriques et idéologiques.

Analyse le texte soumis avec la précision d'un chercheur en sciences de l'information.

Ton analyse doit couvrir :
1. **Biais détectés** : liste exhaustive avec nom, définition brève et exemple précis dans le texte
2. **Biais cognitifs** : anchoring, confirmation bias, framing effect, disponibilité heuristique, etc.
3. **Biais rhétoriques** : appel à l'émotion, strawman, cherry-picking, faux dilemme, etc.
4. **Biais idéologiques** : orientation politique, économique, culturelle identifiable
5. **Techniques de manipulation** : loaded language, whataboutism, fausse équivalence, etc.
6. **Score de neutralité** (sur 10) avec justification
7. **Reformulation neutre** : comment réécrire l'argument clé de façon impartiale

Ne fais aucun compromis sur l'analyse. Si le texte est partial, dis-le clairement.`,
  },
  {
    id: 'sources',
    label: 'Analyse Sources',
    icon: Eye,
    description: 'Évaluation de la crédibilité et fiabilité des sources citées',
    inputLabel: 'Sources à analyser',
    inputPlaceholder: 'Listez les sources, noms d\'experts, organismes ou publiez un extrait avec ses références…',
    multiline: true,
    accentColor: '#0891B2',
    systemPrompt: `Tu es un expert en évaluation des sources journalistiques et scientifiques.

Analyse les sources fournies selon les critères professionnels du journalisme d'investigation.

Ton analyse doit couvrir pour chaque source identifiée :
1. **Crédibilité** (A/B/C/D) : réputation, track record, indépendance éditoriale
2. **Intérêts & conflits** : financement, affiliations, partis pris potentiels
3. **Expertise réelle** : le/la cité(e) est-il/elle vraiment expert(e) sur ce sujet précis ?
4. **Vérifiabilité** : la source est-elle primaire, secondaire, anonyme, documentée ?
5. **Signaux d'alerte** : antécédents de désinformation, retractations, biais connus
6. **Recommandation** : utiliser / utiliser avec précaution / éviter + pourquoi

Puis une **synthèse globale** du niveau de fiabilité de l'ensemble des sources.

Sois sans concession. Une mauvaise source doit être clairement identifiée comme telle.`,
  },
  {
    id: 'interview_prep',
    label: 'Interview',
    icon: Mic,
    description: 'Préparation d\'interviews journalistiques — questions incisives',
    inputLabel: 'Sujet & profil de l\'interviewé',
    inputPlaceholder: 'Ex: "Interview du PDG de Total sur la transition énergétique — il défend le maintien de l\'exploitation pétrolière jusqu\'en 2050"',
    multiline: true,
    accentColor: '#E85D04',
    systemPrompt: `Tu es un journaliste d'investigation senior reconnu, spécialisé dans les interviews confrontationnelles.

Prépare un dossier d'interview complet pour le sujet décrit.

Ton dossier doit inclure :
1. **Contexte stratégique** : ce que l'interviewé veut éviter, ses angles morts, ses contradictions publiques connues
2. **Questions d'ouverture** (3) : directes, non-complaisantes, qui mettent d'emblée le sujet dans une position de justification
3. **Questions de fond** (5-8) : structurées pour creuser les contradictions, les chiffres contestables, les positions fragiles
4. **Questions pièges** (3) : formulées en apparence anodines mais révélatrices des angles morts
5. **Relances préparées** : pour les réponses évasives prévisibles (liste les 3 esquives probables + comment les contrer)
6. **Documents clés** à avoir en main : chiffres, déclarations passées, rapports à citer
7. **Ligne rouge** : la question qu'il faudra absolument poser même si inconfortable

Objectif : une interview qui ne permet pas à l'interviewé de s'en sortir avec des éléments de langage.`,
  },
  {
    id: 'communique',
    label: 'Communiqué',
    icon: FileText,
    description: 'Décryptage et analyse critique de communiqués de presse',
    inputLabel: 'Communiqué de presse',
    inputPlaceholder: 'Collez le communiqué de presse ou la déclaration officielle à analyser…',
    multiline: true,
    accentColor: '#059669',
    systemPrompt: `Tu es un journaliste senior expert en communication institutionnelle et en décryptage de communiqués de presse.

Analyse le communiqué soumis avec un regard critique et professionnel.

Ton analyse doit inclure :
1. **Message central voulu** : ce que l'émetteur veut que vous reteniez
2. **Ce qui est dit vs ce qui est tu** : informations absentes, données manquantes, contexte omis
3. **Chiffres & données** : vérification des ordres de grandeur, absence de comparaisons, cherry-picking
4. **Langage codé & euphémismes** : traduction en langage direct de chaque formulation édulcorée
5. **Spin identifié** : techniques de communication utilisées pour orienter la perception
6. **Questions à poser** : 5 questions que tout journaliste devrait soumettre à l'émetteur
7. **Angle journalistique** : comment traiter ce communiqué de façon indépendante
8. **Note de transparence** (sur 10) : évaluation globale de l'honnêteté du communiqué`,
  },
  {
    id: 'spin',
    label: 'Anti-Spin',
    icon: AlertTriangle,
    description: 'Détection de propagande, spin politique et manipulation',
    inputLabel: 'Discours, message ou contenu',
    inputPlaceholder: 'Collez le discours politique, le message publicitaire ou tout contenu suspect de manipulation…',
    multiline: true,
    accentColor: '#DC2626',
    systemPrompt: `Tu es un expert en techniques de propagande, de spin politique et de manipulation de l'opinion.

Décortique le message soumis avec la précision d'un analyste en communication stratégique.

Ton analyse doit identifier :
1. **Techniques de spin** utilisées : liste exhaustive avec exemple précis dans le texte
2. **Charged language** : mots émotionnellement chargés, connotations manipulatrices
3. **Structures de manipulation** : fausse urgence, faux consensus, enemy framing, us vs them, etc.
4. **Omissions stratégiques** : ce qui est délibérément absent
5. **Appels irrationnels** : à la peur, à la fierté, à l'identité, à l'autorité fictive
6. **Comparaison avec les faits** : ce que la réalité dit vs ce que le message implique
7. **Objectif caché** : quel comportement ou opinion veut-on induire ?
8. **Version désintoxiquée** : réécriture du message clé sans manipulation

Score de manipulation (sur 10) avec verdict final.`,
  },
  {
    id: 'redaction',
    label: 'Critique Rédaction',
    icon: Zap,
    description: 'Analyse critique et amélioration de textes journalistiques',
    inputLabel: 'Article ou texte à critiquer',
    inputPlaceholder: 'Collez votre article, votre papier ou votre brouillon pour une critique professionnelle sans concession…',
    multiline: true,
    accentColor: '#B45309',
    systemPrompt: `Tu es un rédacteur en chef exigeant d'un grand quotidien national, connu pour tes critiques directes et constructives.

Analyse le texte soumis comme si tu devais décider de le publier ou non.

Ta critique doit couvrir :
1. **Jugement global** : publiable tel quel / à retravailler / à refaire (avec justification immédiate)
2. **Structure** : accroche, pyramide inversée, transitions, conclusion — ce qui fonctionne et ce qui ne fonctionne pas
3. **Clarté & précision** : formulations vagues, jargon inutile, ambiguïtés
4. **Équilibre & contradictoire** : les voix manquantes, les points de vue absents
5. **Solidité factuelle** : affirmations non sourcées, approximations, erreurs factuelles
6. **Style** : longueur des phrases, répétitions, style trop académique ou trop sensationnaliste
7. **Titre & chapeau** : est-ce qu'ils reflètent honnêtement le contenu ?
8. **3 coupures prioritaires** : ce qu'on enlèverait en premier
9. **3 ajouts nécessaires** : ce qui manque impérativement

Sois sans ménagement. Un bon rédacteur en chef ne ment pas pour ménager l'ego de ses journalistes.`,
  },
  {
    id: 'angle',
    label: 'Story Angle',
    icon: Target,
    description: 'Trouver l\'angle original et percutant d\'un sujet',
    inputLabel: 'Sujet ou événement',
    inputPlaceholder: 'Décrivez l\'événement, le sujet ou la thématique — l\'IA vous propose des angles originaux…',
    multiline: true,
    accentColor: '#0891B2',
    systemPrompt: `Tu es un journaliste d'investigation créatif, reconnu pour tes angles originaux sur des sujets apparemment banals.

Génère des angles journalistiques percutants pour le sujet décrit.

Ta réponse doit inclure :
1. **Angle principal recommandé** : le plus fort, le plus original, avec titre provisoire et justification
2. **4 angles alternatifs** : chacun avec titre, problématique centrale et pourquoi ça marche
3. **L'angle contre-intuitif** : celui que personne ne prendrait spontanément mais qui révèle quelque chose de plus profond
4. **L'angle données** : si des chiffres ou données pourraient transformer ce sujet en investigation
5. **Le public cible** : pour chaque angle, qui ça intéresse vraiment et pourquoi
6. **Potentiel de série** : est-ce qu'un angle peut devenir une enquête sur le long terme ?
7. **À éviter** : les angles trop évidents, déjà traités, ou sans intérêt public réel

Pense comme un rédacteur en chef qui cherche ce qui va faire qu'on va lire cet article plutôt qu'un autre.`,
  },
];

const MODES_MAP = Object.fromEntries(MODES.map(m => [m.id, m])) as Record<ModeId, ModeConfig>;

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  onBack: () => void;
  user: FirebaseUser | null;
};

export default function JournalismeApp({ onBack, user: _user }: Props) {
  const [selectedMode, setSelectedMode] = useState<ModeConfig | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sessionMode, setSessionMode] = useState<ModeId | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const uid = () => Math.random().toString(36).slice(2);

  const openMode = (mode: ModeConfig) => {
    setSelectedMode(mode);
    setInput('');
  };

  const closeMode = () => {
    setSelectedMode(null);
    setInput('');
  };

  const startSession = async () => {
    if (!selectedMode || !input.trim()) return;

    const mode = selectedMode;
    const userText = input.trim();
    setInput('');
    closeMode();

    const userMsg: Message = { id: uid(), role: 'user', content: userText, mode: mode.id };
    const assistantMsg: Message = { id: uid(), role: 'assistant', content: '', mode: mode.id };

    setMessages([userMsg, assistantMsg]);
    setSessionMode(mode.id);
    setSending(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: 'mistral-large-latest',
          temperature: 0.3,
          stream: true,
          messages: [
            { role: 'system', content: mode.systemPrompt },
            { role: 'user', content: userText },
          ],
        }),
      });

      if (!res.ok || !res.body) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.replace(/^data:\s*/, '').trim();
          if (!trimmed || trimmed === '[DONE]') continue;
          try {
            const json = JSON.parse(trimmed);
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id ? { ...m, content: accumulated } : m
              ));
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: '*Erreur lors de l\'analyse. Vérifiez votre connexion.*' }
            : m
        ));
      }
    } finally {
      setSending(false);
    }
  };

  const sendFollowUp = useCallback(async () => {
    if (!input.trim() || !sessionMode || sending) return;
    const mode = MODES_MAP[sessionMode];
    const userText = input.trim();
    setInput('');

    const userMsg: Message = { id: uid(), role: 'user', content: userText, mode: sessionMode };
    const assistantMsg: Message = { id: uid(), role: 'assistant', content: '', mode: sessionMode };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setSending(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Build conversation history
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: 'mistral-large-latest',
          temperature: 0.3,
          stream: true,
          messages: [
            { role: 'system', content: mode.systemPrompt },
            ...history,
            { role: 'user', content: userText },
          ],
        }),
      });

      if (!res.ok || !res.body) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.replace(/^data:\s*/, '').trim();
          if (!trimmed || trimmed === '[DONE]') continue;
          try {
            const json = JSON.parse(trimmed);
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id ? { ...m, content: accumulated } : m
              ));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: '*Erreur. Réessayez.*' }
            : m
        ));
      }
    } finally {
      setSending(false);
    }
  }, [input, sessionMode, sending, messages]);

  const resetSession = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionMode(null);
    setSending(false);
    setInput('');
  };

  const currentModeConfig = sessionMode ? MODES_MAP[sessionMode] : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#0a0a0a] overflow-hidden">

      {/* ── Top bar ── */}
      <div
        className="flex-shrink-0 px-6 py-4 flex items-center gap-4 border-b-4"
        style={{ background: '#111', borderColor: '#E85D04' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 hover:opacity-70 transition-opacity flex-shrink-0"
          style={{ color: '#E85D04' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-7 h-7 flex items-center justify-center flex-shrink-0 text-base"
            style={{ background: 'rgba(232,93,4,0.15)', border: '1px solid rgba(232,93,4,0.3)' }}
          >
            📰
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-black uppercase tracking-widest text-white truncate">Challenger Journalisme</p>
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/30">
              {currentModeConfig ? currentModeConfig.label : 'Choisissez un mode d\'analyse'}
            </p>
          </div>
        </div>
        {sessionMode && (
          <button
            onClick={resetSession}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white/30 hover:text-white/60 transition-colors text-[10px] font-black uppercase tracking-widest border border-white/10 hover:border-white/20"
          >
            <RotateCcw className="w-3 h-3" />
            Nouveau
          </button>
        )}
      </div>

      {/* ── Main content ── */}
      {!sessionMode ? (
        /* Mode selection grid */
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-4xl">
            <p className="text-[11px] text-white/30 font-medium mb-8 leading-relaxed">
              Sélectionnez un mode d'analyse journalistique. Chaque mode utilise un cadre méthodologique spécialisé.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {MODES.map((mode, i) => {
                const Icon = mode.icon;
                return (
                  <motion.button
                    key={mode.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => openMode(mode)}
                    className="text-left p-5 border-2 transition-all group overflow-hidden"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      borderColor: `${mode.accentColor}25`,
                      boxShadow: `3px 3px 0px 0px ${mode.accentColor}15`,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = `${mode.accentColor}60`;
                      (e.currentTarget as HTMLButtonElement).style.background = `${mode.accentColor}08`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = `${mode.accentColor}25`;
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.02)';
                    }}
                  >
                    <div
                      className="w-9 h-9 flex items-center justify-center mb-3"
                      style={{ background: `${mode.accentColor}15`, border: `1px solid ${mode.accentColor}25` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: mode.accentColor }} />
                    </div>
                    <h3 className="text-[12px] font-black text-white uppercase tracking-widest mb-1.5">{mode.label}</h3>
                    <p className="text-[10px] text-white/35 leading-relaxed mb-3">{mode.description}</p>
                    <span
                      className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all group-hover:gap-2"
                      style={{ color: mode.accentColor }}
                    >
                      Utiliser <ChevronRight className="w-2.5 h-2.5" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Active session */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Mode indicator */}
          {currentModeConfig && (
            <div
              className="flex-shrink-0 flex items-center gap-3 px-6 py-2 border-b border-white/5"
              style={{ background: `${currentModeConfig.accentColor}08` }}
            >
              {(() => { const Icon = currentModeConfig.icon; return <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: currentModeConfig.accentColor }} />; })()}
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: currentModeConfig.accentColor }}>
                Mode {currentModeConfig.label}
              </span>
              <span className="text-[8px] text-white/20 font-medium">· {messages.filter(m => m.role === 'user').length} analyse(s)</span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {messages.map((msg) => {
              const modeCfg = msg.mode ? MODES_MAP[msg.mode] : null;
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div
                      className="max-w-[75%] px-4 py-3 text-[12px] font-medium text-white leading-relaxed"
                      style={{
                        background: 'rgba(232,93,4,0.15)',
                        border: '1px solid rgba(232,93,4,0.25)',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex flex-col gap-2">
                  {modeCfg && (
                    <div className="flex items-center gap-1.5">
                      {(() => { const Icon = modeCfg.icon; return <Icon className="w-3 h-3" style={{ color: modeCfg.accentColor }} />; })()}
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: modeCfg.accentColor }}>
                        {modeCfg.label}
                      </span>
                    </div>
                  )}
                  <div
                    className="max-w-[90%] px-5 py-4 text-[12px] text-white/80 leading-relaxed border border-white/5"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    {msg.content ? (
                      <div className="prose-journalisme whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{
                              backgroundColor: modeCfg?.accentColor ?? '#E85D04',
                              animationDelay: `${i * 150}ms`,
                            }}
                          />
                        ))}
                        <span className="text-white/25 text-[10px] font-medium ml-1">Analyse en cours…</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input zone */}
          <div
            className="flex-shrink-0 border-t border-white/10 px-6 py-4"
            style={{ background: '#111' }}
          >
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !sending) {
                    e.preventDefault();
                    sendFollowUp();
                  }
                }}
                placeholder="Question de suivi ou nouvel élément à analyser…"
                rows={2}
                className="flex-1 bg-white/5 border border-white/10 focus:border-[#E85D04]/50 px-4 py-3 text-[12px] text-white placeholder:text-white/20 focus:outline-none resize-none leading-relaxed transition-colors"
              />
              <button
                onClick={sendFollowUp}
                disabled={!input.trim() || sending}
                className="flex-shrink-0 w-11 h-11 flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: '#E85D04' }}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
            <p className="text-[8px] text-white/15 mt-2 font-medium">
              Entrée pour envoyer · Shift+Entrée pour sauter une ligne
            </p>
          </div>
        </div>
      )}

      {/* ── Mode selection modal ── */}
      <AnimatePresence>
        {selectedMode && (
          <motion.div
            key="mode-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(5,5,10,0.92)' }}
            onClick={e => { if (e.target === e.currentTarget) closeMode(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl bg-[#111] border border-white/8"
              style={{ boxShadow: `8px 8px 0px 0px ${selectedMode.accentColor}25` }}
            >
              {/* Top accent */}
              <div className="h-1.5 w-full" style={{ backgroundColor: selectedMode.accentColor }} />

              {/* Header */}
              <div className="px-7 py-6 border-b border-white/8 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-11 h-11 flex items-center justify-center flex-shrink-0"
                    style={{ background: `${selectedMode.accentColor}15`, border: `1.5px solid ${selectedMode.accentColor}30` }}
                  >
                    {(() => { const Icon = selectedMode.icon; return <Icon className="w-5 h-5" style={{ color: selectedMode.accentColor }} />; })()}
                  </div>
                  <div>
                    <p
                      className="text-[9px] font-black uppercase tracking-widest mb-0.5"
                      style={{ color: selectedMode.accentColor }}
                    >
                      Challenger Journalisme
                    </p>
                    <h2 className="text-[18px] font-black text-white leading-tight">{selectedMode.label}</h2>
                    <p className="text-[11px] text-white/35 font-medium mt-0.5">{selectedMode.description}</p>
                  </div>
                </div>
                <button onClick={closeMode} className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 mt-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-7 py-5">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">
                  {selectedMode.inputLabel}
                </label>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={selectedMode.inputPlaceholder}
                  rows={6}
                  autoFocus
                  className="w-full border border-white/10 px-4 py-3 text-[12px] text-white placeholder:text-white/20 focus:outline-none resize-none leading-relaxed transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = `${selectedMode.accentColor}50`)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.metaKey) startSession();
                  }}
                />
                <p className="text-[8px] text-white/15 mt-1.5">Cmd+Entrée pour lancer l'analyse</p>
              </div>

              {/* CTA */}
              <div className="px-7 pb-7">
                <button
                  onClick={startSession}
                  disabled={!input.trim()}
                  className="w-full flex items-center justify-center gap-2.5 py-4 text-white text-[12px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-40 transition-all"
                  style={{
                    backgroundColor: selectedMode.accentColor,
                    boxShadow: `4px 4px 0px 0px ${selectedMode.accentColor}40`,
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  Lancer l'analyse
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
