import { useEffect, useRef, useState } from 'react';
import { MARKUP_MAX_BP, MARKUP_MIN_BP, MARKUP_PRESETS_BP } from '@shared/credits';
import { useAccount } from '../auth/Account';
import { refreshCredits } from '../credits/useCredits';
import { useI18n } from '../i18n';
import { routerFetch } from '../lib/routerFetch';

/**
 * Pay what you want (C-105): your markup on model spend after the starter kit, 5% to 100%,
 * 10% by default. Stored on the account (PUT /me/markup). The starter kit, the signed-out
 * trial and your key have no markup whatever this says.
 */
export function MarkupSetting() {
  const { t } = useI18n();
  const account = useAccount();
  const [bp, setBp] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!account.signedIn) return;
    let live = true;
    routerFetch('/me/markup', { method: 'GET' })
      .then(async (response) => (response.ok ? ((await response.json()) as { markup_bp: number }) : null))
      .then((body) => {
        if (!live || !body) return;
        setBp(body.markup_bp);
        setSaved(body.markup_bp);
      })
      .catch(() => live && setError(t('markup.unavailable')));
    return () => {
      live = false;
    };
  }, [account.signedIn, t]);

  if (!account.signedIn) return <p className="canvas-meta">{t('markup.signedOut')}</p>;

  const save = async (next: number) => {
    setError(null);
    const response = await routerFetch('/me/markup', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markup_bp: next }) }).catch(() => null);
    if (response?.ok) {
      setSaved(((await response.json()) as { markup_bp: number }).markup_bp);
      void refreshCredits();
    } else setError(t('markup.unavailable'));
  };
  const choose = (next: number, now = false) => {
    setBp(next);
    if (timer.current) window.clearTimeout(timer.current);
    if (now) void save(next);
    else timer.current = window.setTimeout(() => void save(next), 450);
  };
  const pct = bp === null ? null : bp / 100;
  return (
    <div className="markup-setting" data-testid="markup-setting">
      <p className="canvas-meta">{t('markup.line')}</p>
      <label className="markup-slider">
        <span>
          {t('markup.label')} <strong data-testid="markup-value">{pct === null ? '…' : `${pct}%`}</strong>
        </span>
        <input
          type="range"
          min={MARKUP_MIN_BP / 100}
          max={MARKUP_MAX_BP / 100}
          step={1}
          value={pct ?? 10}
          disabled={bp === null}
          aria-valuetext={pct === null ? undefined : `${pct}%`}
          onChange={(event) => choose(Math.round(Number(event.target.value) * 100))}
          data-testid="markup-range"
        />
      </label>
      <div className="markup-presets" role="group" aria-label={t('markup.presets')}>
        {MARKUP_PRESETS_BP.map((preset) => (
          <button key={preset} type="button" className="markup-preset" aria-pressed={bp === preset} disabled={bp === null} onClick={() => choose(preset, true)}>
            {preset / 100}%
          </button>
        ))}
      </div>
      <small className="canvas-meta" aria-live="polite">
        {error ?? (saved !== null && saved === bp ? t('markup.saved', { pct: String(saved / 100) }) : '')}
      </small>
    </div>
  );
}
