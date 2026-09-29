import { tonesFromPixels, type ImageTones } from '@shared/ui';

const SAMPLE = 48;
const cache = new Map<string, Promise<ImageTones | null>>();

/**
 * Samples an image's darkest, lightest and average tones on a small canvas.
 * Resolves null when the image cannot be read (no CORS header, decode error,
 * no canvas); callers then assume the worst case, so text stays readable.
 */
export function sampleImageTones(url: string): Promise<ImageTones | null> {
  const known = cache.get(url);
  if (known) return known;
  const task = new Promise<ImageTones | null>((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 8000);
    const done = (value: ImageTones | null) => {
      clearTimeout(timer);
      resolve(value);
    };
    if (!url.startsWith('blob:') && !url.startsWith('data:')) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return done(null);
        context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
        done(tonesFromPixels(context.getImageData(0, 0, SAMPLE, SAMPLE).data));
      } catch {
        // A tainted canvas (image served without CORS) cannot be read.
        done(null);
      }
    };
    image.onerror = () => done(null);
    image.src = url;
  });
  cache.set(url, task);
  return task;
}
