import type { FocusEvent, KeyboardEvent } from 'react';
import type { Card } from '@shared/canvas';
import { useI18n } from '../i18n';
import { resolveHref } from './Canvas';

interface Props {
  card: Card;
  selected: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onOpen: () => void;
}

const KIND_GLYPH: Record<Card['kind'], string> = { page: '▭', doc: '≡', image: '▨', box: '◫' };

/**
 * One card on the canvas. Thickness is a physical edge: layered box-shadows
 * scaled by thickness_mm (inside the zoomed world, so zoom scales them too).
 * No buttons live inside the zoomed world (they would shrink below 44 px);
 * a card opens with Enter or double-click, and the detail panel has the buttons.
 */
export function CardFace({ card, selected, onKeyDown, onFocus, onOpen }: Props) {
  const { t } = useI18n();
  const isImage = card.kind === 'image' && /\.(png|jpe?g|gif|webp|svg)$/i.test(card.href);
  return (
    <article
      className="card-face"
      data-card-id={card.id}
      data-kind={card.kind}
      data-selected={selected}
      tabIndex={0}
      aria-label={`${card.title}, ${card.kind}, ${card.thickness_mm} mm`}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
        transform: `rotate(${card.rotation}deg)`,
        ['--t' as string]: String(card.thickness_mm),
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onDoubleClick={onOpen}
    >
      <header className="card-head">
        <span aria-hidden="true">{KIND_GLYPH[card.kind]}</span>
        <span className="card-title">{card.title}</span>
      </header>
      <div className="card-body">
        {isImage ? <img src={resolveHref(card.href)} alt="" /> : <span className="card-href">{card.href}</span>}
      </div>
      <footer className="card-foot">
        <span>{card.thickness_mm} mm</span>
        <span>{t('canvas.openHint')}</span>
      </footer>
    </article>
  );
}
