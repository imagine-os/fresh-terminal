import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import type { Card } from '@shared/canvas';
import { useI18n } from '../i18n';
import { store, useStoreSnapshot } from '../store';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { CardFace } from './CardFace';
import { PageInStage } from './PageInStage';

interface View {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const STEP = 24;

interface Props {
  onOpenRoute: (path: string) => void;
  onOpenBox: (id: string) => void;
}

/**
 * The master canvas. Pan by dragging the background, arrow keys, or the
 * buttons; zoom by wheel/pinch, +/- keys, or the buttons. Cards move by drag
 * or by arrow keys when focused. Thickness renders as a physical edge.
 */
export function Canvas({ onOpenRoute, onOpenBox }: Props) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const cards = snapshot.cards;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ kind: 'pan' | 'card'; id?: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const bounds = useMemo(() => {
    if (cards.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    }
    return {
      minX: Math.min(...cards.map((card) => card.x)),
      minY: Math.min(...cards.map((card) => card.y)),
      maxX: Math.max(...cards.map((card) => card.x + card.w)),
      maxY: Math.max(...cards.map((card) => card.y + card.h)),
    };
  }, [cards]);

  const fitAll = useCallback(() => {
    const surface = surfaceRef.current;
    if (surface === null) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const padding = 48;
    const width = bounds.maxX - bounds.minX + padding * 2;
    const height = bounds.maxY - bounds.minY + padding * 2;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(rect.width / width, rect.height / height)));
    setView({
      zoom,
      x: (rect.width - (bounds.maxX - bounds.minX) * zoom) / 2 - bounds.minX * zoom,
      y: (rect.height - (bounds.maxY - bounds.minY) * zoom) / 2 - bounds.minY * zoom,
    });
  }, [bounds]);

  useEffect(() => {
    fitAll();
    // fit once on mount; later fits are explicit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setView((current) => {
      const surface = surfaceRef.current;
      const rect = surface?.getBoundingClientRect();
      const px = clientX !== undefined && rect ? clientX - rect.left : (rect?.width ?? 0) / 2;
      const py = clientY !== undefined && rect ? clientY - rect.top : (rect?.height ?? 0) / 2;
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor));
      const scale = zoom / current.zoom;
      return { zoom, x: px - (px - current.x) * scale, y: py - (py - current.y) * scale };
    });
  }, []);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(factor, event.clientX, event.clientY);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
        drag.current = null;
      }
      return;
    }
    const target = event.target as HTMLElement;
    const cardElement = target.closest<HTMLElement>('[data-card-id]');
    if (target.closest('button, a, input, textarea')) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (cardElement && cardElement.dataset.cardId) {
      const card = cards.find((candidate) => candidate.id === cardElement.dataset.cardId);
      if (card) {
        drag.current = { kind: 'card', id: card.id, startX: event.clientX, startY: event.clientY, originX: card.x, originY: card.y };
        setSelected(card.id);
      }
      return;
    }
    drag.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (pinch.current.zoom * distance) / pinch.current.distance));
        setView((current) => ({ ...current, zoom }));
      }
      return;
    }
    const active = drag.current;
    if (active === null) {
      return;
    }
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (active.kind === 'pan') {
      setView((current) => ({ ...current, x: active.originX + dx, y: active.originY + dy }));
    } else if (active.id) {
      store.moveCard(active.id, Math.round(active.originX + dx / view.zoom), Math.round(active.originY + dy / view.zoom));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) {
      pinch.current = null;
    }
    drag.current = null;
  };

  const onSurfaceKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    const pan = (dx: number, dy: number) => {
      event.preventDefault();
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    };
    if (event.key === 'ArrowLeft') pan(STEP, 0);
    else if (event.key === 'ArrowRight') pan(-STEP, 0);
    else if (event.key === 'ArrowUp') pan(0, STEP);
    else if (event.key === 'ArrowDown') pan(0, -STEP);
    else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAt(1.2);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomAt(1 / 1.2);
    } else if (event.key === '0') {
      event.preventDefault();
      fitAll();
    }
  };

  const onCardKey = (event: KeyboardEvent<HTMLElement>, card: Card) => {
    const step = event.shiftKey ? STEP * 4 : STEP;
    const move = (dx: number, dy: number) => {
      event.preventDefault();
      store.moveCard(card.id, card.x + dx, card.y + dy);
    };
    if (event.key === 'ArrowLeft') move(-step, 0);
    else if (event.key === 'ArrowRight') move(step, 0);
    else if (event.key === 'ArrowUp') move(0, -step);
    else if (event.key === 'ArrowDown') move(0, step);
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (selected === card.id) {
        openCard(card);
      } else {
        setSelected(card.id);
      }
    } else if (event.key === 'Escape') {
      setSelected(null);
    }
  };

  const selectedCard = cards.find((card) => card.id === selected) ?? null;

  const openCard = (card: Card) => {
    if (card.href.startsWith('route:')) {
      onOpenRoute(card.href.slice(6));
    } else if (card.href.startsWith('box:')) {
      const id = card.href.slice(4);
      const box = id === 'first' ? [...snapshot.boxes].sort((a, b) => a.created_at - b.created_at)[0] : snapshot.boxes.find((candidate) => candidate.id === id);
      if (box) {
        onOpenBox(box.id);
      }
    } else {
      window.location.assign(resolveHref(card.href));
    }
  };

  return (
    <div className="canvas-page" data-testid="canvas">
      <div className="canvas-toolbar" role="toolbar" aria-label={t('canvas.title')}>
        <span className="canvas-title">{t('canvas.title')}</span>
        <span className="topbar-spacer" />
        <Tooltip label={t('canvas.zoomOut')} shortcut="-">
          <Button icon aria-label={t('canvas.zoomOut')} onClick={() => zoomAt(1 / 1.2)}>
            −
          </Button>
        </Tooltip>
        <span className="canvas-zoom" aria-live="polite">
          {Math.round(view.zoom * 100)}%
        </span>
        <Tooltip label={t('canvas.zoomIn')} shortcut="+">
          <Button icon aria-label={t('canvas.zoomIn')} onClick={() => zoomAt(1.2)}>
            +
          </Button>
        </Tooltip>
        <Tooltip label={t('canvas.fit')} shortcut="0">
          <Button aria-label={t('canvas.fit')} onClick={fitAll}>
            {t('canvas.fit')}
          </Button>
        </Tooltip>
        <Button
          onClick={() => {
            const title = window.prompt(t('canvas.addPrompt'));
            if (title && title.trim()) {
              const card = store.addCard({ title: title.trim(), kind: 'doc', href: 'route:/canvas' });
              setSelected(card.id);
            }
          }}
        >
          {t('canvas.add')}
        </Button>
      </div>

      <div className="canvas-body">
        <div
          ref={surfaceRef}
          className="canvas-surface"
          tabIndex={0}
          role="application"
          aria-label={t('canvas.surfaceHelp')}
          data-testid="canvas-surface"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onSurfaceKey}
        >
          <div className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            {cards.map((card) => (
              <CardFace
                key={card.id}
                card={card}
                selected={card.id === selected}
                onKeyDown={(event) => onCardKey(event, card)}
                onFocus={() => setSelected(card.id)}
                onOpen={() => openCard(card)}
              />
            ))}
          </div>
        </div>

        {selectedCard ? (
          <aside className="canvas-detail" aria-label={selectedCard.title}>
            <h2>{selectedCard.title}</h2>
            <p className="canvas-meta">
              {selectedCard.kind} · {selectedCard.thickness_mm} mm · {Math.round(selectedCard.x)}, {Math.round(selectedCard.y)}
            </p>
            <div className="pm-tabs">
              <Button variant="primary" onClick={() => openCard(selectedCard)}>
                {t('canvas.open')}
              </Button>
              {!selectedCard.href.startsWith('route:') && !selectedCard.href.startsWith('box:') ? (
                <a className="btn" href={resolveHref(selectedCard.href)} target="_blank" rel="noreferrer">
                  {t('canvas.fullScreen')}
                </a>
              ) : null}
              <Button variant="ghost" onClick={() => setSelected(null)}>
                {t('canvas.close')}
              </Button>
            </div>
            <PageInStage href={selectedCard.href} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Relative hrefs live under the app base (GitHub Pages sets a sub-path). */
export function resolveHref(href: string): string {
  if (/^https?:\/\//.test(href) || href.startsWith('/')) {
    return href;
  }
  return `${import.meta.env.BASE_URL}${href}`;
}
