import type { Chip } from '@shared/chips';
import { mergeDialect } from '@shared/dialect';
import type { Op } from '@shared/ops';
import { SEED_THEMES } from '@shared/themes';
import { revealFor, type RevealPattern } from '@shared/starters';
import type { StringKey } from '../i18n/strings';
import type { Box } from '../store';

export type LocalCommand =
  | { kind: 'system'; key: StringKey; vars?: Record<string, string>; reveal: RevealPattern }
  | { kind: 'text'; text: string; reveal: RevealPattern; speak?: boolean }
  | { kind: 'create-box'; name: string }
  | { kind: 'draw'; component: 'dashboard' | 'login' | 'plan-kanban'; reveal: RevealPattern; wired: boolean }
  | { kind: 'ops'; ops: Op[]; openPage?: string }
  | { kind: 'lang'; lang: 'en' | 'es' }
  | { kind: 'verify-chain' };

export interface LocalContext {
  boxes: Box[];
  lang: string;
  dialectText: string;
  actionIntents: string[];
}


/**
 * Intents answered locally so the product works with no router and no key.
 * Everything else goes to the router. Every verb here has a starter record.
 */
export function matchLocalCommand(text: string, chips: Chip[], context: LocalContext): LocalCommand | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase().replace(/[.!?]+$/, '');
  const reveal = revealFor(trimmed);

  if (/^list (my )?(boxes|stages)$/.test(lower)) {
    return {
      kind: 'system',
      key: 'system.listBoxes',
      vars: { names: context.boxes.map((box) => box.name).join(', ') || '—' },
      reveal,
    };
  }
  if (/^show today$/.test(lower)) {
    const date = new Date().toLocaleDateString(context.lang === 'es' ? 'es' : 'en', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return { kind: 'system', key: 'system.today', vars: { date }, reveal };
  }
  if (/^open settings$/.test(lower)) {
    return { kind: 'system', key: 'system.settings', reveal };
  }

  const makeThing = /^make (?:a )?(page|box|stage) (?:called|named) /.exec(lower);
  if (makeThing !== null) {
    const object = chips.find((chip) => chip.kind === 'object' && chip.value);
    const name = (object?.value ?? trimmed.slice(makeThing[0].length).replace(/^["'“]|["'”]$/g, '')).trim();
    if (name.length > 0 && (makeThing[1] === 'box' || makeThing[1] === 'stage')) {
      return { kind: 'create-box', name };
    }
    if (name.length > 0) {
      // A real page in this box, linked from the sidebar.
      return {
        kind: 'ops',
        ops: [
          { op: 'page.create', title: name, blocks: [{ kind: 'heading', text: name, level: 1 }] },
          { op: 'nav.add', label: name, target: { kind: 'page', ref: name } },
        ],
        openPage: name,
      };
    }
  }

  if (/^draw (?:a |an )?(?:shadcn )?dashboard/.test(lower)) {
    return { kind: 'draw', component: 'dashboard', reveal, wired: false };
  }
  if (/^draw (?:a |an )?login/.test(lower)) {
    return { kind: 'draw', component: 'login', reveal, wired: false };
  }
  if (/^draw (?:a )?kanban/.test(lower)) {
    return { kind: 'draw', component: 'plan-kanban', reveal, wired: true };
  }

  const switchTheme = /^(?:switch|change) (?:theme )?to (.+)$/.exec(lower);
  if (switchTheme !== null) {
    const wanted = (switchTheme[1] ?? '').trim();
    const theme = SEED_THEMES.find(
      (candidate) => candidate.name.toLowerCase() === wanted || candidate.id === wanted.replace(/\s+/g, '-'),
    );
    if (theme) {
      return { kind: 'ops', ops: [{ op: 'theme.set', theme_id: theme.id }] };
    }
    return { kind: 'text', text: `No theme called "${wanted}". Themes: ${SEED_THEMES.map((t) => t.name).join(', ')}.`, reveal: 'typewriter' };
  }

  const setDialect = /^set (top bar|bottom bar|left sidebar|right sidebar|sidebar|stage): (.+)$/.exec(lower);
  if (setDialect !== null) {
    const statement = `${setDialect[1]}: ${setDialect[2]}.`;
    const checked = mergeDialect(context.dialectText, statement);
    if (checked.issues.length > 0) {
      return { kind: 'text', text: `Could not read that dialect: ${checked.issues.map((issue) => issue.message).join('; ')}.`, reveal: 'typewriter' };
    }
    return { kind: 'ops', ops: [{ op: 'shell.set', dialect_text: statement }] };
  }

  if (/^charge me nothing/.test(lower)) {
    const count = /(\d+) calls?/.exec(lower)?.[1] ?? 'the next';
    return {
      kind: 'text',
      text: `Would write: "Model calls: free" for ${count} calls as a credit rule on your owner record, then return to pass-through. Not wired yet: billing rules per owner arrive with the SpacetimeDB store.`,
      reveal,
    };
  }

  if (/^verify (?:the )?chain$/.test(lower)) {
    return { kind: 'verify-chain' };
  }

  const speak = /^speak:?\s*(.*)$/.exec(lower);
  if (speak !== null) {
    const question = speak[1] ?? '';
    if (/what can i do/.test(question) || question.length === 0) {
      return {
        kind: 'text',
        text: `You can: ${context.actionIntents.join(', ')}.`,
        reveal,
        speak: true,
      };
    }
    return { kind: 'text', text: question, reveal, speak: true };
  }

  if (/^translate (?:this )?(?:box )?to spanish$/.test(lower)) {
    return { kind: 'lang', lang: 'es' };
  }
  if (/^(?:translate (?:this )?(?:box )?to english|traducir .* ingl[eé]s)$/.test(lower)) {
    return { kind: 'lang', lang: 'en' };
  }

  return null;
}
