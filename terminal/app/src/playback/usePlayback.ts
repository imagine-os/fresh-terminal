import { useCallback, useEffect, useRef, useState } from 'react';
import type { Step } from '@shared/timeline';

export type Speed = 1 | 2 | 4;

export interface Playback {
  index: number;
  playing: boolean;
  speed: Speed;
  seek: (index: number) => void;
  step: (delta: number) => void;
  toStart: () => void;
  toEnd: () => void;
  toggle: () => void;
  cycleSpeed: () => void;
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

/**
 * Playback over a list of steps. Playing advances one step at a time with the
 * real gap between steps, squeezed into 250 ms to 1.5 s and divided by the
 * speed, so a long pause reads as a pause without making anyone wait.
 */
export function usePlayback(steps: Step[], initial: number | null): Playback {
  const [index, setIndex] = useState(() => clamp(initial ?? steps.length - 1, steps.length));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  // Until the person moves the scrubber, a growing list opens at the requested step or its end.
  const touched = useRef(false);

  useEffect(() => {
    setIndex((current) => (touched.current ? clamp(current, steps.length) : clamp(initial ?? steps.length - 1, steps.length)));
  }, [steps.length, initial]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    if (index >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const gap = (steps[index + 1]?.at ?? 0) - (steps[index]?.at ?? 0);
    const delay = Math.min(Math.max(gap, 250), 1500) / speed;
    const timer = setTimeout(() => setIndex((current) => clamp(current + 1, steps.length)), delay);
    return () => clearTimeout(timer);
  }, [playing, index, speed, steps]);

  const seek = useCallback(
    (next: number) => {
      touched.current = true;
      setIndex(clamp(next, steps.length));
    },
    [steps.length],
  );
  const step = useCallback(
    (delta: number) => {
      touched.current = true;
      setPlaying(false);
      setIndex((current) => clamp(current + delta, steps.length));
    },
    [steps.length],
  );
  const toStart = useCallback(() => {
    touched.current = true;
    setPlaying(false);
    setIndex(0);
  }, []);
  const toEnd = useCallback(() => {
    touched.current = true;
    setPlaying(false);
    setIndex(clamp(steps.length - 1, steps.length));
  }, [steps.length]);
  const toggle = useCallback(() => {
    touched.current = true;
    setPlaying((current) => {
      if (!current && index >= steps.length - 1) {
        // Play from the top when already at the end.
        setIndex(0);
      }
      return !current;
    });
  }, [index, steps.length]);
  const cycleSpeed = useCallback(() => setSpeed((current) => (current === 1 ? 2 : current === 2 ? 4 : 1)), []);

  return { index, playing, speed, seek, step, toStart, toEnd, toggle, cycleSpeed };
}
