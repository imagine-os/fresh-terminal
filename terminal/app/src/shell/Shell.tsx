import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Skin, SkinTarget } from '@shared/skins';
import { resolveImageRef } from '../lib/blobs';
import { sampleImageTones } from '../skins/tones';
import { UNKNOWN_TONES, blend, colorsInBackground, parseColor, readableOver, tonesFromColors, type ImageTones, type Readability } from '@shared/ui';
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

/** Object URLs for skin images (and their thumbnails) stored in IndexedDB; https refs pass through. */
function useSkinImages(skins: Partial<Record<SkinTarget, Skin>> | undefined): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refs = Object.values(skins ?? {})
    .flatMap((skin) => [skin?.image?.ref, skin?.image?.thumb])
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

/** Image skins keep the photo vivid; the scrim behind text does the reading work. */
const IMAGE_VEIL = 25;

export function skinVeil(skin: Skin): number {
  return skin.image ? Math.min(skin.veil, IMAGE_VEIL) : skin.veil;
}

/** Sampled tones per image URL; null while loading or when the image cannot be read. */
function useImageTones(skins: Partial<Record<SkinTarget, Skin>> | undefined, urls: Record<string, string>): Record<string, ImageTones | null> {
  const [tones, setTones] = useState<Record<string, ImageTones | null>>({});
  const wanted = Object.values(skins ?? {})
    .map((skin) => (skin?.image ? urls[skin.image.thumb ?? ''] ?? urls[skin.image.ref] : undefined))
    .filter((url): url is string => Boolean(url));
  const key = wanted.join('|');
  useEffect(() => {
    let cancelled = false;
    void Promise.all(wanted.map(async (url) => [url, await sampleImageTones(url)] as const)).then((pairs) => {
      if (!cancelled) setTones(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tones;
}

/**
 * The readability layer for one skinned region, or null when the skin has no
 * image or material behind its text. Tones are composited under the region's
 * veil first, because that is what text actually sits on.
 */
export function skinReadability(
  skin: Skin | undefined,
  themeTokens: Record<string, string>,
  sampled: ImageTones | null | undefined,
): Readability | null {
  if (!skin || (!skin.image && !skin.background)) return null;
  const bg = skin.tokens['--bg'] ?? themeTokens['--bg'];
  const accent = skin.tokens['--accent'] ?? themeTokens['--accent'];
  const raw = skin.image ? (sampled ?? UNKNOWN_TONES) : (tonesFromColors(colorsInBackground(skin.background ?? '')) ?? UNKNOWN_TONES);
  const base = (bg ? parseColor(bg) : null) ?? [11, 13, 16];
  const veil = skinVeil(skin) / 100;
  const tones: ImageTones = {
    dark: blend(base, raw.dark, veil),
    light: blend(base, raw.light, veil),
    mean: raw.mean,
  };
  return readableOver(tones, { ...(bg ? { bg } : {}), ...(accent ? { accent } : {}) });
}

/** Style and attributes for a skinned region: tokens scoped to it, material layers, a veil, and the readability layer. */
export function skinProps(
  skin: Skin | undefined,
  urls: Record<string, string>,
  readable: Readability | null = null,
): { style?: CSSProperties & Record<string, string>; 'data-skinned'?: string; 'data-skin-path'?: string; 'data-readable'?: string } {
  if (!skin) return {};
  const style: CSSProperties & Record<string, string> = { ...skin.tokens };
  if (skin.tokens['--bg'] && !skin.tokens['--bg-elevated']) style['--bg-elevated'] = skin.tokens['--bg'];
  const layers: string[] = [];
  const url = skin.image ? urls[skin.image.ref] : undefined;
  if (url) layers.push(`url("${url.replace(/"/g, '%22')}")`);
  if (skin.background) layers.push(skin.background);
  style['--skin-layers'] = layers.length > 0 ? layers.join(', ') : 'none';
  style['--skin-layer-sizes'] = layers.length > 0 ? layers.map(() => 'cover').join(', ') : 'cover';
  style['--skin-veil'] = `${skinVeil(skin)}%`;
  if (!readable) return { style, 'data-skinned': skin.target, 'data-skin-path': skin.path };
  style['--fg'] = readable.fg;
  style['--fg-muted'] = readable.fgMuted;
  style['--fg-faint'] = readable.fgFaint;
  if (readable.accent) style['--accent'] = readable.accent;
  style['--scrim'] = readable.scrim.join(' ');
  style['--scrim-a'] = String(readable.alpha);
  style['--scrim-blur'] = readable.alpha > 0 ? '8px' : '0px';
  return {
    style,
    'data-skinned': skin.target,
    'data-skin-path': skin.path,
    'data-readable': skin.image ? 'image' : 'material',
  };
}

export function Shell({ spec, theme, slots, leftOpen, rightOpen, onCloseFloating, devMode, onSize, styleOverrides, skins, hideTopBar = false }: ShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const readout = useSizeClass(ref);

  useEffect(() => {
    onSize?.(readout);
  }, [readout, onSize]);

  const regions = resolveRegions(spec, readout.sizeClass, devMode);
  if (hideTopBar) {
    regions.topBar = 'hidden';
  }
  const left = effectiveBehaviour(regions.leftSidebar, leftOpen);
  const right = effectiveBehaviour(regions.rightSidebar, rightOpen || (devMode && regions.rightSidebar === 'floating'));
  const anyFloatingOpen =
    (left === 'floating' && leftOpen) || (right === 'floating' && (rightOpen || devMode));

  // Theme tokens are custom properties on the shell root. Nothing else.
  const skinUrls = useSkinImages(skins);
  const skinTones = useImageTones(skins, skinUrls);
  const regionSkin = (skin: Skin | undefined) => {
    const sampleUrl = skin?.image ? (skinUrls[skin.image.thumb ?? ''] ?? skinUrls[skin.image.ref]) : undefined;
    return skinProps(skin, skinUrls, skinReadability(skin, { ...theme.tokens, ...(styleOverrides ?? {}) }, sampleUrl ? skinTones[sampleUrl] : null));
  };
  const shellSkin = skinProps(skins?.shell, skinUrls);
  const style: CSSProperties & Record<string, string> = { ...theme.tokens, ...(styleOverrides ?? {}), ...(shellSkin.style ?? {}) };
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
      data-skinned={shellSkin['data-skinned']}
      style={style}
      onPointerMove={onPointerMove}
    >
      <header className="region region-top" data-behaviour={regions.topBar} {...regionSkin(skins?.topbar)}>
        {slots.topBar}
      </header>

      <aside
        className="region region-left"
        data-behaviour={left}
        data-open={left === 'floating' ? String(leftOpen) : undefined}
        aria-label="boxes"
        {...regionSkin(skins?.sidebar)}
      >
        {slots.leftSidebar}
      </aside>

      <main className="region region-stage" data-behaviour={regions.stage} id="stage" {...regionSkin(skins?.stage ?? skins?.shell)}>
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

      <footer className="region region-bottom" data-behaviour={regions.bottomBar} {...regionSkin(skins?.composer)}>
        {slots.bottomBar}
      </footer>

      {anyFloatingOpen ? (
        <button type="button" className="scrim" aria-label="close panel" onClick={onCloseFloating} />
      ) : null}
    </div>
  );
}
