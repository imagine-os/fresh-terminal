import { buildHarness, type DemoSource } from './harness';

/**
 * Demos live at /demo/<name> (C-108). Each one is a deterministic data set the
 * Tags page (and later Actions and Replay) can render instead of the person's
 * own stages. Nothing from a demo is saved to the browser store.
 */
export interface Demo {
  name: string;
  title: string;
  blurb: string;
  build: () => DemoSource;
}

export const DEMOS: Record<string, Demo> = {
  harness: {
    name: 'harness',
    title: 'One terminal for three companies, a family and a life',
    blurb:
      'A year of lines from one person who runs a dental clinic, a bakery and a coffee roastery on the same Company OS, and keeps family and personal life in the same terminal. Five stages, about three hundred lines, every kind of tag. All of it made up.',
    build: () => buildHarness(),
  },
};

export function findDemo(name: string): Demo | null {
  return DEMOS[name.toLowerCase()] ?? null;
}
