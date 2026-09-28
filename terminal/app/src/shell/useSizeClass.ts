import { useEffect, useState, type RefObject } from 'react';
import { sizeClassForWidthEm, type SizeClass } from '@shared/dialect';

export interface SizeReadout {
  sizeClass: SizeClass;
  widthEm: number;
  widthPx: number;
}

function rootFontSizePx(): number {
  if (typeof window === 'undefined') {
    return 16;
  }
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/** Measures a container and maps its width (in em) to a dialect size class. */
export function useSizeClass(ref: RefObject<HTMLElement | null>): SizeReadout {
  const [readout, setReadout] = useState<SizeReadout>(() => {
    const widthPx = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const widthEm = widthPx / rootFontSizePx();
    return { sizeClass: sizeClassForWidthEm(widthEm), widthEm, widthPx };
  });

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const measure = () => {
      const widthPx = element.getBoundingClientRect().width;
      const widthEm = widthPx / rootFontSizePx();
      setReadout({ sizeClass: sizeClassForWidthEm(widthEm), widthEm, widthPx });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return readout;
}
