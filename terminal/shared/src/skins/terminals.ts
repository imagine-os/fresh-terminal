import { SKIN_LIBRARY, type LibraryMaterial } from './library';

/**
 * What "Open terminal" in the library of terminals opens: a built theme, the
 * closest library material as the stage skin, and whether that look is fully
 * built. Anything interactive that is not built yet is named in `notWired`.
 */
export interface LibraryTerminal {
  id: string;
  name: string;
  theme: string;
  skin: string | null;
  /** true when the theme and skin are that terminal's own look. */
  built: boolean;
  /** Plain words for what is missing, shown as "not wired yet". */
  notWired?: string;
  /** A separate page that has the full version. */
  page?: string;
}

export const LIBRARY_TERMINALS: LibraryTerminal[] = [
  { id: 'blank-page', name: 'Blank Page', theme: 'blank-page', skin: null, built: true },
  { id: 'void', name: 'Void', theme: 'void', skin: null, built: true },
  { id: 'phosphor', name: 'Phosphor', theme: 'void', skin: 'phosphor', built: true },
  { id: 'amber', name: 'Amber', theme: 'void', skin: 'amber', built: true },
  { id: 'bezel-and-glass', name: 'Bezel and Glass', theme: 'glass-window', skin: 'glass', built: false, notWired: 'the moving bezel and grain' },
  { id: 'glass-window', name: 'Glass Window', theme: 'glass-window', skin: null, built: true },
  { id: 'you-as-the-camera', name: 'You as the Camera', theme: 'glass-window', skin: 'glass', built: false, notWired: 'the camera reflection' },
  { id: 'tilt-window', name: 'Tilt Window (phone)', theme: 'glass-window', skin: 'night-sky', built: false, notWired: 'tilting with the phone' },
  { id: 'paper-and-typewriter', name: 'Paper and Typewriter', theme: 'blank-page', skin: 'paper', built: true },
  { id: 'ledger-lines', name: 'Ledger Lines', theme: 'blank-page', skin: 'ledger', built: true },
  { id: 'chalkboard', name: 'Chalkboard', theme: 'void', skin: 'slate', built: true },
  { id: 'frosted', name: 'Frosted', theme: 'glass-window', skin: 'glass', built: true },
  { id: 'hardware-panel', name: 'Hardware Panel', theme: 'void', skin: 'hardware', built: true },
  { id: 'night-sky', name: 'Night Sky', theme: 'void', skin: 'night-sky', built: true, notWired: 'the drifting stars' },
  { id: 'deep-water', name: 'Deep Water', theme: 'void', skin: 'ocean', built: true },
  { id: 'e-ink', name: 'E-ink', theme: 'blank-page', skin: 'e-ink', built: true },
  { id: 'koi-pond', name: 'Koi Pond', theme: 'void', skin: 'ocean', built: false, notWired: 'the live 3D pond inside a box', page: 'pages/koi.html' },
];

export function findLibraryTerminal(id: string | null | undefined): LibraryTerminal | null {
  if (!id) return null;
  return LIBRARY_TERMINALS.find((terminal) => terminal.id === id.trim().toLowerCase()) ?? null;
}

export function findMaterial(id: string | null | undefined): LibraryMaterial | null {
  if (!id) return null;
  return SKIN_LIBRARY.find((material) => material.id === id.trim().toLowerCase()) ?? null;
}
