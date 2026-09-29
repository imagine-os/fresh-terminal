import { useEffect, useMemo } from 'react';
import { positionOf, type Step, type StepKind } from '@shared/timeline';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { NotWiredButton } from '../ui/NotWiredButton';
import { Tooltip } from '../ui/Tooltip';
import { IconBranch, IconClose, IconDownload, IconPause, IconPlay, IconSkipBack, IconSkipForward, IconStepBack, IconStepForward } from '../ui/icons';
import type { Playback } from './usePlayback';

interface Props {
  steps: Step[];
  playback: Playback;
  /** false when a step could not be reversed and the interface is shown approximately. */
  exact: boolean;
  onExit: () => void;
  onSave: () => void;
}

const GLYPH: Record<StepKind, string> = { session: '◇', user: '>', assistant: '·', system: '#', edit: '✎', undo: '↶', redo: '↷' };

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * The playback bar: one lane per branch (only "main" today), a range input to
 * drag, and transport buttons. Space plays, arrows step, Home/End jump.
 */
export function Scrubber({ steps, playback, exact, onExit, onSave }: Props) {
  const { t } = useI18n();
  const total = steps.length;
  const current = steps[playback.index] ?? null;
  const label = current ? `${GLYPH[current.kind]} ${current.summary}` : t('play.empty');
  const marks = useMemo(() => steps.map((step, index) => ({ step, left: positionOf(steps, index) * 100 })), [steps]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' && target.getAttribute('type') !== 'range')) {
        return;
      }
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (event.key === ' ') run(playback.toggle);
      else if (event.key === 'ArrowLeft') run(() => playback.step(event.shiftKey ? -10 : -1));
      else if (event.key === 'ArrowRight') run(() => playback.step(event.shiftKey ? 10 : 1));
      else if (event.key === 'Home') run(playback.toStart);
      else if (event.key === 'End') run(playback.toEnd);
      else if (event.key === 'Escape') run(onExit);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback, onExit]);

  return (
    <div className="scrubber" data-testid="scrubber" role="group" aria-label={t('play.title')} data-playing={playback.playing}>
      <div className="scrubber-lanes" aria-hidden="true">
        <div className="scrubber-lane" data-branch="main">
          <span className="scrubber-lane-name">main</span>
          <div className="scrubber-track">
            {marks.map(({ step, left }, index) => (
              <span
                key={step.id}
                className="scrubber-mark"
                data-kind={step.kind}
                data-reached={index <= playback.index}
                data-current={index === playback.index}
                style={{ left: `${left}%` }}
              />
            ))}
          </div>
        </div>
      </div>
      <input
        className="scrubber-range"
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        step={1}
        value={Math.min(playback.index, Math.max(0, total - 1))}
        disabled={total === 0}
        aria-label={t('play.title')}
        aria-valuetext={current ? `${t('play.step', { n: String(playback.index + 1), total: String(total) })}: ${current.summary}` : t('play.empty')}
        onChange={(event) => playback.seek(Number(event.target.value))}
        data-testid="scrubber-range"
      />
      <div className="scrubber-row">
        <span className="scrubber-transport">
          <Tooltip label={t('play.start')} shortcut="Home" align="start">
            <Button icon variant="ghost" aria-label={t('play.start')} onClick={playback.toStart} disabled={total === 0}>
              <IconSkipBack />
            </Button>
          </Tooltip>
          <Tooltip label={t('play.back')} shortcut="←">
            <Button icon variant="ghost" aria-label={t('play.back')} onClick={() => playback.step(-1)} disabled={total === 0}>
              <IconStepBack />
            </Button>
          </Tooltip>
          <Tooltip label={playback.playing ? t('play.pause') : t('play.play')} shortcut="Space">
            <Button
              icon
              variant="primary"
              aria-label={playback.playing ? t('play.pause') : t('play.play')}
              aria-pressed={playback.playing}
              onClick={playback.toggle}
              disabled={total < 2}
              data-testid="play-toggle"
            >
              {playback.playing ? <IconPause /> : <IconPlay />}
            </Button>
          </Tooltip>
          <Tooltip label={t('play.forward')} shortcut="→">
            <Button icon variant="ghost" aria-label={t('play.forward')} onClick={() => playback.step(1)} disabled={total === 0}>
              <IconStepForward />
            </Button>
          </Tooltip>
          <Tooltip label={t('play.end')}shortcut="End">
            <Button icon variant="ghost" aria-label={t('play.end')} onClick={playback.toEnd} disabled={total === 0}>
              <IconSkipForward />
            </Button>
          </Tooltip>
          <Tooltip label={t('play.speed')}>
            <Button variant="ghost" aria-label={`${t('play.speed')}: ${playback.speed}x`} onClick={playback.cycleSpeed} className="scrubber-speed">
              {playback.speed}×
            </Button>
          </Tooltip>
        </span>
        <span className="scrubber-label" data-testid="scrubber-label" aria-live="polite">
          {current ? (
            <>
              <span className="scrubber-count">{t('play.step', { n: String(playback.index + 1), total: String(total) })}</span>
              <span className="scrubber-time">{clock(current.at)}</span>
              <span className="scrubber-summary" data-kind={current.kind}>
                {label}
              </span>
              {!exact ? <span className="scrubber-approx">{t('play.approx')}</span> : null}
            </>
          ) : (
            <span className="scrubber-summary">{label}</span>
          )}
        </span>
        <span className="scrubber-tools">
          <NotWiredButton what={t('play.branch')} label={t('play.branch')} icon>
            <IconBranch />
          </NotWiredButton>
          <Tooltip label={t('play.save')}>
            <Button icon variant="ghost" aria-label={t('play.save')} onClick={onSave} disabled={total === 0} data-testid="play-save">
              <IconDownload />
            </Button>
          </Tooltip>
          <Tooltip label={t('play.live')} shortcut="Esc" align="end">
            <Button variant="ghost" aria-label={t('play.live')} onClick={onExit} data-testid="play-exit">
              <IconClose />
              <span className="btn-label">{t('play.live')}</span>
            </Button>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}
