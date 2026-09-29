/**
 * The hub's data (2026-09-29, C-086): built from the docs at deploy time by
 * scripts/build-hub.ts and served only to signed-in admins. Shared by the
 * builder and the hub page.
 */
export interface PromptItem {
  kind: 'prompt';
  n: number;
  when: string;
  channel: boolean;
  /** Justin's message, word for word (the blockquote, markers removed). */
  text: string;
  /** Notes kept with the message ("(With two screenshots ...)"). */
  extra: string;
  /** The reply summary ("What happened"), rendered to HTML from our own Markdown. */
  happened_html: string;
  link: string | null;
  ts: string | null;
  search: string;
}

export interface DecisionItem {
  kind: 'canon';
  id: string;
  date: string;
  title: string;
  section: string;
  status: string;
  html: string;
  search: string;
}

export interface RecordItem {
  kind: 'decision' | 'changelog';
  id: string;
  title: string;
  date: string;
  path: string;
  html: string;
  search: string;
}

export type LibraryItem = PromptItem | DecisionItem | RecordItem;

export interface Library {
  prompts: PromptItem[];
  canon: DecisionItem[];
  records: RecordItem[];
}

export interface WikiPage {
  path: string;
  href: string;
  title: string;
  about: string;
  group: string;
}

export type ItemStatus = 'live' | 'not wired' | 'planned' | 'in progress';

export interface HubItem {
  id: string;
  name: string;
  status: ItemStatus;
  href: string;
  about: string;
  links?: Array<{ label: string; href: string }>;
  canon?: string[];
}

export interface SecretState {
  name: string;
  where: 'GitHub Actions secret' | 'Worker secret' | 'Worker var';
  state: 'set' | 'missing' | 'unknown';
  for: string;
}

export interface SecretsData {
  checked_at: string | null;
  secrets: SecretState[];
  worker_secrets: string[];
}

export interface PlanTask {
  id: string;
  title: string;
  status: string;
  depends_on: string[];
  model: string;
  pass: number;
}

export interface HubManifest {
  built_at: string;
  commit: string | null;
  counts: Record<string, number>;
}
