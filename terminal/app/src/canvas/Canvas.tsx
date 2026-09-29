import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CARD_H, CARD_W, SEED_CARDS, bestLayout, fitView, layoutCanvas, sectionOf, type Card, type Layout, type Rect, type SectionId } from '@shared/canvas';
import { findTheme } from '@shared/themes';
import { useI18n } from '../i18n';
import { usePrefs } from '../prefs';
import { store, useStoreSnapshot } from '../store';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { CanvasV1 } from './CanvasV1';
import { resolveHref } from './href';

export { resolveHref } from './href';

interface View {
  x: number;
  y: number;
  zoom: number;
}
interface Props {
  onOpenRoute: (path: string) => void;
  onOpenBox: (id: string) => void;
}

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 4;
const PAN_STEP = 80;
const OFFSETS_KEY = 'fresh-terminal.canvas2.offsets';
type Look = 'paper' | 'sketch' | 'drafting';
type Offsets = Record<string, [number, number]>;

function readOffsets(): Offsets {
  try {
    const raw = localStorage.getItem(OFFSETS_KEY);
    return raw ? (JSON.parse(raw) as Offsets) : {};
  } catch {
    return {};
  }
}
function writeOffsets(offsets: Offsets): void {
  try {
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(offsets));
  } catch {
    // private mode: moves last for this visit only
  }
}
const SEED_BY_ID = new Map(SEED_CARDS.map((card) => [card.id, card]));
const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

/** Deterministic wobble so sketch frames look hand drawn but never jump between renders. */
function roughRect(w: number, h: number, seed: number): string {
  let s = seed * 9301 + 49297;
  const r = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  const j = 3.5;
  const pts: [number, number][] = [
    [r() * j, r() * j],
    [w + r() * j, r() * j],
    [w + r() * j, h + r() * j],
    [r() * j, h + r() * j],
  ];
  const seg = (a: [number, number], b: [number, number]) => {
    const mx = (a[0] + b[0]) / 2 + r() * j * 2;
    const my = (a[1] + b[1]) / 2 + r() * j * 2;
    return `Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  };
  const p = pts as [[number, number], [number, number], [number, number], [number, number]];
  const one = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)} ${seg(p[0], p[1])} ${seg(p[1], p[2])} ${seg(p[2], p[3])} ${seg(p[3], p[0])}`;
  const two = `M ${(p[0][0] + 2).toFixed(1)} ${(p[0][1] - 1).toFixed(1)} ${seg(p[0], p[1])} ${seg(p[1], p[2])} ${seg(p[2], p[3])} ${seg(p[3], p[0])}`;
  return `${one} ${two}`;
}

/** The current canvas (v2). `?v=1` shows the archived first version. */
export function Canvas(props: Props) {
  const archived = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('v') === '1';
  return archived ? <CanvasV1 {...props} /> : <CanvasV2 {...props} />;
}

function CanvasV2({ onOpenRoute, onOpenBox }: Props) {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const scheme = findTheme(prefs.themeId).scheme;
  const snapshot = useStoreSnapshot();
  // cards saved by older visits lack the v2 fields (section, thumb, archived); take those from the seed by id
  const cards = useMemo(
    () =>
      snapshot.cards.map((card) => {
        const seed = SEED_BY_ID.get(card.id);
        return seed ? { ...card, title: seed.title, href: seed.href, section: card.section ?? seed.section, thumb: card.thumb ?? seed.thumb, archived: card.archived ?? seed.archived } : card;
      }),
    [snapshot.cards],
  );
  const look: Look = useMemo(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('look') : null;
    return q === 'paper' || q === 'drafting' ? q : 'sketch';
  }, []);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 0.5 });
  const [selected, setSelected] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Offsets>(readOffsets);
  const [miniOpen, setMiniOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 700));
  const fitted = useRef(false);

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (el === null) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = size.w < 600;
  const layout: Layout = useMemo(() => (narrow ? layoutCanvas(cards, 1, 1) : bestLayout(cards, size.w, size.h)), [cards, narrow, size.w, size.h]);

  const rectOf = useCallback(
    (id: string): Rect | null => {
      const slot = layout.slots[id];
      if (!slot) return null;
      const off = offsets[id];
      return { x: slot.x + (off?.[0] ?? 0), y: slot.y + (off?.[1] ?? 0), w: slot.w, h: slot.h };
    },
    [layout, offsets],
  );

  const bounds = useMemo(() => {
    let minX = layout.bounds.x, minY = layout.bounds.y, maxX = layout.bounds.x + layout.bounds.w, maxY = layout.bounds.y + layout.bounds.h;
    for (const card of cards) {
      const r = rectOf(card.id);
      if (!r) continue;
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [cards, layout, rectOf]);

  const fitAll = useCallback(() => {
    const v = fitView(bounds, size.w, size.h, Math.min(56, size.w * 0.05), MIN_ZOOM, 1.8);
    setView(v);
  }, [bounds, size]);
  const fitStart = useCallback(() => {
    if (narrow) {
      // phones: fit the column width and start at the top; pan down to read on
      const zoom = clampZoom((size.w - 24) / Math.max(1, layout.bounds.w));
      setView({ zoom, x: (size.w - layout.bounds.w * zoom) / 2, y: 12 });
    } else {
      fitAll();
    }
  }, [narrow, size.w, layout.bounds.w, fitAll]);

  useEffect(() => {
    if (size.w > 0 && !fitted.current) {
      fitted.current = true;
      fitStart();
    }
  }, [size.w, fitStart]);
  // re-fit when the arrangement changes with the window, as long as the person has not moved the view
  const touched = useRef(false);
  useEffect(() => {
    if (fitted.current && !touched.current) fitStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const zoomAt = useCallback((factor: number, sx?: number, sy?: number) => {
    touched.current = true;
    setView((cur) => {
      const px = sx ?? size.w / 2;
      const py = sy ?? size.h / 2;
      const zoom = clampZoom(cur.zoom * factor);
      const k = zoom / cur.zoom;
      return { zoom, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k };
    });
  }, [size]);
  const panBy = useCallback((dx: number, dy: number) => {
    touched.current = true;
    setView((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
  }, []);
  const zoomTo = useCallback((zoom: number) => zoomAt(zoom / view.zoom), [zoomAt, view.zoom]);

  // wheel: two-finger scroll pans, pinch (ctrl+wheel) zooms at the cursor, like Excalidraw and Figma
  useEffect(() => {
    const el = surfaceRef.current;
    if (el === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top);
      } else {
        const unit = event.deltaMode === 1 ? 16 : 1;
        panBy(-(event.shiftKey ? event.deltaY : event.deltaX) * unit, -(event.shiftKey ? 0 : event.deltaY) * unit);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, panBy]);

  // pointers: drag background to pan, drag a card (mouse/pen) to move it, two fingers to pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean; cardId?: string }
    | { kind: 'card'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
    | { kind: 'pinch'; d: number; mx: number; my: number; view: View }
    | null
  >(null);
  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, .cv-minimap')) return;
    const p = localPoint(event);
    pointers.current.set(event.pointerId, p);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view };
      return;
    }
    const cardId = target.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
    if (cardId && event.pointerType !== 'touch') {
      const off = offsets[cardId] ?? [0, 0];
      gesture.current = { kind: 'card', id: cardId, sx: p.x, sy: p.y, ox: off[0], oy: off[1], moved: false };
    } else {
      gesture.current = { kind: 'pan', sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: false, ...(cardId ? { cardId } : {}) };
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const p = localPoint(event);
    pointers.current.set(event.pointerId, p);
    const g = gesture.current;
    if (g === null) return;
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const zoom = clampZoom((g.view.zoom * d) / Math.max(1, g.d));
      const k = zoom / g.view.zoom;
      touched.current = true;
      setView({ zoom, x: mx - (g.mx - g.view.x) * k, y: my - (g.my - g.view.y) * k });
      return;
    }
    if (g.kind === 'pinch') return;
    const dx = p.x - g.sx, dy = p.y - g.sy;
    if (g.kind === 'pan') {
      if (Math.hypot(dx, dy) > 4) g.moved = true;
      if (g.moved) {
        touched.current = true;
        setView((cur) => ({ ...cur, x: g.vx + dx, y: g.vy + dy }));
      }
    } else if (g.kind === 'card') {
      if (Math.hypot(dx, dy) > 4) g.moved = true;
      if (g.moved) setOffsets((cur) => ({ ...cur, [g.id]: [Math.round(g.ox + dx / view.zoom), Math.round(g.oy + dy / view.zoom)] }));
    }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (g && g.kind === 'card') {
      if (g.moved) setOffsets((cur) => { writeOffsets(cur); return cur; });
      else setSelected(g.id);
    } else if (g && g.kind === 'pan' && !g.moved) {
      setSelected(g.cardId ?? null);
    }
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1 && g?.kind === 'pinch') gesture.current = null;
  };

  const ensureVisible = useCallback((id: string) => {
    const r = rectOf(id);
    if (!r) return;
    setView((cur) => {
      const sx = r.x * cur.zoom + cur.x, sy = r.y * cur.zoom + cur.y, sw = r.w * cur.zoom, sh = r.h * cur.zoom;
      const m = 24;
      let x = cur.x, y = cur.y;
      if (sx < m) x += m - sx; else if (sx + sw > size.w - m) x -= sx + sw - (size.w - m);
      if (sy < m) y += m - sy; else if (sy + sh > size.h - m) y -= sy + sh - (size.h - m);
      return x === cur.x && y === cur.y ? cur : { ...cur, x, y };
    });
  }, [rectOf, size]);

  const onSurfaceKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('input, textarea')) return;
    const onCard = (event.target as HTMLElement).closest<HTMLElement>('[data-card-id]');
    const k = event.key;
    let used = true;
    if (!onCard && k === 'ArrowLeft') panBy(PAN_STEP, 0);
    else if (!onCard && k === 'ArrowRight') panBy(-PAN_STEP, 0);
    else if (!onCard && k === 'ArrowUp') panBy(0, PAN_STEP);
    else if (!onCard && k === 'ArrowDown') panBy(0, -PAN_STEP);
    else if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-' || k === '_') zoomAt(1 / 1.25);
    else if (k === '0') fitAll();
    else if (k === '1') zoomTo(1);
    else if (k === 'Escape') setSelected(null);
    else used = false;
    if (used) event.preventDefault();
  };
  const onCardKey = (event: KeyboardEvent<HTMLElement>, card: Card) => {
    const step = event.shiftKey ? 96 : 24;
    const move = (dx: number, dy: number) => {
      event.preventDefault();
      setOffsets((cur) => {
        const off = cur[card.id] ?? [0, 0];
        const next: Offsets = { ...cur, [card.id]: [off[0] + dx, off[1] + dy] };
        writeOffsets(next);
        return next;
      });
    };
    if (event.altKey && event.key === 'ArrowLeft') move(-step, 0);
    else if (event.altKey && event.key === 'ArrowRight') move(step, 0);
    else if (event.altKey && event.key === 'ArrowUp') move(0, -step);
    else if (event.altKey && event.key === 'ArrowDown') move(0, step);
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (selected === card.id) openCard(card);
      else setSelected(card.id);
    }
  };

  const openCard = (card: Card) => {
    if (card.href.startsWith('route:')) onOpenRoute(card.href.slice(6));
    else if (card.href.startsWith('box:')) {
      const id = card.href.slice(4);
      const box = id === 'first' ? [...snapshot.boxes].sort((a, b) => a.created_at - b.created_at)[0] : snapshot.boxes.find((b) => b.id === id);
      if (box) onOpenBox(box.id);
    } else window.location.assign(resolveHref(card.href));
  };

  const selectedCard = cards.find((c) => c.id === selected) ?? null;
  const sectionLabel = (id: SectionId) => t(`canvas.section.${id}` as 'canvas.section.terminal');
  const style = { '--z': String(view.zoom) } as CSSProperties;
  const dot = 28 * view.zoom;
  const surfaceStyle: CSSProperties = {
    backgroundSize: dot >= 9 ? `${dot}px ${dot}px` : `${dot * 4}px ${dot * 4}px`,
    backgroundPosition: `${view.x}px ${view.y}px`,
  };

  return (
    <div className="cv2" data-look={look} data-scheme={scheme} data-testid="canvas" style={style}>
      <div className="cv2-bar" role="toolbar" aria-label={t('canvas.title')}>
        <Tooltip label={t('canvas.zoomOut')} shortcut="-">
          <Button icon aria-label={t('canvas.zoomOut')} onClick={() => zoomAt(1 / 1.25)}>−</Button>
        </Tooltip>
        <Tooltip label={t('canvas.zoomReset')} shortcut="1">
          <Button className="cv2-zoom" aria-label={`${t('canvas.zoomReset')}: ${Math.round(view.zoom * 100)}%`} onClick={() => zoomTo(1)}>
            {Math.round(view.zoom * 100)}%
          </Button>
        </Tooltip>
        <Tooltip label={t('canvas.zoomIn')} shortcut="+">
          <Button icon aria-label={t('canvas.zoomIn')} onClick={() => zoomAt(1.25)}>+</Button>
        </Tooltip>
        <Tooltip label={t('canvas.fit')} shortcut="0">
          <Button onClick={fitAll}>{t('canvas.fit')}</Button>
        </Tooltip>
        <Button aria-pressed={miniOpen} onClick={() => setMiniOpen((o) => !o)}>{t('canvas.minimap')}</Button>
        <span className="topbar-spacer" />
        {Object.keys(offsets).length > 0 ? (
          <Button variant="ghost" onClick={() => { setOffsets({}); writeOffsets({}); }}>{t('canvas.tidy')}</Button>
        ) : null}
        <Button
          onClick={() => {
            const title = window.prompt(t('canvas.addPrompt'));
            if (title && title.trim()) {
              const card = store.addCard({ title: title.trim(), kind: 'doc', href: 'route:/canvas', section: 'added' });
              setSelected(card.id);
            }
          }}
        >
          {t('canvas.add')}
        </Button>
        <Tooltip label={t('canvas.v1Hint')} align="end">
          <a className="btn" data-variant="ghost" href={resolveHref('canvas?v=1')}>v1</a>
        </Tooltip>
      </div>

      <div className="cv2-body">
        <div
          ref={surfaceRef}
          className="cv2-surface"
          style={surfaceStyle}
          tabIndex={0}
          role="application"
          aria-roledescription="canvas"
          aria-label={t('canvas.surfaceHelp2')}
          data-testid="canvas-surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onSurfaceKey}
        >
          <div className="cv2-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            {layout.frames.map((frame, i) => (
              <section key={frame.id} className="cv2-frame" aria-label={sectionLabel(frame.id)} style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
                {look === 'sketch' ? (
                  <svg className="cv2-rough" width={frame.w} height={frame.h} viewBox={`-4 -4 ${frame.w + 8} ${frame.h + 8}`} aria-hidden="true">
                    <path d={roughRect(frame.w, frame.h, i + 3)} />
                  </svg>
                ) : null}
                <h2 className="cv2-label">
                  {sectionLabel(frame.id)}
                  <span className="cv2-count">{frame.count}</span>
                </h2>
              </section>
            ))}
            {cards.map((card, i) => {
              const r = rectOf(card.id);
              if (!r) return null;
              const tilt = look === 'sketch' ? ((i * 37) % 7) / 6 - 0.5 : 0;
              return (
                <article
                  key={card.id}
                  className="cv2-card"
                  data-card-id={card.id}
                  data-kind={card.kind}
                  data-selected={card.id === selected}
                  data-archived={card.archived ? 'true' : undefined}
                  tabIndex={0}
                  aria-label={`${card.title}, ${sectionLabel(sectionOf(card))}${card.archived ? `, ${t('canvas.archivedTag')}` : ''}`}
                  style={{ left: r.x, top: r.y, width: CARD_W, height: CARD_H, transform: tilt ? `rotate(${tilt}deg)` : undefined, ['--t' as string]: String(card.thickness_mm) }}
                  onKeyDown={(event) => onCardKey(event, card)}
                  onFocus={() => ensureVisible(card.id)}
                  onDoubleClick={() => openCard(card)}
                >
                  <div className="cv2-print">
                    {card.thumb ? (
                      <img src={resolveHref(card.thumb)} alt="" loading="lazy" decoding="async" draggable={false} />
                    ) : (
                      <span className="cv2-noprint" title={t('canvas.noThumbHint')}>{t('canvas.noThumb')}</span>
                    )}
                  </div>
                  <h3 className="cv2-title">
                    <span>{card.title}</span>
                    {card.archived ? <span className="cv2-tag">{t('canvas.archivedTag')}</span> : null}
                  </h3>
                </article>
              );
            })}
          </div>

          {miniOpen ? <Minimap layout={layout} rectOf={rectOf} cards={cards} view={view} size={size} bounds={bounds} onJump={(wx, wy) => { touched.current = true; setView((cur) => ({ ...cur, x: size.w / 2 - wx * cur.zoom, y: size.h / 2 - wy * cur.zoom })); }} label={t('canvas.minimap')} /> : null}
        </div>

        {selectedCard ? (
          <aside className="cv2-detail" aria-label={selectedCard.title}>
            <header>
              <h2>{selectedCard.title}</h2>
              <p className="canvas-meta">
                {sectionLabel(sectionOf(selectedCard))}
                {selectedCard.archived ? ` · ${t('canvas.archivedTag')}` : ''}
              </p>
            </header>
            <div className="pm-tabs">
              <Button variant="primary" onClick={() => openCard(selectedCard)}>{t('canvas.open')}</Button>
              {!selectedCard.href.startsWith('route:') && !selectedCard.href.startsWith('box:') ? (
                <a className="btn" href={resolveHref(selectedCard.href)} target="_blank" rel="noreferrer">{t('canvas.fullScreen')}</a>
              ) : null}
              <Button variant="ghost" onClick={() => setSelected(null)}>{t('canvas.close')}</Button>
            </div>
            <LivePreview card={selectedCard} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Minimap({ layout, rectOf, cards, view, size, bounds, onJump, label }: { layout: Layout; rectOf: (id: string) => Rect | null; cards: Card[]; view: View; size: { w: number; h: number }; bounds: Rect; onJump: (x: number, y: number) => void; label: string }) {
  const W = 200, H = 130;
  const pad = 60;
  const bx = bounds.x - pad, by = bounds.y - pad, bw = bounds.w + pad * 2, bh = bounds.h + pad * 2;
  const k = Math.min(W / bw, H / bh);
  const ox = (W - bw * k) / 2, oy = (H - bh * k) / 2;
  const toMini = (x: number, y: number) => [ox + (x - bx) * k, oy + (y - by) * k] as const;
  const vx = -view.x / view.zoom, vy = -view.y / view.zoom, vw = size.w / view.zoom, vh = size.h / view.zoom;
  const [mvx, mvy] = toMini(vx, vy);
  const dragging = useRef(false);
  const jump = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = ((event.clientX - rect.left) / rect.width) * W, sy = ((event.clientY - rect.top) / rect.height) * H;
    onJump(bx + (sx - ox) / k, by + (sy - oy) / k);
  };
  return (
    <div className="cv-minimap" role="group" aria-label={label}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); jump(e); }}
        onPointerMove={(e) => { if (dragging.current) jump(e); }}
        onPointerUp={() => { dragging.current = false; }}
        aria-hidden="true"
      >
        {layout.frames.map((f) => {
          const [x, y] = toMini(f.x, f.y);
          return <rect key={f.id} className="mm-frame" x={x} y={y} width={f.w * k} height={f.h * k} />;
        })}
        {cards.map((c) => {
          const r = rectOf(c.id);
          if (!r) return null;
          const [x, y] = toMini(r.x, r.y);
          return <rect key={c.id} className="mm-card" x={x} y={y} width={r.w * k} height={r.h * k} />;
        })}
        <rect className="mm-view" x={mvx} y={mvy} width={vw * k} height={vh * k} />
      </svg>
    </div>
  );
}

/** A live, sandboxed preview of the page, scaled to the panel. In-app routes load the app itself. */
function LivePreview({ card }: { card: Card }) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const external = /^https?:\/\//.test(card.href);
  // route:/plan -> <base>plan (resolveHref keeps it under the GitHub Pages base)
  const src = card.href.startsWith('route:') ? resolveHref(card.href.slice(7)) : card.href.startsWith('box:') ? null : external ? null : resolveHref(card.href);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (el === null) return;
    const measure = () => setScale(el.clientWidth / 1280);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <figure className="cv2-live">
      <div ref={hostRef} className="cv2-live-frame" style={{ height: 800 * scale }}>
        {src ? (
          <iframe title={card.title} src={src} loading="lazy" sandbox="allow-scripts allow-same-origin" style={{ transform: `scale(${scale})` }} tabIndex={-1} />
        ) : card.thumb ? (
          <img src={resolveHref(card.thumb)} alt="" />
        ) : null}
      </div>
      <figcaption className="canvas-meta">{src ? t('canvas.live') : t('canvas.screenshot')}</figcaption>
    </figure>
  );
}
