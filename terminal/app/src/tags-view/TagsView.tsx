import { useMemo, useState } from 'react';
import { CHIP_KINDS, type ChipKind } from '@shared/chips';
import { useI18n } from '../i18n';
import { readJson, writeJson } from '../lib/storage';
import { useStoreSnapshot } from '../store';
import type { Box, Line } from '../store/types';
import { chipIcon } from '../terminal/ChipText';
import { Button } from '../ui/Button';
import { DEFAULT_GRAPH, filterTags, layoutGraph, sortTags, tagFacets, tagLinks, tagRows, type GraphOptions, type TagRow, type TagSort } from './rows';

export { tagRows, tagLinks, filterTags, sortTags, layoutGraph } from './rows';
export type { TagRow, TagLink, GraphOptions } from './rows';

/**
 * Tags (C-099): every tag from every line, on its own page next to Actions.
 * Five views over the same rows: a graph by default (tags that appear on the
 * same line are linked; the more often, the heavier the link), then table,
 * list, board by kind and a timeline from first to last use. One row of
 * controls: words, kind, stage, sort; the graph adds its own small options.
 * Clicking a tag anywhere narrows every view to it.
 */
type View = 'graph' | 'table' | 'list' | 'board' | 'timeline';

const VIEWS: View[] = ['graph', 'table', 'list', 'board', 'timeline'];
const GRAPH_KEY = 'fresh-terminal.tags.graph';
const GRAPH_W = 960;
const GRAPH_H = 600;

/** Time of day when everything happened today; day and month once the rows span more than a day. */
function whenFor(spanMs: number): (at: number) => string {
  return spanMs > 86_400_000
    ? (at) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** One hue per kind, spread around the wheel; the same in every view. */
export function kindHue(kind: ChipKind): number {
  const index = Math.max(0, CHIP_KINDS.indexOf(kind));
  return Math.round((index * 360) / CHIP_KINDS.length);
}

export function TagsView({ boxId, source }: { boxId: string | null; source?: { lines: Line[]; boxes: Box[] } }) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const lines = source ? source.lines : snapshot.lines;
  const boxes = source ? source.boxes : snapshot.boxes;
  const [view, setView] = useState<View>('graph');
  const [sort, setSort] = useState<TagSort>('count');
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<ChipKind | 'all'>('all');
  const [stage, setStage] = useState<string>(boxId ?? 'all');
  const [graph, setGraph] = useState<GraphOptions>(() => {
    const saved = readJson<Partial<GraphOptions>>(GRAPH_KEY, {});
    return { ...DEFAULT_GRAPH, ...(saved && typeof saved === 'object' ? saved : {}) };
  });
  const [hover, setHover] = useState<string | null>(null);
  const setGraphOption = <K extends keyof GraphOptions>(key: K, value: GraphOptions[K]) => {
    const next = { ...graph, [key]: value };
    setGraph(next);
    writeJson(GRAPH_KEY, next);
  };

  const kindLabel = (candidate: ChipKind) => t(`chipKind.${candidate}`);
  const all = useMemo(() => tagRows(lines, null), [lines]);
  const facets = useMemo(() => tagFacets(all), [all]);
  const stageName = useMemo(() => new Map(boxes.map((box) => [box.id, box.name] as const)), [boxes]);
  const rows = useMemo(() => sortTags(filterTags(all, { text: filter, kind, stage }, kindLabel), sort), [all, filter, kind, stage, sort, t]);
  const links = useMemo(() => tagLinks(rows), [rows]);
  // A few hundred tags need more room and fewer labels by default; the person's own choice always wins.
  const dense = rows.length > 80;
  const graphW = dense ? 1400 : GRAPH_W;
  const graphH = dense ? 900 : GRAPH_H;
  const effective = useMemo<GraphOptions>(() => ({ ...graph, labels: graph.labels === 'all' && dense && !readJson<Partial<GraphOptions>>(GRAPH_KEY, {})?.labels ? 'top' : graph.labels }), [graph, dense]);
  const laid = useMemo(() => layoutGraph(rows, links, effective, graphW, graphH), [rows, links, effective, graphW, graphH]);
  const neighbours = useMemo(() => {
    if (!hover) return new Set<string>();
    const set = new Set<string>([hover]);
    for (const link of laid.links) {
      if (link.a === hover) set.add(link.b);
      if (link.b === hover) set.add(link.a);
    }
    return set;
  }, [hover, laid.links]);

  const first = rows.length ? Math.min(...rows.map((row) => row.first_at)) : 0;
  const last = rows.length ? Math.max(...rows.map((row) => row.last_at)) : 1;
  const span = Math.max(1, last - first);
  const when = whenFor(all.length ? Math.max(...all.map((row) => row.last_at)) - Math.min(...all.map((row) => row.first_at)) : 0);
  const maxWeight = Math.max(1, ...laid.links.map((link) => link.weight));

  const pick = (row: TagRow) => setFilter((current) => (current.trim().toLowerCase() === row.text.toLowerCase() ? '' : row.text));
  const tagPill = (row: TagRow) => (
    <button type="button" className="tag-pill" data-kind={row.kind} style={{ ['--tag-hue' as string]: kindHue(row.kind) }} onClick={() => pick(row)} title={`${kindLabel(row.kind)} · ${t('tags.uses', { count: String(row.count) })}`}>
      <span className="tag-pill-icon" aria-hidden="true">
        {chipIcon({ kind: row.kind, value: row.value ?? undefined })}
      </span>
      {row.text}
    </button>
  );
  const stagesLabel = (row: TagRow) => row.stages.map((id) => stageName.get(id) ?? t('actions.stage.removed')).join(', ');
  const selectClass = 'actions-sort';

  return (
    <section className="actions tags" aria-label={t('tags.title')} data-testid="tags-view">
      <header className="actions-head">
        <h1>{t('tags.title')}</h1>
        <div className="actions-views" role="tablist">
          {VIEWS.map((candidate) => (
            <Button key={candidate} variant="ghost" role="tab" aria-selected={view === candidate} aria-pressed={view === candidate} onClick={() => setView(candidate)} data-testid={`tags-view-${candidate}`}>
              {t(`tags.view.${candidate}`)}
            </Button>
          ))}
        </div>
        <div className="actions-controls">
          <input className="actions-filter" type="search" placeholder={t('tags.filter')} aria-label={t('tags.filter')} value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="tags-filter" />
          <select className={selectClass} aria-label={t('tags.col.kind')} value={kind} onChange={(event) => setKind(event.target.value as ChipKind | 'all')} data-testid="tags-kind">
            <option value="all">{t('tags.filter.allKinds')}</option>
            {facets.kinds.map((candidate) => (
              <option key={candidate} value={candidate}>
                {kindLabel(candidate)}
              </option>
            ))}
          </select>
          <select className={selectClass} aria-label={t('actions.col.stage')} value={stage} onChange={(event) => setStage(event.target.value)} data-testid="tags-stage">
            <option value="all">{t('actions.filter.allStages')}</option>
            {[...new Set([...(boxId ? [boxId] : []), ...facets.stages])].map((id) => (
              <option key={id} value={id}>
                {stageName.get(id) ?? t('actions.stage.removed')}
              </option>
            ))}
          </select>
          <select className={selectClass} aria-label={t('tags.sort')} value={sort} onChange={(event) => setSort(event.target.value as TagSort)} data-testid="tags-sort">
            {(['count', 'newest', 'oldest', 'alpha', 'kind'] as TagSort[]).map((candidate) => (
              <option key={candidate} value={candidate}>
                {t(`tags.sort.${candidate}`)}
              </option>
            ))}
          </select>
        </div>
        {view === 'graph' ? (
          <div className="actions-controls tags-graph-options" data-testid="tags-graph-options">
            <select className={selectClass} aria-label={t('tags.graph.layout')} value={graph.layout} onChange={(event) => setGraphOption('layout', event.target.value as GraphOptions['layout'])} data-testid="tags-graph-layout">
              <option value="links">{t('tags.graph.layout.links')}</option>
              <option value="kind">{t('tags.graph.layout.kind')}</option>
            </select>
            <select className={selectClass} aria-label={t('tags.graph.size')} value={graph.size} onChange={(event) => setGraphOption('size', event.target.value as GraphOptions['size'])} data-testid="tags-graph-size">
              <option value="count">{t('tags.graph.size.count')}</option>
              <option value="equal">{t('tags.graph.size.equal')}</option>
            </select>
            <select className={selectClass} aria-label={t('tags.graph.links')} value={String(graph.minWeight)} onChange={(event) => setGraphOption('minWeight', Number(event.target.value))} data-testid="tags-graph-links">
              <option value="1">{t('tags.graph.links.all')}</option>
              <option value="2">{t('tags.graph.links.twice')}</option>
              <option value="3">{t('tags.graph.links.often')}</option>
            </select>
            <select className={selectClass} aria-label={t('tags.graph.labels')} value={effective.labels} onChange={(event) => setGraphOption('labels', event.target.value as GraphOptions['labels'])} data-testid="tags-graph-labels">
              <option value="all">{t('tags.graph.labels.all')}</option>
              <option value="top">{t('tags.graph.labels.top')}</option>
              <option value="none">{t('tags.graph.labels.none')}</option>
            </select>
          </div>
        ) : null}
      </header>

      {all.length === 0 ? <p className="actions-empty">{t('tags.empty')}</p> : rows.length === 0 ? <p className="actions-empty">{t('actions.noMatch')}</p> : null}

      {view === 'graph' && rows.length > 0 ? (
        <figure className="tags-graph" data-testid="tags-graph">
          <svg viewBox={`0 0 ${graphW} ${graphH}`} data-dense={dense ? 'true' : undefined} data-many={laid.links.length > 200 ? 'true' : undefined} role="img" aria-label={t('tags.graph.alt', { tags: String(rows.length), links: String(laid.links.length) })} onClick={(event) => {
            if (event.target === event.currentTarget) setFilter('');
          }}>
            <g className="tag-links">
              {laid.links.map((link) => (
                <line
                  key={`${link.a}|${link.b}`}
                  x1={link.x1}
                  y1={link.y1}
                  x2={link.x2}
                  y2={link.y2}
                  strokeWidth={0.75 + (link.weight / maxWeight) * 3}
                  className="tag-link"
                  data-dim={hover !== null && link.a !== hover && link.b !== hover ? 'true' : undefined}
                  data-weight={link.weight}
                />
              ))}
            </g>
            <g className="tag-nodes">
              {laid.nodes.map((node) => (
                <g
                  key={node.id}
                  className="tag-node"
                  data-kind={node.row.kind}
                  data-dim={hover !== null && !neighbours.has(node.id) ? 'true' : undefined}
                  style={{ ['--tag-hue' as string]: kindHue(node.row.kind) }}
                  transform={`translate(${node.x} ${node.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.row.text} · ${kindLabel(node.row.kind)} · ${t('tags.uses', { count: String(node.row.count) })}`}
                  onMouseEnter={() => setHover(node.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(node.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => pick(node.row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      pick(node.row);
                    }
                  }}
                  data-testid="tag-node"
                >
                  <circle r={node.r} />
                  <text className="tag-node-icon" textAnchor="middle" dominantBaseline="central" fontSize={Math.max(9, node.r * 0.95)} aria-hidden="true">
                    {chipIcon({ kind: node.row.kind, value: node.row.value ?? undefined })}
                  </text>
                  {node.labelled ? (
                    <text className="tag-node-label" y={node.r + 13} textAnchor="middle" fontSize={12}>
                      {node.row.text}
                      {node.row.count > 1 ? <tspan className="tag-node-count"> ×{node.row.count}</tspan> : null}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          </svg>
          <figcaption>
            <span>{t('tags.graph.legend')}</span>
            {facets.kinds.filter((candidate) => rows.some((row) => row.kind === candidate)).map((candidate) => (
              <button key={candidate} type="button" className="tag-legend" style={{ ['--tag-hue' as string]: kindHue(candidate) }} aria-pressed={kind === candidate} onClick={() => setKind(kind === candidate ? 'all' : candidate)}>
                <i aria-hidden="true" /> {kindLabel(candidate)}
              </button>
            ))}
          </figcaption>
        </figure>
      ) : null}

      {view === 'table' && rows.length > 0 ? (
        <div className="act-table-wrap">
          <table className="act-table tags-table">
            <thead>
              <tr>
                <th>{t('tags.col.tag')}</th>
                <th>{t('tags.col.kind')}</th>
                <th>{t('tags.col.value')}</th>
                <th className="act-cost">{t('tags.col.count')}</th>
                <th>{t('tags.col.first')}</th>
                <th>{t('tags.col.last')}</th>
                <th>{t('actions.col.stage')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{tagPill(row)}</td>
                  <td>{kindLabel(row.kind)}</td>
                  <td className="tag-value">{row.value && row.value.toLowerCase() !== row.text.toLowerCase() ? row.value : row.in_list ? t('tags.inList') : ''}</td>
                  <td className="act-cost">{row.count}</td>
                  <td>{when(row.first_at)}</td>
                  <td>{when(row.last_at)}</td>
                  <td>{stagesLabel(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === 'list' && rows.length > 0 ? (
        <ol className="act-list tags-list">
          {rows.map((row) => (
            <li key={row.id} className="act-row">
              <time className="act-when">{when(row.last_at)}</time>
              {tagPill(row)}
              <span className="act-text tag-kind">{kindLabel(row.kind)}</span>
              <span className="act-status">{t('tags.uses', { count: String(row.count) })}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {view === 'board' && rows.length > 0 ? (
        <div className="act-board">
          {facets.kinds
            .filter((candidate) => rows.some((row) => row.kind === candidate))
            .map((candidate) => (
              <section key={candidate} className="act-column tag-column" style={{ ['--tag-hue' as string]: kindHue(candidate) }}>
                <h2>
                  {kindLabel(candidate)} <small>{rows.filter((row) => row.kind === candidate).length}</small>
                </h2>
                {rows
                  .filter((row) => row.kind === candidate)
                  .map((row) => (
                    <div key={row.id} className="act-card">
                      {tagPill(row)}
                      <small className="act-meta">
                        {t('tags.uses', { count: String(row.count) })} · {when(row.last_at)}
                      </small>
                    </div>
                  ))}
              </section>
            ))}
        </div>
      ) : null}

      {view === 'timeline' && rows.length > 0 ? (
        <div className="act-timeline tags-timeline" data-testid="tags-timeline">
          {[...rows]
            .sort((a, b) => a.first_at - b.first_at)
            .map((row) => {
              const left = ((row.first_at - first) / span) * 100;
              const width = Math.max(1.2, ((row.last_at - row.first_at) / span) * 100);
              return (
                <div key={row.id} className="act-tl-row" style={{ ['--tag-hue' as string]: kindHue(row.kind) }}>
                  <div className="act-tl-label">{tagPill(row)}</div>
                  <div className="act-tl-track">
                    <span className="act-tl-bar tag-tl-bar" style={{ left: `${Math.min(left, 100 - width)}%`, width: `${width}%` }} title={`${when(row.first_at)} → ${when(row.last_at)}`} />
                    {row.uses.map((use) => (
                      <i key={use.line_id} className="tag-tl-dot" style={{ left: `${((use.at - first) / span) * 100}%` }} title={when(use.at)} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}
    </section>
  );
}
