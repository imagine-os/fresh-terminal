import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../app/public');
const manifest = JSON.parse(readFileSync(resolve(app, 'sales/img/shots.json'), 'utf8')) as { shots: Record<string, { file: string; width: number; height: number; alt: string }> };
const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('sales screenshots (scripts/sales-shots.mjs)', () => {
  it('every <img data-shot> on the sales pages points at a written scene with its size and alt text', () => {
    let count = 0;
    for (const page of ['about.html', 'pricing.html', 'faq.html']) {
      const html = readFileSync(resolve(app, page), 'utf8');
      for (const tag of html.match(/<img\b[^>]*data-shot="[^"]+"[^>]*>/g) ?? []) {
        count += 1;
        const name = /data-shot="([^"]+)"/.exec(tag)![1]!;
        const shot = manifest.shots[name];
        expect(shot, `${page}: ${name}`).toBeDefined();
        expect(tag).toContain(`src="sales/img/${shot!.file}"`);
        expect(tag).toContain(`width="${shot!.width}"`);
        expect(tag).toContain(`height="${shot!.height}"`);
        expect(decode(/\balt="([^"]*)"/.exec(tag)![1]!)).toBe(shot!.alt);
        expect(shot!.alt.length).toBeGreaterThan(20);
        expect(existsSync(resolve(app, 'sales/img', shot!.file))).toBe(true);
      }
    }
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it('has Spanish alt text for every scene', () => {
    const es = readFileSync(resolve(app, 'sales/i18n-es.js'), 'utf8');
    for (const name of Object.keys(manifest.shots)) expect(es, name).toContain(`'shot.${name}':`);
  });
});
