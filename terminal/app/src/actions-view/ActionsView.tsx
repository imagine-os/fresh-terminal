import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMicro } from '@shared/ledger';
import { useI18n } from '../i18n';
import { readJson, writeJson } from '../lib/storage';
import { useStoreSnapshot } from '../store';
import { Button } from '../ui/Button';
import { NO_MODEL, STATUS_ORDER, actionRows, filterRows, rowFacets, sortRows, type ActionRow, type ActionStatus, type Sort } from './rows';

export { actionRows, filterRows, sortRows } from './rows';
export type { ActionKind, ActionRow, ActionStatus } from './rows';

/**
 * Actions: the person's own activity, not our project plan (Justin, C-090).
 * Every line sent, every reply and every edit is one row, with a status.
 * Four views over the same rows: list, table, board (by status) and a
 * timeline in the order things happened, with the follows relation drawn as
 * arrows (an edit follows the line that asked for it). One row of controls:
 * search, status, stage, model and sort (C-095). Model and cost come from the
 * ledger. Very simple on purpose; it gets smarter as we go.
 */
type View = 'list' | 'table' | 'board' | 'timeline';

const LABEL_WIDTH_KEY = 'fresh-terminal.actions.labelWidth';
const LABEL_MIN = 120;
const LABEL_MAX = 720;

/** "openai/gpt-5-mini" reads as "gpt-5-mini"; the full id is in the title. */
function shortModel(model: string): string {
  return model.split('/').pop() || model;
}

function when(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ActionsView({ boxId }: { boxId: string | null }) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const [view, setView] = useState<View>('list');
  const [sort, setSort] = useState<Sort>('newest');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<ActionStatus | 'all'>('all');
  // Starts on the stage you came from; "All stages" shows everything you did.
  const [stage, setStage] = useState<string>(boxId ?? 'all');
  const [model, setModel] = useState<string>('all');
  const [labelWidth, setLabelWidth] = useState(() => {
    const saved = readJson<number>(LABEL_WIDTH_KEY, 320);
    return typeof saved === 'number' && Number.isFinite(saved) ? Math.min(LABEL_MAX, Math.max(LABEL_MIN, saved)) : 320;
  });
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  const all = useMemo(() => actionRows(snapshot.lines, snapshot.edits, null, snapshot.entries), [snapshot.lines, snapshot.edits, snapshot.entries]);
  const facets = useMemo(() => rowFacets(all), [all]);
  const stageName = useMemo(() => new Map(snapshot.boxes.map((box) => [box.id, box.name] as const)), [snapshot.boxes]);
  const rows = useMemo(
    () => sortRows(filterRows(all, { text: filter, status, stage, model }, (row) => `${t(`actions.kind.${row.kind}`)} ${t(`actions.status.${row.status}`)}`), sort),
    [all, filter, status, stage, model, sort, t],
  );

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const first = rows.length ? Math.min(...rows.map((row) => row.at)) : 0;
  const last = rows.length ? Math.max(...rows.map((row) => row.at)) : 1;
  const span = Math.max(1, last - first);

  const saveWidth = (width: number) => writeJson(LABEL_WIDTH_KEY, width);
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = { startX: event.clientX, startWidth: labelWidth };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let latest = labelWidth;
    const move = (pointer: PointerEvent) => {
      if (!dragging.current) return;
      latest = Math.min(LABEL_MAX, Math.max(LABEL_MIN, dragging.current.startWidth + pointer.clientX - dragging.current.startX));
      setLabelWidth(latest);
    };
    const up = () => {
      dragging.current = null;
      saveWidth(latest);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const keyResize = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    const next =
      event.key === 'ArrowLeft' ? labelWidth - step : event.key === 'ArrowRight' ? labelWidth + step : event.key === 'Home' ? LABEL_MIN : event.key === 'End' ? LABEL_MAX : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.min(LABEL_MAX, Math.max(LABEL_MIN, next));
    setLabelWidth(clamped);
    saveWidth(clamped);
  };

  const rowLabel = (row: ActionRow) => (
    <>
      <span className="act-kind" data-kind={row.kind}>
        {t(`actions.kind.${row.kind}`)}
      </span>
      <span className="act-text">{row.text}</span>
    </>
  );
  const modelLabel = (row: ActionRow) => (row.models.length > 0 ? row.models.map(shortModel).join(', ') : t('actions.model.none'));
  const costLabel = (row: ActionRow) => (row.cost_known ? formatMicro(row.cost_micro, 4) : '');

  // Timeline: chronological rows, bars by time, and an arrow from each row to the one it follows.
  const timeline = useMemo(() => [...rows].sort((a, b) => a.at - b.at), [rows]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Array<{ id: string; d: string }>>([]);
  useLayoutEffect(() => {
    const host = timelineRef.current;
    if (view !== 'timeline' || host === null) {
      setArrows([]);
      return;
    }
    const measure = () => {
      const box = host.getBoundingClientRect();
      const bars = new Map<string, { x0: number; x1: number; y: number; top: number }>();
      for (const bar of Array.from(host.querySelectorAll<HTMLElement>('.act-tl-bar[data-row]'))) {
        const rect = bar.getBoundingClientRect();
        bars.set(bar.dataset.row ?? '', { x0: rect.left - box.left, x1: rect.right - box.left, y: rect.top - box.top + rect.height / 2, top: rect.top - box.top });
      }
      const next: Array<{ id: string; d: string }> = [];
      for (const row of timeline) {
        const from = row.follows ? bars.get(row.follows) : undefined;
        const to = bars.get(row.id);
        if (!from || !to) continue;
        const x = Math.max(to.x0 + 2, 0);
        next.push({ id: row.id, d: `M ${from.x1.toFixed(1)} ${from.y.toFixed(1)} H ${x.toFixed(1)} V ${(to.top - 2).toFixed(1)}` });
      }
      setArrows(next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(host);
    return () => observer?.disconnect();
  }, [view, timeline, labelWidth]);

  const selectClass = 'actions-sort';
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
        {/* One row of controls: on a phone it scrolls sideways instead of stacking (C-095). */}
        <div className="actions-controls">
        <input className="actions-filter" type="search" placeholder={t('actions.filter')} aria-label={t('actions.filter')} value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="actions-filter" />
        <select className={selectClass} aria-label={t('actions.col.status')} value={status} onChange={(event) => setStatus(event.target.value as ActionStatus | 'all')} data-testid="actions-status">
          <option value="all">{t('actions.filter.allStatuses')}</option>
          {STATUS_ORDER.map((candidate) => (
            <option key={candidate} value={candidate}>
              {t(`actions.status.${candidate}`)}
            </option>
          ))}
        </select>
        <select className={selectClass} aria-label={t('actions.col.stage')} value={stage} onChange={(event) => setStage(event.target.value)} data-testid="actions-stage">
          <option value="all">{t('actions.filter.allStages')}</option>
          {[...new Set([...(boxId ? [boxId] : []), ...facets.stages])].map((id) => (
            <option key={id} value={id}>
              {stageName.get(id) ?? t('actions.stage.removed')}
            </option>
          ))}
        </select>
        <select className={selectClass} aria-label={t('actions.col.model')} value={model} onChange={(event) => setModel(event.target.value)} data-testid="actions-model">
          <option value="all">{t('actions.filter.allModels')}</option>
          {facets.models.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate === NO_MODEL ? t('actions.model.none') : shortModel(candidate)}
            </option>
          ))}
        </select>
        <select className={selectClass} aria-label={t('actions.sort')} value={sort} onChange={(event) => setSort(event.target.value as Sort)} data-testid="actions-sort">
          <option value="newest">{t('actions.sort.newest')}</option>
          <option value="oldest">{t('actions.sort.oldest')}</option>
          <option value="status">{t('actions.sort.status')}</option>
          <option value="cost">{t('actions.sort.cost')}</option>
        </select>
        </div>
      </header>

      {all.length === 0 ? <p className="actions-empty">{t('actions.empty')}</p> : rows.length === 0 ? <p className="actions-empty">{t('actions.noMatch')}</p> : null}

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
                <th>{t('actions.col.stage')}</th>
                <th>{t('actions.col.status')}</th>
                <th>{t('actions.col.model')}</th>
                <th>{t('actions.col.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-status={row.status}>
                  <td>{when(row.at)}</td>
                  <td>{t(`actions.kind.${row.kind}`)}</td>
                  <td>{row.text}</td>
                  <td>{stageName.get(row.box_id) ?? t('actions.stage.removed')}</td>
                  <td>{t(`actions.status.${row.status}`)}</td>
                  <td title={row.models.join(', ')}>{modelLabel(row)}</td>
                  <td className="act-cost">{costLabel(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === 'board' && rows.length > 0 ? (
        <div className="act-board">
          {STATUS_ORDER.filter((candidate) => rows.some((row) => row.status === candidate)).map((candidate) => (
            <section key={candidate} className="act-column" data-status={candidate}>
              <h2>
                {t(`actions.status.${candidate}`)} <small>{rows.filter((row) => row.status === candidate).length}</small>
              </h2>
              {rows
                .filter((row) => row.status === candidate)
                .map((row) => (
                  <div key={row.id} className="act-card">
                    <time className="act-when">{when(row.at)}</time>
                    {rowLabel(row)}
                    {row.cost_known ? (
                      <small className="act-meta" title={row.models.join(', ')}>
                        {modelLabel(row)} · {costLabel(row)}
                      </small>
                    ) : null}
                  </div>
                ))}
            </section>
          ))}
        </div>
      ) : null}

      {view === 'timeline' && rows.length > 0 ? (
        <div ref={timelineRef} className="act-timeline" style={{ ['--label-w' as string]: `${labelWidth}px` }} data-testid="actions-timeline">
          {timeline.map((row, index, ordered) => {
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
                  <span className="act-tl-bar" data-row={row.id} style={{ left: `${left}%`, width: `${width}%` }} title={`${when(row.at)} · ${t(`actions.status.${row.status}`)}`} />
                </div>
              </div>
            );
          })}
          <svg className="act-tl-arrows" aria-hidden="true" data-testid="actions-arrows">
            <defs>
              <marker id="act-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 8 4 L 0 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </marker>
            </defs>
            {arrows.map((arrow) => (
              <path key={arrow.id} d={arrow.d} fill="none" stroke="currentColor" strokeWidth="1.25" markerEnd="url(#act-arrow)" data-arrow={arrow.id} />
            ))}
          </svg>
          <div
            className="act-tl-resize"
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-valuemin={LABEL_MIN}
            aria-valuemax={LABEL_MAX}
            aria-valuenow={labelWidth}
            aria-label={t('actions.resize')}
            title={t('actions.resize')}
            onPointerDown={startResize}
            onKeyDown={keyResize}
            data-testid="actions-resize"
          />
        </div>
      ) : null}
    </section>
  );
}
