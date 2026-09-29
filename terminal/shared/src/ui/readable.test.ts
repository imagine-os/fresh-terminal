import { describe, expect, it } from 'vitest';
import { UNKNOWN_TONES, blend, colorsInBackground, contrastRgb, parseColor, readableOver, sameHue, tonesFromColors, tonesFromPixels, type ImageTones, type Rgb } from './readable';

function check(tones: ImageTones, bg: string, accent?: string) {
  const result = readableOver(tones, { bg, ...(accent ? { accent } : {}) });
  const behind = [tones.dark, tones.light, tones.mean].map((tone) => blend(result.scrim, tone, result.alpha));
  for (const text of [result.fg, result.fgMuted, result.fgFaint, ...(result.accent ? [result.accent] : [])]) {
    for (const bgColor of behind) expect(contrastRgb(parseColor(text)!, bgColor)).toBeGreaterThanOrEqual(4.5);
  }
  return result;
}

describe('readability layer', () => {
  const moss: ImageTones = { dark: [22, 30, 14], light: [196, 206, 150], mean: [90, 110, 50] };

  it('reaches AA for every text colour over a mossy photo, with some image still showing', () => {
    const result = check(moss, '#050805', '#33ff66');
    expect(result.alpha).toBeGreaterThan(0);
    expect(result.alpha).toBeLessThan(0.96);
    expect(result.fg).toBe('#f5f5f0');
    // The phosphor green accent matches the moss, so small text is not tinted with it.
    expect(result.accent).toBe('#f5f5f0');
  });

  it('assumes the worst when the image cannot be sampled', () => {
    const result = check(UNKNOWN_TONES, '#0b0d10');
    expect(result.alpha).toBeGreaterThan(0.6);
  });

  it('adds no scrim when the material is already dark behind light text', () => {
    const dusk: ImageTones = { dark: [20, 8, 40], light: [60, 30, 90], mean: [40, 20, 70] };
    const result = check(dusk, '#0b0716', '#ff5fa2');
    expect(result.alpha).toBe(0);
    expect(result.accent).toBeNull();
  });

  it('picks dark ink on a light theme', () => {
    const paper: ImageTones = { dark: [200, 190, 170], light: [250, 245, 235], mean: [230, 220, 200] };
    const result = check(paper, '#f4ecdc');
    expect(result.fg).toBe('#111318');
  });

  it('reads colour stops out of a material and samples pixels by percentile', () => {
    const stops = colorsInBackground('repeating-linear-gradient(90deg, rgba(255,240,200,0.05) 0px, rgba(0,0,0,0) 4px), linear-gradient(135deg, #5a3f12 0%, #d8b45e 74%)');
    expect(stops).toEqual([
      [90, 63, 18],
      [216, 180, 94],
    ]);
    const tones = tonesFromColors(stops)!;
    expect(tones.dark).toEqual([90, 63, 18]);
    const pixels = [0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 10, 10, 10, 0];
    const sampled = tonesFromPixels(pixels, 0)!;
    expect(sampled.dark).toEqual([0, 0, 0]);
    expect(sampled.light).toEqual([255, 255, 255]);
  });

  it('matches hues only for saturated colours', () => {
    const brass: Rgb = [180, 138, 58];
    expect(sameHue([240, 192, 96], brass)).toBe(true);
    expect(sameHue([240, 240, 240], brass)).toBe(false);
    expect(sameHue([80, 120, 255], brass)).toBe(false);
  });
});
