import { useEffect, useMemo, useState } from 'react';
import type { HubItem, HubManifest, Library, LibraryItem, PlanTask, SecretsData, WikiPage } from '@shared/hub/types';
import { HubError } from './api';
import type { HubClient } from './client';
import { CreditsPanel } from './CreditsPanel';
import { Status } from './Status';

/**
 * The hub (2026-09-29, C-088): every page and item we are working on, the wiki,
 * the Canon, a searchable prompt/response library, the plan, the credits panel
 * and the secrets checklist (names only). Void theme, square corners.
 */
interface Props {
  client: HubClient;
  who: { name: string; userId: string };
  onSignOut: () => void;
  sample?: boolean;
}

const SECTIONS = [
  { id: 'work', label: 'Work' },
  { id: 'library', label: 'Library' },
  { id: 'canon', label: 'Canon' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'plan', label: 'Plan' },
  { id: 'credits', label: 'Credits' },
  { id: 'secrets', label: 'Secrets' },
] as const;

interface Loaded<T> {
  value: T | null;
  error: string | null;
}

function useData<T>(client: HubClient, name: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ value: null, error: null });
  useEffect(() => {
    let live = true;
    client
      .data<T>(name)
      .then((value) => live && setState({ value, error: null }))
      .catch((error: unknown) => live && setState({ value: null, error: error instanceof HubError && error.status === 404 ? 'not in this build' : error instanceof Error ? error.message : String(error) }));
    return () => {
      live = false;
    };
  }, [client, name]);
  return state;
}


function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="hub-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {lead ? <p className="hub-lead">{lead}</p> : null}
      {children}
    </section>
  );
}

function Missing({ what, error }: { what: string; error: string | null }) {
  return <p className="hub-muted">{error ? `${what}: ${error}.` : `Loading ${what}…`}</p>;
}

export function Hub({ client, who, onSignOut, sample = false }: Props) {
  const items = useData<{ items: HubItem[] }>(client, 'items');
  const library = useData<Library>(client, 'library');
  const wiki = useData<{ pages: WikiPage[] }>(client, 'wiki');
  const plan = useData<{ tasks: PlanTask[] }>(client, 'plan');
  const secrets = useData<SecretsData>(client, 'secrets');
  const manifest = useData<HubManifest>(client, 'manifest');

  return (
    <div className="hub" data-testid="hub" data-hub="admin">
      <a className="hub-skip" href="#work">
        Skip to content
      </a>
      <header className="hub-bar">
        <a className="hub-brand" href="#work">
          <span aria-hidden="true">&gt;_</span> Fresh Terminal hub
        </a>
        <nav aria-label="Hub sections" className="hub-nav">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>
        <span className="hub-who" title={who.userId}>
          {who.name}
        </span>
        <button type="button" className="hub-button hub-quiet" onClick={onSignOut} disabled={sample} title={sample ? 'Local preview: no session to sign out of' : undefined}>
          Sign out
        </button>
      </header>
      {sample ? (
        <p className="hub-banner" role="note">
          Local preview with sample admin numbers. The live hub reads the router.
        </p>
      ) : null}
      <main className="hub-main">
        <Section id="work" title="What we're working on" lead="Every page and item, with its live link and where it stands.">
          {items.value ? <WorkGrid items={items.value.items} /> : <Missing what="the work list" error={items.error} />}
        </Section>

        <Section id="library" title="Prompt and response library" lead="Justin's messages word for word, what happened after each, the Canon, decision records and changelogs. Search across all of it.">
          {library.value ? <LibraryView library={library.value} /> : <Missing what="the library" error={library.error} />}
        </Section>

        <Section id="canon" title="Canon" lead="What is true now and how it got there. The newest decisions first.">
          {library.value && wiki.value ? <CanonView library={library.value} pages={wiki.value.pages} /> : <Missing what="the Canon" error={library.error ?? wiki.error} />}
        </Section>

        <Section id="wiki" title="Documentation wiki" lead="Every doc in terminal/docs, rendered on each deploy.">
          {wiki.value ? <WikiView pages={wiki.value.pages} /> : <Missing what="the wiki index" error={wiki.error} />}
        </Section>

        <Section id="plan" title="Plan" lead="Tasks by status. Bound by dependencies, not dates.">
          {plan.value ? <PlanView tasks={plan.value.tasks} /> : <Missing what="the plan" error={plan.error} />}
        </Section>

        <Section id="credits" title="Credits" lead="Give friends credit, make invite codes, and watch the ledger. Every grant is recorded with who gave it and why.">
          <CreditsPanel client={client} />
        </Section>

        <Section id="secrets" title="Secrets checklist" lead="Names only. Whether each one is set is checked by the deploy; values never reach this page.">
          {secrets.value ? <SecretsView data={secrets.value} /> : <Missing what="the checklist" error={secrets.error} />}
        </Section>
      </main>
      <footer className="hub-foot">
        {manifest.value ? (
          <p>
            Built {manifest.value.built_at.replace('T', ' ').slice(0, 16)} UTC
            {manifest.value.commit ? (
              <>
                {' '}
                from{' '}
                <a href={`https://github.com/imagine-os/fresh-terminal/commit/${manifest.value.commit}`} rel="noreferrer">
                  {manifest.value.commit.slice(0, 7)}
                </a>
              </>
            ) : null}
            . Private: the site checks an admin session before it sends any of this.
          </p>
        ) : null}
      </footer>
    </div>
  );
}

function WorkGrid({ items }: { items: HubItem[] }) {
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of items) out[item.status] = (out[item.status] ?? 0) + 1;
    return out;
  }, [items]);
  return (
    <>
      <p className="hub-counts" aria-label="Counts by status">
        {Object.entries(counts).map(([status, n]) => (
          <span key={status}>
            <Status value={status} /> {n}
          </span>
        ))}
      </p>
      <ul className="hub-grid" role="list">
        {items.map((item) => (
          <li key={item.id} className="hub-tile" data-status={item.status.replace(/\s+/g, '-')}>
            <div className="hub-tile-head">
              <h3>
                <a href={item.href}>{item.name}</a>
              </h3>
              <Status value={item.status} />
            </div>
            <p>{item.about}</p>
            <p className="hub-links">
              <a href={item.href}>{item.href.startsWith('#') || item.href === '/' ? 'Open' : item.href.replace(/^https:\/\/github.com\/imagine-os\/fresh-terminal.*/, 'GitHub')}</a>
              {(item.links ?? []).map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
              {(item.canon ?? []).map((id) => (
                <a key={id} href={`#library`} onClick={() => window.dispatchEvent(new CustomEvent('hub:search', { detail: id }))}>
                  {id}
                </a>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

type Filter = 'all' | 'prompt' | 'canon' | 'decision' | 'changelog';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'canon', label: 'Canon' },
  { id: 'decision', label: 'Decisions' },
  { id: 'changelog', label: 'Changelog' },
];
const PAGE = 40;

function LibraryView({ library }: { library: Library }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    const onSearch = (event: Event) => {
      setQuery(String((event as CustomEvent<string>).detail ?? ''));
      setFilter('all');
    };
    window.addEventListener('hub:search', onSearch);
    return () => window.removeEventListener('hub:search', onSearch);
  }, []);
  const all = useMemo<LibraryItem[]>(() => [...[...library.prompts].reverse(), ...[...library.canon].reverse(), ...[...library.records].reverse()], [library]);
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((item) => (filter === 'all' || item.kind === filter) && words.every((word) => item.search.includes(word) || ('id' in item && item.id.toLowerCase() === word)));
  }, [all, filter, query]);
  useEffect(() => setShown(PAGE), [query, filter]);
  const counts: Record<Filter, number> = { all: all.length, prompt: library.prompts.length, canon: library.canon.length, decision: library.records.filter((r) => r.kind === 'decision').length, changelog: library.records.filter((r) => r.kind === 'changelog').length };
  return (
    <div className="hub-library">
      <div className="hub-search">
        <label htmlFor="hub-q">Search</label>
        <input id="hub-q" type="search" value={query} placeholder="credits, koi, C-074, Clerk…" onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      </div>
      <div className="hub-filters" role="group" aria-label="Show">
        {FILTERS.map((option) => (
          <button key={option.id} type="button" className="hub-toggle" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
            {option.label} <span className="hub-muted">{counts[option.id]}</span>
          </button>
        ))}
      </div>
      <p className="hub-muted" aria-live="polite">
        {results.length} {results.length === 1 ? 'match' : 'matches'}
      </p>
      <ol className="hub-results" role="list">
        {results.slice(0, shown).map((item) => (
          <li key={`${item.kind}-${'n' in item ? item.n : item.id}`}>
            <LibraryEntry item={item} />
          </li>
        ))}
      </ol>
      {shown < results.length ? (
        <button type="button" className="hub-button" onClick={() => setShown((value) => value + PAGE)}>
          Show {Math.min(PAGE, results.length - shown)} more
        </button>
      ) : null}
    </div>
  );
}

function LibraryEntry({ item }: { item: LibraryItem }) {
  if (item.kind === 'prompt') {
    return (
      <article className="hub-entry" data-kind="prompt">
        <header>
          <span className="hub-tag">Prompt {item.n}</span>
          <span className="hub-muted">
            {item.when}
            {item.channel ? ' · channel post' : ''}
          </span>
        </header>
        <blockquote className="hub-verbatim">{item.text}</blockquote>
        {item.extra ? <p className="hub-muted">{item.extra}</p> : null}
        <div className="hub-reply">
          <strong>What happened</strong>
          <div className="hub-md" dangerouslySetInnerHTML={{ __html: item.happened_html }} />
        </div>
        {item.link ? (
          <p>
            <a href={item.link} rel="noreferrer">
              Slack message
            </a>
            {item.ts ? <span className="hub-muted"> · ts {item.ts}</span> : null}
          </p>
        ) : null}
      </article>
    );
  }
  if (item.kind === 'canon') {
    return (
      <details className="hub-entry" data-kind="canon">
        <summary>
          <span className="hub-tag">{item.id}</span> {item.title} <span className="hub-muted">· {item.date}</span>
        </summary>
        <p className="hub-muted">{item.section}</p>
        <div className="hub-md" dangerouslySetInnerHTML={{ __html: item.html }} />
      </details>
    );
  }
  return (
    <details className="hub-entry" data-kind={item.kind}>
      <summary>
        <span className="hub-tag">{item.kind === 'decision' ? `Decision ${item.id.slice(0, 4)}` : `Changelog ${item.id}`}</span> {item.title}
        {item.date ? <span className="hub-muted"> · {item.date}</span> : null}
      </summary>
      <p>
        <a href={`/wiki/${item.path.replace(/\.md$/, '.html')}`}>Open in the wiki</a>
      </p>
      <div className="hub-md" dangerouslySetInnerHTML={{ __html: item.html }} />
    </details>
  );
}

function CanonView({ library, pages }: { library: Library; pages: WikiPage[] }) {
  const canonPages = pages.filter((page) => page.path.startsWith('canon/'));
  const latest = [...library.canon].reverse().slice(0, 8);
  return (
    <div className="hub-two">
      <ul className="hub-list" role="list">
        {canonPages.map((page) => (
          <li key={page.path}>
            <a href={page.href}>{page.title.replace(/^canon\//, '')}</a>
            <span className="hub-muted"> {page.about}</span>
          </li>
        ))}
      </ul>
      <ol className="hub-list" role="list" aria-label="Newest Canon entries">
        {latest.map((entry) => (
          <li key={`${entry.id}-${entry.title}`}>
            <span className="hub-tag">{entry.id}</span> {entry.title}
            <span className="hub-muted"> · {entry.date}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function WikiView({ pages }: { pages: WikiPage[] }) {
  const groups = useMemo(() => {
    const out = new Map<string, WikiPage[]>();
    for (const page of pages) out.set(page.group, [...(out.get(page.group) ?? []), page]);
    return [...out.entries()];
  }, [pages]);
  return (
    <>
      <p>
        <a className="hub-button" href="/wiki/">
          Open the wiki
        </a>{' '}
        <span className="hub-muted">{pages.length} pages indexed</span>
      </p>
      <div className="hub-columns">
        {groups.map(([group, list]) => (
          <div key={group}>
            <h3>{group}</h3>
            <ul className="hub-list" role="list">
              {list.map((page) => (
                <li key={page.path}>
                  <a href={page.href}>{page.title}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

const PLAN_COLUMNS = ['doing', 'todo', 'done'] as const;

function PlanView({ tasks }: { tasks: PlanTask[] }) {
  const [allDone, setAllDone] = useState(false);
  return (
    <div className="hub-kanban">
      {PLAN_COLUMNS.map((status) => {
        const list = tasks.filter((task) => task.status === status);
        const visible = status === 'done' && !allDone ? list.slice(-10).reverse() : status === 'done' ? [...list].reverse() : list;
        return (
          <section key={status} aria-label={`${status}: ${list.length}`} className="hub-column">
            <h3>
              {status} <span className="hub-muted">{list.length}</span>
            </h3>
            <ul role="list">
              {visible.map((task) => (
                <li key={task.id} className="hub-card-task">
                  <p>{task.title}</p>
                  <p className="hub-muted">
                    {task.id} · pass {task.pass} · {task.model}
                    {task.depends_on.length ? ` · after ${task.depends_on.join(', ')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            {status === 'done' && list.length > 10 ? (
              <button type="button" className="hub-button hub-quiet" onClick={() => setAllDone((value) => !value)}>
                {allDone ? 'Show the last 10' : `Show all ${list.length}`}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SecretsView({ data }: { data: SecretsData }) {
  return (
    <>
      <p className="hub-muted">
        {data.checked_at ? `Checked by the deploy at ${data.checked_at.replace('T', ' ').slice(0, 16)} UTC.` : 'Not checked in this build: states show as unknown.'} Add or change them at{' '}
        <a href="https://github.com/imagine-os/fresh-terminal/settings/secrets/actions" rel="noreferrer">
          GitHub → Settings → Secrets and variables → Actions
        </a>
        .
      </p>
      <div className="hub-table" tabIndex={0} role="region" aria-label="Secrets">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">State</th>
              <th scope="col">Where</th>
              <th scope="col">For</th>
            </tr>
          </thead>
          <tbody>
            {data.secrets.map((secret) => (
              <tr key={secret.name}>
                <td>
                  <code>{secret.name}</code>
                </td>
                <td>
                  <Status value={secret.state} />
                </td>
                <td>{secret.where}</td>
                <td>{secret.for}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.worker_secrets.length ? (
        <p>
          Router Worker secrets set (names): {data.worker_secrets.map((name) => <code key={name}>{name} </code>)}
        </p>
      ) : null}
    </>
  );
}

