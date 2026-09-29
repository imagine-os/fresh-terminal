import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { RegionBehaviour, ShellRegion, ShellSpec, SizeClass } from '@shared/dialect';
import { CURSOR_COLOR_VALUES, type Theme } from '@shared/themes';
import { useSizeClass, type SizeReadout } from './useSizeClass';

export interface ShellSlots {
  topBar: ReactNode;
  bottomBar: ReactNode;
  leftSidebar: ReactNode;
  rightSidebar: ReactNode;
  stage: ReactNode;
}

interface ShellProps {
  spec: ShellSpec;
  theme: Theme;
  slots: ShellSlots;
  /** Floating sidebars are open/closed by the app (toggle button, Escape). */
  leftOpen: boolean;
  rightOpen: boolean;
  onCloseFloating: () => void;
  /** Dev mode forces the right sidebar to show. */
  devMode: boolean;
  onSize?: (readout: SizeReadout) => void;
  /** Per-box style token overrides (style.set ops), layered over the theme. */
  styleOverrides?: Record<string, string>;
}

export interface ResolvedRegions {
  topBar: RegionBehaviour;
  bottomBar: RegionBehaviour;
  leftSidebar: RegionBehaviour;
  rightSidebar: RegionBehaviour;
  stage: RegionBehaviour;
}

/**
 * Resolves the spec for one size class. A region that is "hidden" or
 * "collapsed" can still be summoned as floating by the app (leftOpen).
 */
export function resolveRegions(spec: ShellSpec, size: SizeClass, devMode: boolean): ResolvedRegions {
  const pick = (region: ShellRegion): RegionBehaviour => spec.regions[region].behaviour[size];
  const resolved: ResolvedRegions = {
    topBar: pick('topBar'),
    bottomBar: pick('bottomBar'),
    leftSidebar: pick('leftSidebar'),
    rightSidebar: pick('rightSidebar'),
    stage: pick('stage'),
  };
  if (devMode && (resolved.rightSidebar === 'hidden' || resolved.rightSidebar === 'collapsed')) {
    resolved.rightSidebar = size === 'phone' || size === 'tablet' ? 'floating' : 'full';
  }
  return resolved;
}

function effectiveBehaviour(behaviour: RegionBehaviour, open: boolean): RegionBehaviour {
  if ((behaviour === 'hidden' || behaviour === 'collapsed') && open) {
    return 'floating';
  }
  return behaviour;
}

export function Shell({ spec, theme, slots, leftOpen, rightOpen, onCloseFloating, devMode, onSize, styleOverrides }: ShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const readout = useSizeClass(ref);

  useEffect(() => {
    onSize?.(readout);
  }, [readout, onSize]);

  const regions = resolveRegions(spec, readout.sizeClass, devMode);
  const left = effectiveBehaviour(regions.leftSidebar, leftOpen);
  const right = effectiveBehaviour(regions.rightSidebar, rightOpen || (devMode && regions.rightSidebar === 'floating'));
  const anyFloatingOpen =
    (left === 'floating' && leftOpen) || (right === 'floating' && (rightOpen || devMode));

  // Theme tokens are custom properties on the shell root. Nothing else.
  const style: CSSProperties & Record<string, string> = { ...theme.tokens, ...(styleOverrides ?? {}) };
  style['--cursor-color'] = CURSOR_COLOR_VALUES[theme.cursor.color];

  const onPointerMove =
    theme.respondsTo === 'pointer'
      ? (event: React.PointerEvent<HTMLDivElement>) => {
          const element = ref.current;
          if (element === null) {
            return;
          }
          const rect = element.getBoundingClientRect();
          element.style.setProperty('--pointer-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
          element.style.setProperty('--pointer-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
        }
      : undefined;

  return (
    <div
      ref={ref}
      className="shell"
      data-size={readout.sizeClass}
      data-left={left}
      data-right={right}
      data-spacing={spec.spacing}
      data-material={theme.surface === 'flat' ? spec.material : theme.surface}
      data-backdrop={theme.backdrop}
      data-bezel={theme.bezel}
      data-text={theme.text}
      data-motion={theme.motion}
      data-responds={theme.respondsTo}
      data-theme-id={theme.id}
      style={style}
      onPointerMove={onPointerMove}
    >
      <header className="region region-top" data-behaviour={regions.topBar}>
        {slots.topBar}
      </header>

      <aside
        className="region region-left"
        data-behaviour={left}
        data-open={left === 'floating' ? String(leftOpen) : undefined}
        aria-label="boxes"
      >
        {slots.leftSidebar}
      </aside>

      <main className="region region-stage" data-behaviour={regions.stage} id="stage">
        {slots.stage}
      </main>

      <aside
        className="region region-right"
        data-behaviour={right}
        data-open={right === 'floating' ? String(rightOpen || devMode) : undefined}
        aria-label="dev"
      >
        {slots.rightSidebar}
      </aside>

      <footer className="region region-bottom" data-behaviour={regions.bottomBar}>
        {slots.bottomBar}
      </footer>

      {anyFloatingOpen ? (
        <button type="button" className="scrim" aria-label="close panel" onClick={onCloseFloating} />
      ) : null}
    </div>
  );
}
