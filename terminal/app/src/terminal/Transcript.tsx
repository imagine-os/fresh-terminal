import { useEffect, useRef } from 'react';
import type { Chip } from '@shared/chips';
import { REVEAL_PATTERNS, type RevealPattern } from '@shared/starters';
import { COMPOSITIONS, isComposition } from '../compositions';
import type { Line } from '../store';
import { Reveal } from '../ui/Reveal';
import { ChipText } from './ChipText';
import { ReplyView, parseReply } from './ReplyView';

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

function LineBody({ line, fresh }: { line: Line; fresh: boolean }) {
  const reply = parseReply(line.blocks_json);
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

export function Transcript({ lines }: { lines: Line[] }) {
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
        <div key={line.id} className="line" data-kind={line.kind} data-streaming={line.streaming ? 'true' : undefined}>
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
