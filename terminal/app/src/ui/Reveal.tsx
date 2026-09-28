import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RevealPattern } from '@shared/starters';

interface Props {
  pattern: RevealPattern;
  children: ReactNode;
  /** Plain text to reveal character by character (typewriter only). */
  text?: string;
}

const MAX_MS = 1200;
const MIN_MS = 350;

/**
 * Paints a block in like a CRT beam: horizontal sweep (default), radial iris,
 * diagonal wipe, or typewriter for text. Duration scales with content height,
 * capped at ~1.2s. Under prefers-reduced-motion the CSS swaps to a soft fade.
 */
export function Reveal({ pattern, children, text }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(pattern === 'none');
  const [durationMs, setDurationMs] = useState(MAX_MS);

  useEffect(() => {
    const element = ref.current;
    if (element === null || pattern === 'none') {
      return;
    }
    const height = element.getBoundingClientRect().height;
    const scaled = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, (height / 600) * MAX_MS)));
    setDurationMs(scaled);
    const timer = window.setTimeout(() => setDone(true), scaled + 200);
    return () => window.clearTimeout(timer);
  }, [pattern]);

  if (pattern === 'typewriter' && typeof text === 'string') {
    const step = Math.min(40, Math.max(8, Math.floor(MAX_MS / Math.max(1, text.length))));
    return (
      <span className="reveal-type" data-done={done} aria-label={text}>
        {[...text].map((char, index) => (
          <span key={index} className="reveal-char" style={{ animationDelay: `${index * step}ms` }} aria-hidden="true">
            {char}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div
      ref={ref}
      className="reveal"
      data-reveal={pattern === 'typewriter' ? 'beam-horizontal' : pattern}
      data-done={done}
      style={{ ['--reveal-duration' as string]: `${durationMs}ms` }}
    >
      {children}
    </div>
  );
}
