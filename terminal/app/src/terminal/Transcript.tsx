import { useEffect, useRef } from 'react';
import type { Chip } from '@shared/chips';
import { REVEAL_PATTERNS, type RevealPattern } from '@shared/starters';
import { COMPOSITIONS, isComposition } from '../compositions';
import type { Line } from '../store';
import { Reveal } from '../ui/Reveal';
import { ChipText } from './ChipText';
import { ReplyView, parseReply } from './ReplyView';
import { formatMicro } from '@shared/ledger';
import { useI18n } from '../i18n';

function parseChips(json: string): Chip[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as Chip[]) : [];
  } catch {
    return [];
  }
}

function patternOf(line: Line): RevealPattern {
  return (REVEAL_PATTERNS as readonly string[]).includes(line.reveal) ? (line.reveal as RevealPattern) : 'none';
}

const GLYPH: Record<Line['kind'], string> = { user: '>', assistant: '·', system: '#' };

function MetaLine({ meta }: { meta: NonNullable<ReturnType<typeof parseReply>>['meta'] }) {
  const { t } = useI18n();
  if (!meta) return null;
  const time = meta.ms >= 1000 ? `${(meta.ms / 1000).toFixed(1)}s` : `${Math.max(0, Math.round(meta.ms))}ms`;
  return (
    <div className="rb-header rb-header-inline" data-testid="reply-header">
      <span>{meta.intent}</span>
      <span aria-hidden="true">·</span>
      <span>{meta.model || t('reply.local')}</span>
      <span aria-hidden="true">·</span>
      <span>{time}</span>
      <span aria-hidden="true">·</span>
      <span>{formatMicro(meta.cost_micro, 4)}</span>
    </div>
  );
}

function LineBody({ line, fresh }: { line: Line; fresh: boolean }) {
  const reply = parseReply(line.blocks_json);
  if (reply && reply.blocks.length === 0 && reply.meta) {
    // Header only: keep the plain text (and its reveal), add the small time and model line.
    const { blocks_json: _ignored, ...plain } = line;
    return (
      <>
        <MetaLine meta={reply.meta} />
        <LineBody line={{ ...plain, blocks_json: '' }} fresh={fresh} />
      </>
    );
  }
  if (reply) {
    return (
      <Reveal pattern={fresh ? 'beam-horizontal' : 'none'}>
        <ReplyView reply={reply} />
      </Reveal>
    );
  }
  if (line.component && isComposition(line.component)) {
    const Component = COMPOSITIONS[line.component];
    return (
      <>
        {line.kind === 'system' && line.text ? <div>{line.text}</div> : null}
        <Reveal pattern={fresh ? patternOf(line) : 'none'}>
          <Component />
        </Reveal>
      </>
    );
  }
  if (line.kind === 'user') {
    return <ChipText text={line.text} chips={parseChips(line.chips_json)} />;
  }
  if (fresh && patternOf(line) === 'typewriter' && !line.streaming) {
    return <Reveal pattern="typewriter" text={line.text}>{line.text}</Reveal>;
  }
  return <>{line.text}</>;
}

export function Transcript({ lines, currentId = null }: { lines: Line[]; currentId?: string | null }) {
  const endRef = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(Date.now());
  const lastLine = lines[lines.length - 1];
  const lastText = lastLine?.text ?? '';

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length, lastText]);

  return (
    <div className="transcript" role="log" aria-live="polite" aria-relevant="additions text" data-testid="transcript">
      {lines.map((line) => (
        <div key={line.id} className="line" data-kind={line.kind} data-streaming={line.streaming ? 'true' : undefined} data-current={line.id === currentId ? 'true' : undefined}>
          <span className="line-glyph" aria-hidden="true">
            {GLYPH[line.kind]}
          </span>
          <div className="line-text">
            <LineBody line={line} fresh={line.created_at >= mountedAt.current} />
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
