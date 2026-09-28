import { useI18n } from '../i18n';

/**
 * Hand-drawn-feel hints for an empty box (Excalidraw-style). Inline SVG only.
 * They fade once the first line is sent. Decorative: aria-hidden, the text is
 * repeated as visible labels.
 */
function Arrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path
        d="M6 10 C 18 14, 30 30, 40 50"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="1 0"
        pathLength="100"
        style={{ filter: 'url(#wobble)' }}
      />
      <path d="M30 46 L41 52 L42 40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Loop() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M8 52 C 12 30, 40 26, 44 40 C 47 52, 28 56, 26 44 C 24 32, 46 18, 56 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M46 12 L56 12 L54 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Squiggle() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M6 44 q 6 -14 12 0 t 12 0 t 12 0 t 12 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M46 36 L54 44 L44 50" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Doodles({ fading, showNewBox }: { fading: boolean; showNewBox: boolean }) {
  const { t } = useI18n();
  return (
    <div className="doodles" data-fading={fading} data-testid="doodles">
      <div className="doodle">
        <Arrow />
        <span>{t('doodle.type')}</span>
      </div>
      <div className="doodle">
        <Squiggle />
        <span>{t('doodle.mic')}</span>
      </div>
      <div className="doodle">
        <Loop />
        <span>{t('doodle.suggest')}</span>
      </div>
      {showNewBox ? (
        <div className="doodle">
          <Arrow flip />
          <span>{t('doodle.newBox')}</span>
        </div>
      ) : null}
    </div>
  );
}
