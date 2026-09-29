import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Skin, SkinTarget } from '@shared/skins';
import { resolveImageRef } from '../lib/blobs';
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
  /** Per-box skins by target (skin.apply ops). */
  /** The tray's hide-the-top-bar switch. */
  hideTopBar?: boolean;
  /** The prompt is in the middle of an empty box; the bottom bar has nothing to show. */
  hideBottomBar?: boolean;
  /** Drag the sidebar's edge to resize it (C-079). Width in px, clamped by the shell. */
  leftResize?: { width: number; onChange: (px: number) => void; label: string };
  skins?: Partial<Record<SkinTarget, Skin>>;
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

/** Object URLs for skin images stored in IndexedDB; https refs pass through. */
function useSkinImages(skins: Partial<Record<SkinTarget, Skin>> | undefined): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refs = Object.values(skins ?? {})
    .map((skin) => skin?.image?.ref)
    .filter((ref): ref is string => Boolean(ref));
  const key = refs.join('|');
  useEffect(() => {
    let cancelled = false;
    void Promise.all(refs.map(async (ref) => [ref, await resolveImageRef(ref)] as const)).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [ref, url] of pairs) if (url) next[ref] = url;
      setUrls(next);
    });
    return () => {
      cancelled = true;
    };
    // refs are summarised by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Style and attributes for a skinned region: tokens scoped to it, material layers, a veil. */
export function skinProps(skin: Skin | undefined, urls: Record<string, string>): { style?: CSSProperties & Record<string, string>; 'data-skinned'?: string; 'data-skin-path'?: string } {
  if (!skin) return {};
  const style: CSSProperties & Record<string, string> = { ...skin.tokens };
  if (skin.tokens['--bg'] && !skin.tokens['--bg-elevated']) style['--bg-elevated'] = skin.tokens['--bg'];
  const layers: string[] = [];
  const url = skin.image ? urls[skin.image.ref] : undefined;
  if (url) layers.push(`url("${url.replace(/"/g, '%22')}")`);
  if (skin.background) layers.push(skin.background);
  style['--skin-layers'] = layers.length > 0 ? layers.join(', ') : 'none';
  style['--skin-veil'] = `${skin.veil}%`;
  return { style, 'data-skinned': skin.target, 'data-skin-path': skin.path };
}

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 520;

export function Shell({ spec, theme, slots, leftOpen, rightOpen, onCloseFloating, devMode, onSize, styleOverrides, skins, hideTopBar = false, hideBottomBar = false, leftResize }: ShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!leftResize) return;
    event.preventDefault();
    dragging.current = true;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const shellLeft = ref.current?.getBoundingClientRect().left ?? 0;
    const move = (pointer: PointerEvent) => {
      if (!dragging.current) return;
      const px = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, pointer.clientX - shellLeft)));
      leftResize.onChange(px);
    };
    const up = () => {
      dragging.current = false;
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const resizeKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!leftResize) return;
    const step = event.shiftKey ? 40 : 10;
    if (event.key === 'ArrowLeft') leftResize.onChange(Math.max(SIDEBAR_MIN, leftResize.width - step));
    else if (event.key === 'ArrowRight') leftResize.onChange(Math.min(SIDEBAR_MAX, leftResize.width + step));
    else return;
    event.preventDefault();
  };
  const readout = useSizeClass(ref);

  useEffect(() => {
    onSize?.(readout);
  }, [readout, onSize]);

  const regions = resolveRegions(spec, readout.sizeClass, devMode);
  if (hideTopBar) {
    regions.topBar = 'hidden';
  }
  if (hideBottomBar) {
    regions.bottomBar = 'hidden';
  }
  const left = effectiveBehaviour(regions.leftSidebar, leftOpen);
  const right = effectiveBehaviour(regions.rightSidebar, rightOpen || (devMode && regions.rightSidebar === 'floating'));
  const anyFloatingOpen =
    (left === 'floating' && leftOpen) || (right === 'floating' && (rightOpen || devMode));

  // Theme tokens are custom properties on the shell root. Nothing else.
  const skinUrls = useSkinImages(skins);
  const shellSkin = skinProps(skins?.shell, skinUrls);
  const style: CSSProperties & Record<string, string> = { ...theme.tokens, ...(styleOverrides ?? {}), ...(shellSkin.style ?? {}) };
  style['--cursor-color'] = CURSOR_COLOR_VALUES[theme.cursor.color];
  if (leftResize) {
    const width = `${Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, leftResize.width))}px`;
    style['--left-full-width'] = width;
    style['--left-float-width'] = width;
  }

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
      data-skinned={shellSkin['data-skinned']}
      style={style}
      onPointerMove={onPointerMove}
    >
      <header className="region region-top" data-behaviour={regions.topBar} {...skinProps(skins?.topbar, skinUrls)}>
        {slots.topBar}
      </header>

      <aside
        className="region region-left"
        data-behaviour={left}
        data-open={left === 'floating' ? String(leftOpen) : undefined}
        aria-label="boxes"
        {...skinProps(skins?.sidebar, skinUrls)}
      >
        {slots.leftSidebar}
      </aside>
      {leftResize && (left === 'full' || (left === 'floating' && leftOpen)) ? (
        <div
          className="left-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={leftResize.label}
          aria-valuenow={leftResize.width}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          tabIndex={0}
          title={leftResize.label}
          onPointerDown={startResize}
          onKeyDown={resizeKeys}
          data-testid="left-resize"
        />
      ) : null}

      <main className="region region-stage" data-behaviour={regions.stage} id="stage" {...skinProps(skins?.stage ?? skins?.shell, skinUrls)}>
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

      <footer className="region region-bottom" data-behaviour={regions.bottomBar} {...skinProps(skins?.composer, skinUrls)}>
        {slots.bottomBar}
      </footer>

      {anyFloatingOpen ? (
        <button type="button" className="scrim" aria-label="close panel" onClick={onCloseFloating} />
      ) : null}
    </div>
  );
}
