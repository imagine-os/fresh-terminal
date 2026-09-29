import { PRODUCT_NAME } from '@shared/brand';
import type { UiState } from '@shared/ops';
import type { TimelineExport } from '@shared/timeline';
import type { Entry } from '@shared/ledger';
import type { Box } from '../store';

export const SESSION_VERSION = 'session.v0' as const;
export const SITE_URL = 'https://imagine-os.github.io/fresh-terminal/';

/** Our mark, in plain characters, for the top of every exported file. */
export const ASCII_MARK = [
  '┌──────────────────────────────────────────────┐',
  '│                                              │',
  '│   >_   F R E S H   T E R M I N A L           │',
  '│        Evolve as we grow.                    │',
  '│                                              │',
  '│   ▄▄▄▄▄▄  the box that edits itself          │',
  '│   █ >_ █  imagine-os.github.io/fresh-terminal│',
  '│   ▀▀▀▀▀▀                                     │',
  '│                                              │',
  '└──────────────────────────────────────────────┘',
];

export interface SessionFile {
  /** Human text first, so anyone opening the file knows what it is and how to come back. */
  readme: string[];
  product: string;
  product_version: string;
  version: typeof SESSION_VERSION;
  exported_at: number;
  come_back: string;
  how_to_import: string;
  box: Box | null;
  timeline: TimelineExport;
  ui: UiState;
  entries: Entry[];
}

export function readmeFor(boxName: string, exportedAt: number): string[] {
  const when = new Date(exportedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return [
    ...ASCII_MARK,
    '',
    `This is your ${PRODUCT_NAME} session "${boxName}", saved ${when}.`,
    'It holds every step (what you typed, every reply, every change to the interface, every undo),',
    'the menu, pages, layout, theme and glossary of the box, and its ledger entries.',
    'It is yours. Nothing in it is needed by us to keep working, and nothing here is a secret.',
    '',
    `Come back: ${SITE_URL}`,
    'Import: open the terminal, press the tools icon (top right), choose "Import a session" and pick this file.',
    'Or drag this file onto the terminal. It becomes a box again, with its pages, menu and transcript.',
    'The edit history and ledger stay in this file for reference; the import rebuilds the box from its final state.',
    '',
    'File shape: session.v0 (JSON). Readable by people and agents alike.',
  ];
}

/** Lenient check that a parsed object is one of our session files. */
export function isSessionFile(value: unknown): value is SessionFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<SessionFile>;
  return file.version === SESSION_VERSION && !!file.timeline && Array.isArray(file.timeline.lines) && !!file.ui && Array.isArray(file.ui.nav);
}
