import { useMemo, useRef, useState } from 'react';
import { formatMicro } from '@shared/ledger';
import { useI18n } from '../i18n';
import { useStoreSnapshot } from '../store';
import type { Line } from '../store';
import { Button } from '../ui/Button';

/**
 * Actions: the person's own activity on this stage, not our project plan
 * (Justin, C-090). Every line sent, every reply and every edit is one row,
 * with a status. Four views over the same rows: list, table, board (by
 * status) and a timeline in the order things happened, with the follows
 * relation (an edit follows the line that asked for it). Filter and sort
 * stay one field each. Very simple on purpose; it gets smarter as we go.
 */
export type ActionKind = 'line' | 'reply' | 'edit' | 'system';
export type ActionStatus = 'sent' | 'answered' | 'failed' | 'applied' | 'undone' | 'noted';

export interface ActionRow {
  id: string;
  at: number;
  kind: ActionKind;
  status: ActionStatus;
  text: string;
  cost_micro: number;
  /** The row this one follows (dependency): an edit follows its prompt, a reply follows its line. */
  follows: string | null;
}

interface ReplyMetaLite {
  meta?: { cost_micro?: number } | null;
  blocks?: Array<{ kind: string }>;
}

function parseMeta(json: string): ReplyMetaLite | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ReplyMetaLite;
  } catch {
    return null;
  }
}

export function actionRows(
  lines: Line[],
  edits: Array<{ id: string; box_id: string; summary: string; state: 'applied' | 'undone'; created_at: number }>,
  boxId: string | null,
): ActionRow[] {
  const rows: ActionRow[] = [];
  let lastUser: string | null = null;
  const ownLines = lines.filter((line) => boxId === null || line.box_id === boxId).sort((a, b) => a.created_at - b.created_at);
  for (const line of ownLines) {
    const reply = parseMeta(line.blocks_json);
    if (line.kind === 'user') {
      lastUser = line.id;
      rows.push({ id: line.id, at: line.created_at, kind: 'line', status: 'sent', text: line.text, cost_micro: 0, follows: null });
    } else if (line.kind === 'assistant') {
      const failed = (reply?.blocks ?? []).some((block) => block.kind === 'error');
      rows.push({ id: line.id, at: line.created_at, kind: 'reply', status: failed ? 'failed' : 'answered', text: line.text || '…', cost_micro: reply?.meta?.cost_micro ?? 0, follows: lastUser });
    } else {
      rows.push({ id: line.id, at: line.created_at, kind: 'system', status: 'noted', text: line.text, cost_micro: 0, follows: lastUser });
    }
  }
  for (const batch of edits.filter((candidate) => boxId === null || candidate.box_id === boxId)) {
    // An edit follows the newest line sent before it.
    const before = ownLines.filter((line) => line.kind === 'user' && line.created_at <= batch.created_at).pop();
    rows.push({ id: batch.id, at: batch.created_at, kind: 'edit', status: batch.state, text: batch.summary.replace(/^Edited: /, ''), cost_micro: 0, follows: before?.id ?? null });
  }
  return rows.sort((a, b) => a.at - b.at);
}

type View = 'list' | 'table' | 'board' | 'timeline';
type Sort = 'newest' | 'oldest' | 'status';
const STATUS_ORDER: ActionStatus[] = ['sent', 'answered', 'applied', 'undone', 'failed', 'noted'];

function when(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ActionsView({ boxId }: { boxId: string | null }) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const [view, setView] = useState<View>('list');
  const [sort, setSort] = useState<Sort>('newest');
  const [filter, setFilter] = useState('');
  const [labelWidth, setLabelWidth] = useState(320);
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  const rows = useMemo(() => {
    const all = actionRows(snapshot.lines, snapshot.edits, boxId);
    const needle = filter.trim().toLowerCase();
    const kept = needle
      ? all.filter((row) => row.text.toLowerCase().includes(needle) || t(`actions.kind.${row.kind}`).includes(needle) || t(`actions.status.${row.status}`).includes(needle))
      : all;
    if (sort === 'status') return [...kept].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.at - a.at);
    return sort === 'newest' ? [...kept].reverse() : kept;
  }, [snapshot.lines, snapshot.edits, boxId, filter, sort, t]);

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const first = rows.length ? Math.min(...rows.map((row) => row.at)) : 0;
  const last = rows.length ? Math.max(...rows.map((row) => row.at)) : 1;
  const span = Math.max(1, last - first);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = { startX: event.clientX, startWidth: labelWidth };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      if (!dragging.current) return;
      setLabelWidth(Math.min(520, Math.max(120, dragging.current.startWidth + pointer.clientX - dragging.current.startX)));
    };
    const up = () => {
      dragging.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const rowLabel = (row: ActionRow) => (
    <>
      <span className="act-kind" data-kind={row.kind}>
        {t(`actions.kind.${row.kind}`)}
      </span>
      <span className="act-text">{row.text}</span>
    </>
  );

  return (
    <section className="actions" aria-label={t('actions.title')} data-testid="actions-view">
      <header className="actions-head">
        <h1>{t('actions.title')}</h1>
        <div className="actions-views" role="tablist">
          {(['list', 'table', 'board', 'timeline'] as View[]).map((candidate) => (
            <Button key={candidate} variant="ghost" role="tab" aria-selected={view === candidate} aria-pressed={view === candidate} onClick={() => setView(candidate)} data-testid={`actions-view-${candidate}`}>
              {t(`actions.view.${candidate}`)}
            </Button>
          ))}
        </div>
        <input className="actions-filter" type="search" placeholder={t('actions.filter')} aria-label={t('actions.filter')} value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="actions-filter" />
        <select className="actions-sort" aria-label={t('actions.sort')} value={sort} onChange={(event) => setSort(event.target.value as Sort)} data-testid="actions-sort">
          <option value="newest">{t('actions.sort.newest')}</option>
          <option value="oldest">{t('actions.sort.oldest')}</option>
          <option value="status">{t('actions.sort.status')}</option>
        </select>
      </header>

      {rows.length === 0 ? <p className="actions-empty">{t('actions.empty')}</p> : null}

      {view === 'list' && rows.length > 0 ? (
        <ol className="act-list">
          {rows.map((row) => (
            <li key={row.id} className="act-row" data-status={row.status}>
              <time className="act-when">{when(row.at)}</time>
              {rowLabel(row)}
              <span className="act-status" data-status={row.status}>
                {t(`actions.status.${row.status}`)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {view === 'table' && rows.length > 0 ? (
        <div className="act-table-wrap">
          <table className="act-table">
            <thead>
              <tr>
                <th>{t('actions.col.when')}</th>
                <th>{t('actions.col.kind')}</th>
                <th>{t('actions.col.what')}</th>
                <th>{t('actions.col.status')}</th>
                <th>{t('actions.col.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-status={row.status}>
                  <td>{when(row.at)}</td>
                  <td>{t(`actions.kind.${row.kind}`)}</td>
                  <td>{row.text}</td>
                  <td>{t(`actions.status.${row.status}`)}</td>
                  <td>{row.cost_micro ? formatMicro(row.cost_micro, 4) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === 'board' && rows.length > 0 ? (
        <div className="act-board">
          {STATUS_ORDER.filter((status) => rows.some((row) => row.status === status)).map((status) => (
            <section key={status} className="act-column" data-status={status}>
              <h2>
                {t(`actions.status.${status}`)} <small>{rows.filter((row) => row.status === status).length}</small>
              </h2>
              {rows
                .filter((row) => row.status === status)
                .map((row) => (
                  <div key={row.id} className="act-card">
                    <time className="act-when">{when(row.at)}</time>
                    {rowLabel(row)}
                  </div>
                ))}
            </section>
          ))}
        </div>
      ) : null}

      {view === 'timeline' && rows.length > 0 ? (
        <div className="act-timeline" style={{ ['--label-w' as string]: `${labelWidth}px` }}>
          {[...rows]
            .sort((a, b) => a.at - b.at)
            .map((row, index, ordered) => {
              const left = ((row.at - first) / span) * 100;
              const next = ordered[index + 1];
              const width = Math.max(1.2, (((next?.at ?? last) - row.at) / span) * 100);
              const parent = row.follows ? byId.get(row.follows) : undefined;
              return (
                <div key={row.id} className="act-tl-row" data-status={row.status}>
                  <div className="act-tl-label" title={row.text}>
                    <span className="act-tl-n">{index + 1}</span>
                    {rowLabel(row)}
                    {parent ? (
                      <small className="act-follows">
                        {t('actions.dependsOn')} #{ordered.indexOf(parent) + 1}
                      </small>
                    ) : null}
                  </div>
                  <div className="act-tl-track">
                    <span className="act-tl-bar" style={{ left: `${left}%`, width: `${width}%` }} title={`${when(row.at)} · ${t(`actions.status.${row.status}`)}`} />
                  </div>
                </div>
              );
            })}
          <div className="act-tl-resize" role="separator" aria-orientation="vertical" aria-label={t('actions.resize')} title={t('actions.resize')} onPointerDown={startResize} data-testid="actions-resize" />
        </div>
      ) : null}
    </section>
  );
}
