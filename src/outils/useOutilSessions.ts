import { useState, useCallback, useEffect } from 'react';
import type { OutilId } from './outilsTypes';

// ─── Storage keys ────────────────────────────────────────────────────────────

const KEYS = {
  sessions: (id: OutilId) => `cr_sessions_${id}`,
  projects: (id: OutilId) => `cr_projects_${id}`,
  trials: 'cr_tool_trials',
  pinned: 'cr_pinned_tools',
};

const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OutilProject {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface OutilSessionMsg {
  id: string;
  role: 'user' | 'assistant' | 'command';
  content: string;
  modeId?: string;
  attachments?: { id: string; name: string; type: string; size: number }[];
  ts: string; // ISO
}

export interface OutilSession {
  id: string;
  toolId: OutilId;
  title: string;
  projectId?: string;
  modeId?: string;
  msgs: OutilSessionMsg[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  importedFromChatId?: string; // linked base chat conv id
}

export interface TrialStatus {
  started: boolean;
  startedAt?: number; // timestamp ms
  expired: boolean;
  msRemaining: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function uid() { return Math.random().toString(36).slice(2, 11); }

const PROJECT_COLORS = ['#E85D04', '#7C3AED', '#059669', '#0891B2', '#DC2626', '#B45309'];

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOutilSessions(toolId: OutilId) {
  // Sessions
  const [sessions, setSessions] = useState<OutilSession[]>(() =>
    load<OutilSession[]>(KEYS.sessions(toolId), [])
  );

  // Projects
  const [projects, setProjects] = useState<OutilProject[]>(() =>
    load<OutilProject[]>(KEYS.projects(toolId), [])
  );

  // Trial status
  const [trialStatus, setTrialStatus] = useState<TrialStatus>(() => {
    const trials = load<Record<string, number>>(KEYS.trials, {});
    const startedAt = trials[toolId];
    if (!startedAt) return { started: false, expired: false, msRemaining: TRIAL_DURATION_MS };
    const elapsed = Date.now() - startedAt;
    return {
      started: true,
      startedAt,
      expired: elapsed >= TRIAL_DURATION_MS,
      msRemaining: Math.max(0, TRIAL_DURATION_MS - elapsed),
    };
  });

  // Pinned tools
  const [pinnedTools, setPinnedTools] = useState<OutilId[]>(() =>
    load<OutilId[]>(KEYS.pinned, [])
  );

  // Auto-désépingler quand l'essai expire
  useEffect(() => {
    if (trialStatus.expired && pinnedTools.includes(toolId)) {
      setPinnedTools(prev => {
        const next = prev.filter(t => t !== toolId);
        save(KEYS.pinned, next);
        window.dispatchEvent(new CustomEvent('cr-pinned-changed', { detail: next }));
        return next;
      });
    }
  }, [trialStatus.expired, toolId]);

  // Persist sessions whenever they change
  useEffect(() => {
    save(KEYS.sessions(toolId), sessions);
  }, [sessions, toolId]);

  // Persist projects
  useEffect(() => {
    save(KEYS.projects(toolId), projects);
  }, [projects, toolId]);

  // ── Trial ───────────────────────────────────────────────────────────────

  const startTrial = useCallback(() => {
    const trials = load<Record<string, number>>(KEYS.trials, {});
    if (trials[toolId]) return; // already started
    const now = Date.now();
    trials[toolId] = now;
    save(KEYS.trials, trials);
    setTrialStatus({
      started: true,
      startedAt: now,
      expired: false,
      msRemaining: TRIAL_DURATION_MS,
    });
  }, [toolId]);

  const refreshTrialStatus = useCallback(() => {
    const trials = load<Record<string, number>>(KEYS.trials, {});
    const startedAt = trials[toolId];
    if (!startedAt) {
      setTrialStatus({ started: false, expired: false, msRemaining: TRIAL_DURATION_MS });
      return;
    }
    const elapsed = Date.now() - startedAt;
    setTrialStatus({
      started: true,
      startedAt,
      expired: elapsed >= TRIAL_DURATION_MS,
      msRemaining: Math.max(0, TRIAL_DURATION_MS - elapsed),
    });
  }, [toolId]);

  // ── Pin / Unpin ─────────────────────────────────────────────────────────

  const togglePin = useCallback((id: OutilId = toolId) => {
    setPinnedTools(prev => {
      const next = prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id];
      save(KEYS.pinned, next);
      // Dispatch event so App.tsx can react
      window.dispatchEvent(new CustomEvent('cr-pinned-changed', { detail: next }));
      return next;
    });
  }, [toolId]);

  const isPinned = pinnedTools.includes(toolId);

  // ── Sessions CRUD ───────────────────────────────────────────────────────

  const addSession = useCallback((session: OutilSession) => {
    setSessions(prev => [session, ...prev]);
  }, []);

  const updateSession = useCallback((id: string, updater: (s: OutilSession) => OutilSession) => {
    setSessions(prev => prev.map(s => s.id === id ? updater(s) : s));
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  const assignProject = useCallback((sessionId: string, projectId: string | undefined) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, projectId } : s));
  }, []);

  // ── Projects CRUD ───────────────────────────────────────────────────────

  const createProject = useCallback((name: string): OutilProject => {
    const usedColors = projects.map(p => p.color);
    const color = PROJECT_COLORS.find(c => !usedColors.includes(c)) ?? PROJECT_COLORS[0];
    const project: OutilProject = {
      id: uid(),
      name: name.trim(),
      color,
      createdAt: new Date().toISOString(),
    };
    setProjects(prev => [...prev, project]);
    return project;
  }, [projects]);

  const renameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    // Remove project assignment from sessions
    setSessions(prev => prev.map(s => s.projectId === id ? { ...s, projectId: undefined } : s));
  }, []);

  // ── Import from base chat ───────────────────────────────────────────────

  const importFromChat = useCallback((
    chatConv: { id: string; title: string; messages: { id: string; role: string; content: string; timestamp: string }[] },
    modeId: string
  ): OutilSession => {
    const now = new Date().toISOString();
    const session: OutilSession = {
      id: uid(),
      toolId,
      title: `[Import] ${chatConv.title}`,
      modeId,
      msgs: chatConv.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ts: m.timestamp,
        })),
      createdAt: now,
      updatedAt: now,
      importedFromChatId: chatConv.id,
    };
    setSessions(prev => [session, ...prev]);
    return session;
  }, [toolId]);

  return {
    sessions,
    projects,
    trialStatus,
    pinnedTools,
    isPinned,
    // Trial
    startTrial,
    refreshTrialStatus,
    // Pin
    togglePin,
    // Sessions
    addSession,
    updateSession,
    deleteSession,
    assignProject,
    // Projects
    createProject,
    renameProject,
    deleteProject,
    // Import
    importFromChat,
  };
}

// ─── Global pinned tools reader (for App.tsx) ─────────────────────────────────

export function getPinnedTools(): OutilId[] {
  return load<OutilId[]>(KEYS.pinned, []);
}

export { TRIAL_DURATION_MS };
