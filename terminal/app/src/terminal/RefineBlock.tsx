import { useEffect, useState } from 'react';
import { formatMicro } from '@shared/ledger';
import { STOP_LABELS, type StopReason } from '@shared/refine';
import { SKIN_PATH_LABELS, SKIN_TARGET_LABELS, type Skin, type SkinRun } from '@shared/skins';
import { useI18n } from '../i18n';
import { resolveImageRef } from '../lib/blobs';
import { adoptRun, applyRunSkin, isRunning, stopRun, useLiveRun } from '../skins/runner';

function Swatch({ skin }: { skin: Skin }) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = skin.image?.thumb ?? skin.image?.ref ?? null;
  useEffect(() => {
    let cancelled = false;
    if (ref) void resolveImageRef(ref).then((value) => !cancelled && setUrl(value));
    return () => {
      cancelled = true;
    };
  }, [ref]);
  const layers = [url ? `url("${url.replace(/"/g, '%22')}")` : null, skin.background].filter(Boolean).join(', ');
  return (
    <span
      className="rf-swatch"
      aria-hidden="true"
      style={{ backgroundColor: skin.tokens['--bg'] ?? 'var(--surface)', backgroundImage: layers || undefined, color: skin.tokens['--fg'] ?? 'var(--fg)' }}
    >
      <span className="rf-swatch-text">Aa</span>
    </span>
  );
}

/** One skin run: status line, draft, a row of thumbnails per round (winner outlined), Stop. */
export function RefineBlock({ run: saved }: { run: SkinRun }) {
  const { t } = useI18n();
  adoptRun(saved);
  const run = useLiveRun(saved.id) ?? saved;
  const running = run.status !== 'done' && isRunning(run.id);
  const best = run.rounds.flatMap((round) => round.variants).reduce<number | null>((top, entry) => (entry.score !== null && (top === null || entry.score > top) ? entry.score : top), null);
  const reason = run.reason as StopReason | null;
  const licensed = run.rounds.flatMap((round) => round.variants).filter((entry) => entry.skin.image?.provider === 'openverse');

  return (
    <div className="rf" data-testid="refine-block" data-status={run.status}>
      <div className="rf-status" role="status" aria-live="polite">
        <span>
          {t('skin.title', { material: run.material, target: SKIN_TARGET_LABELS[run.target] })}
        </span>
        <span className="rf-meta">
          {run.path ? `${SKIN_PATH_LABELS[run.path]}${run.path_source === 'jev' ? ' · Jev' : ''}` : run.status === 'done' ? '—' : t('skin.planning')}
          {' · '}
          {t('skin.rounds', { n: String(run.rounds.length) })}
          {' · '}
          {formatMicro(run.spent_micro, 4)} / {formatMicro(run.cap_micro, 2)}
          {best !== null ? ` · ${t('skin.best')} ${best.toFixed(1)}` : ''}
        </span>
        {running ? (
          <button type="button" className="btn rf-stop" data-variant="ghost" data-testid="skin-stop" onClick={() => stopRun(run.id)}>
            ■ {t('skin.stop')}
          </button>
        ) : null}
      </div>
      {run.draft ? (
        <div className="rf-row" data-kind="draft">
          <span className="rf-round">{t('skin.draft')}</span>
          <button
            type="button"
            className="rf-variant"
            aria-pressed={run.applied === run.draft.id}
            onClick={() => run.draft && applyRunSkin(run.id, run.draft)}
            title={run.draft.name}
          >
            <Swatch skin={run.draft} />
            <span className="rf-name">{run.draft.name}</span>
          </button>
        </div>
      ) : null}
      {run.rounds.map((round) => (
        <div className="rf-row" key={round.round} data-testid={`refine-round-${round.round}`}>
          <span className="rf-round">{t('skin.round', { n: String(round.round) })}</span>
          {round.variants.map((entry, index) => (
            <button
              type="button"
              key={entry.skin.id}
              className="rf-variant"
              data-winner={index === round.winner ? 'true' : undefined}
              aria-pressed={run.applied === entry.skin.id}
              title={`${entry.skin.name}: ${entry.note}`}
              onClick={() => applyRunSkin(run.id, entry.skin)}
            >
              <Swatch skin={entry.skin} />
              <span className="rf-name">{entry.skin.name}</span>
              <span className="rf-score">{entry.score !== null ? entry.score.toFixed(1) : '–'}</span>
            </button>
          ))}
        </div>
      ))}
      {run.status === 'done' ? (
        <p className="rb-note" data-testid="refine-done">
          {reason ? `${t('skin.stopped')} ${STOP_LABELS[reason] ?? reason}.` : ''} {run.error ?? ''} {t('skin.pickAny')}
        </p>
      ) : null}
      {licensed.length > 0 ? (
        <ul className="rf-licenses">
          {licensed.slice(0, 15).map((entry) => (
            <li key={entry.skin.id}>
              <a href={entry.skin.image?.source_url || entry.skin.image?.ref} rel="noreferrer" target="_blank">
                {entry.skin.image?.title}
              </a>{' '}
              · {entry.skin.image?.creator} ·{' '}
              {entry.skin.image?.license_url ? (
                <a href={entry.skin.image.license_url} rel="noreferrer" target="_blank">
                  {entry.skin.image.license}
                </a>
              ) : (
                entry.skin.image?.license
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
