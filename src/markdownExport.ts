/**
 * markdownExport.ts — Export conversations en Markdown enrichi
 * Challenger IA — Stariax Group
 */

export interface ExportMessage {
  role: 'user' | 'assistant' | 'command';
  content: string;
  timestamp: Date;
  persona?: string;
}

/**
 * Génère un export Markdown standard de la conversation
 */
export function generateMarkdown(
  title: string,
  messages: ExportMessage[],
  personaName?: string
): string {
  const date = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const lines: string[] = [
    `# ${title}`,
    ``,
    `**Date :** ${date}  `,
    personaName ? `**Challenger :** ${personaName}  ` : '',
    `**Exporté depuis :** Challenger IA — [challengeria.com](https://challengeria.com)`,
    ``,
    `---`,
    ``,
  ];

  const filtered = messages.filter(m => m.role !== 'command');

  for (const msg of filtered) {
    const time = msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (msg.role === 'user') {
      lines.push(`### Vous — ${time}`);
      lines.push(``);
      lines.push(msg.content);
      lines.push(``);
    } else {
      lines.push(`### Challenger — ${time}`);
      lines.push(``);
      lines.push(msg.content);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`*Généré par Challenger IA — Entraîne ton intelligence*`);

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Génère un export format Obsidian (Markdown + YAML frontmatter + wikilinks + tags).
 *
 * Compatible Obsidian — pour Daily Notes, graph view et recherche par tag.
 * Le frontmatter contient les métadonnées de session, et le contenu utilise des
 * tags `#challenger/*` plus des wikilinks `[[Persona]]` pour relier les notes
 * d'une même série dans le coffre.
 */
export function generateObsidianMarkdown(
  title: string,
  messages: ExportMessage[],
  personaName?: string
): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const dateLong = now.toLocaleDateString('fr-FR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const safeTitle = title.replace(/[\[\]"\n]/g, '').slice(0, 120);
  const safePersona = (personaName ?? 'Challenger IA').replace(/[\[\]"\n]/g, '');
  const filtered = messages.filter(m => m.role !== 'command');
  const tags = [
    'challenger',
    'challenger/session',
    `challenger/persona/${safePersona.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
  ];

  const lines: string[] = [
    '---',
    'app: Challenger IA',
    `title: "${safeTitle}"`,
    `persona: "[[${safePersona}]]"`,
    `date: ${iso}`,
    `messages: ${filtered.length}`,
    `tags: [${tags.map(t => `"${t}"`).join(', ')}]`,
    'source: "https://challengeria.com"',
    '---',
    '',
    `# ${safeTitle}`,
    '',
    `> [!info] Session avec [[${safePersona}]]`,
    `> ${dateLong} — ${filtered.length} échanges`,
    '',
    '## Transcription',
    '',
  ];

  for (const msg of filtered) {
    const time = msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (msg.role === 'user') {
      lines.push(`### Vous · ${time}`);
      lines.push('');
      lines.push(msg.content);
    } else {
      lines.push(`### [[${safePersona}]] · ${time}`);
      lines.push('');
      lines.push(msg.content);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_Exporté depuis Challenger IA — ${dateLong}_`);

  return lines.join('\n');
}

/**
 * Génère un export format Notion-compatible (Markdown avec blocs callout)
 */
export function generateNotionMarkdown(
  title: string,
  messages: ExportMessage[],
  personaName?: string
): string {
  const date = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const lines: string[] = [
    `# ${title}`,
    ``,
    `> **${date}** | **${personaName ?? 'Challenger IA'}** | challengeria.com`,
    ``,
  ];

  const filtered = messages.filter(m => m.role !== 'command');

  for (const msg of filtered) {
    const time = msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (msg.role === 'user') {
      lines.push(`## Vous — ${time}`);
      lines.push(``);
      lines.push(`> ${msg.content.replace(/\n/g, '\n> ')}`);
      lines.push(``);
    } else {
      lines.push(`## Challenger — ${time}`);
      lines.push(``);
      lines.push(msg.content);
      lines.push(``);
    }
  }

  return lines.join('\n');
}

/**
 * Télécharge un fichier texte côté client
 */
export function downloadTextFile(content: string, filename: string, mimeType = 'text/markdown'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copie dans le presse-papier
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
