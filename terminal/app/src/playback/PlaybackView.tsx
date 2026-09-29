import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { exportTimeline, lineIdsAt, type Step } from '@shared/timeline';
import { useI18n } from '../i18n';
import { store, useStoreSnapshot, type Box } from '../store';
import { Transcript } from '../terminal/Transcript';
import { Scrubber } from './Scrubber';
import type { Playback } from './usePlayback';

interface Props {
  box: Box;
  steps: Step[];
  playback: Playback;
  exact: boolean;
  onExit: () => void;
}

function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Replay of one box: the transcript as it stood at the chosen step, and the
 * scrubber in the bottom bar where the composer normally sits. Read-only; no
 * prompt is sent and no op is applied while replaying.
 */
export function PlaybackView({ box, steps, playback, exact, onExit }: Props) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById('composer-slot'));
  }, []);

  const visible = lineIdsAt(steps, playback.index);
  const lines = snapshot.lines.filter((line) => line.box_id === box.id && visible.has(line.id)).map((line) => ({ ...line, streaming: false }));
  const current = steps[playback.index] ?? null;
  const currentLineId = current && (current.kind === 'user' || current.kind === 'assistant' || current.kind === 'system') ? current.ref : null;

  const save = () => {
    const safe = box.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'box';
    downloadJson(`${safe}-timeline.json`, exportTimeline(store.getSnapshot(), box.id, Date.now()));
  };

  return (
    <>
      <div className="replay-banner" data-testid="replay-banner" role="status">
        <span className="replay-dot" aria-hidden="true" />
        {t('play.title')} · {box.name}
      </div>
      {lines.length > 0 ? (
        <Transcript lines={lines} currentId={currentLineId} />
      ) : (
        <section className="empty replay-empty" aria-label={t('play.title')}>
          <p className="replay-empty-text">{steps.length > 0 ? t('play.beforeLines') : t('play.empty')}</p>
        </section>
      )}
      {slot ? createPortal(<Scrubber steps={steps} playback={playback} exact={exact} onExit={onExit} onSave={save} />, slot) : null}
    </>
  );
}
