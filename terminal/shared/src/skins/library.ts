import { ensureReadable, type Skin, type SkinTarget } from '../ui/skin';

/**
 * The material library: original procedural materials written for Fresh
 * Terminal (MIT, same as the repo). 18 materials. CSS gradients only, so they cost nothing,
 * load instantly and serve as the draft while better versions are made.
 */
export interface LibraryMaterial {
  id: string;
  name: string;
  keywords: string[];
  tokens: Record<string, string>;
  background: string;
  veil: number;
}

export const LIBRARY_LICENSE = 'MIT (Fresh Terminal, original)';

export const SKIN_LIBRARY: LibraryMaterial[] = [
  {
    id: 'brass',
    name: 'Brushed brass',
    keywords: ['brass', 'gold', 'golden', 'bronze', 'steampunk', 'metal', 'metallic'],
    tokens: { '--bg': '#2a1f0e', '--surface': '#3a2b12', '--fg': '#fbefd2', '--accent': '#f0c060', '--border': '#8a6a2a' },
    background:
      'repeating-linear-gradient(90deg, rgba(255,240,200,0.05) 0px, rgba(255,240,200,0.05) 1px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0) 4px), linear-gradient(135deg, #5a3f12 0%, #b48a3a 28%, #7a561c 52%, #d8b45e 74%, #5e4214 100%)',
    veil: 45,
  },
  {
    id: 'paper',
    name: 'Warm paper',
    keywords: ['paper', 'parchment', 'notebook', 'cream', 'sketch', 'page'],
    tokens: { '--bg': '#f4ecdc', '--surface': '#fbf6ea', '--fg': '#2b2418', '--accent': '#9a5b1e', '--border': '#d8c9a8' },
    background:
      'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.6), rgba(255,255,255,0) 45%), repeating-linear-gradient(0deg, rgba(120,90,40,0.05) 0px, rgba(120,90,40,0.05) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 28px), linear-gradient(180deg, #f6eedd, #eadcc0)',
    veil: 20,
  },
  {
    id: 'glass',
    name: 'Frosted glass',
    keywords: ['glass', 'frosted', 'ice', 'crystal', 'clear', 'aero'],
    tokens: { '--bg': '#0f1a24', '--surface': '#16283a', '--fg': '#eef6ff', '--accent': '#8fd3ff', '--border': '#3a5a78' },
    background:
      'radial-gradient(120% 80% at 10% 0%, rgba(160,220,255,0.35), rgba(160,220,255,0) 60%), radial-gradient(90% 70% at 100% 100%, rgba(120,160,255,0.25), rgba(0,0,0,0) 60%), linear-gradient(160deg, #13263a, #0b1520)',
    veil: 30,
  },
  {
    id: 'wood',
    name: 'Walnut wood',
    keywords: ['wood', 'walnut', 'oak', 'timber', 'wooden', 'desk', 'cabin'],
    tokens: { '--bg': '#2a1a10', '--surface': '#3a2416', '--fg': '#f6e8d8', '--accent': '#e0a060', '--border': '#6e4a30' },
    background:
      'repeating-linear-gradient(87deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 9px), repeating-linear-gradient(92deg, rgba(255,220,180,0.06) 0px, rgba(255,220,180,0.06) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 23px), linear-gradient(90deg, #4a2c18, #6b4226 40%, #53321c 70%, #3e2413)',
    veil: 45,
  },
  {
    id: 'marble',
    name: 'White marble',
    keywords: ['marble', 'stone', 'granite', 'quartz', 'luxury'],
    tokens: { '--bg': '#eeedea', '--surface': '#f8f7f4', '--fg': '#1d1f24', '--accent': '#6d6a8a', '--border': '#cfcdc6' },
    background:
      'linear-gradient(115deg, rgba(120,120,130,0) 30%, rgba(120,120,130,0.18) 32%, rgba(120,120,130,0) 35%), linear-gradient(62deg, rgba(100,100,110,0) 55%, rgba(100,100,110,0.14) 56%, rgba(100,100,110,0) 60%), radial-gradient(circle at 70% 30%, #ffffff, #e4e2dc 70%)',
    veil: 20,
  },
  {
    id: 'concrete',
    name: 'Poured concrete',
    keywords: ['concrete', 'cement', 'brutalist', 'grey', 'gray', 'industrial'],
    tokens: { '--bg': '#3a3b3d', '--surface': '#46484b', '--fg': '#f1f1ef', '--accent': '#e8b04a', '--border': '#66686c' },
    background:
      'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.06), rgba(0,0,0,0) 40%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.12), rgba(0,0,0,0) 45%), linear-gradient(180deg, #4a4b4e, #333436)',
    veil: 40,
  },
  {
    id: 'felt',
    name: 'Green felt',
    keywords: ['felt', 'pool', 'billiard', 'casino', 'baize', 'green'],
    tokens: { '--bg': '#0d3a24', '--surface': '#124a2e', '--fg': '#eafbe9', '--accent': '#f4d35e', '--border': '#2e7a52' },
    background: 'radial-gradient(ellipse at center, #1a6b43 0%, #0f4a2e 60%, #0a3320 100%)',
    veil: 35,
  },
  {
    id: 'carbon',
    name: 'Carbon fibre',
    keywords: ['carbon', 'fibre', 'fiber', 'racing', 'tech', 'black'],
    tokens: { '--bg': '#101113', '--surface': '#18191c', '--fg': '#f0f0f0', '--accent': '#ff5a36', '--border': '#2c2e33' },
    background:
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 4px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 4px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 8px), linear-gradient(180deg, #1a1b1e, #0c0d0f)',
    veil: 30,
  },
  {
    id: 'neon',
    name: 'Neon night',
    keywords: ['neon', 'synthwave', 'cyberpunk', 'retro', 'arcade', 'vaporwave', 'purple', 'pink'],
    tokens: { '--bg': '#120a24', '--surface': '#1c1036', '--fg': '#fbeaff', '--accent': '#ff4fd8', '--border': '#5a2e9a' },
    background:
      'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(255,79,216,0.25) 60.5%, rgba(0,0,0,0) 62%), repeating-linear-gradient(90deg, rgba(120,80,255,0.18) 0px, rgba(120,80,255,0.18) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 48px), linear-gradient(180deg, #1a0b3a, #3a0f5a 60%, #120a24)',
    veil: 35,
  },
  {
    id: 'ocean',
    name: 'Deep ocean',
    keywords: ['ocean', 'sea', 'water', 'underwater', 'blue', 'wave', 'aqua', 'koi', 'pond'],
    tokens: { '--bg': '#061a2a', '--surface': '#0b2638', '--fg': '#e6f6ff', '--accent': '#5fd4e8', '--border': '#1e4a66' },
    background:
      'radial-gradient(120% 60% at 50% 0%, rgba(95,212,232,0.35), rgba(0,0,0,0) 60%), radial-gradient(80% 50% at 20% 100%, rgba(20,80,140,0.5), rgba(0,0,0,0) 70%), linear-gradient(180deg, #0b3350, #04121e)',
    veil: 30,
  },
  {
    id: 'leather',
    name: 'Worn leather',
    keywords: ['leather', 'saddle', 'suede', 'vintage', 'brown'],
    tokens: { '--bg': '#2b1710', '--surface': '#3a2016', '--fg': '#f7e6d6', '--accent': '#d98b4a', '--border': '#6a3e28' },
    background:
      'radial-gradient(circle at 25% 30%, rgba(255,200,160,0.08), rgba(0,0,0,0) 35%), radial-gradient(circle at 75% 65%, rgba(0,0,0,0.25), rgba(0,0,0,0) 45%), linear-gradient(135deg, #5a3120, #3a1e12 60%, #2a150c)',
    veil: 40,
  },
  {
    id: 'slate',
    name: 'Slate chalkboard',
    keywords: ['slate', 'chalk', 'chalkboard', 'blackboard', 'school'],
    tokens: { '--bg': '#1e2a26', '--surface': '#26342f', '--fg': '#eef3ee', '--accent': '#f2e28a', '--border': '#43574f' },
    background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.05), rgba(0,0,0,0) 50%), linear-gradient(180deg, #25332e, #19231f)',
    veil: 35,
  },
  {
    id: 'phosphor',
    name: 'Green phosphor',
    keywords: ['phosphor', 'crt', 'green', 'terminal', 'matrix', 'hacker', 'monitor'],
    tokens: { '--bg': '#030d05', '--surface': '#071a0b', '--fg': '#7dff9a', '--accent': '#39ff6a', '--border': '#15562a' },
    background:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px), radial-gradient(120% 90% at 50% 45%, rgba(57,255,106,0.16), rgba(0,0,0,0) 70%), linear-gradient(180deg, #041208, #020803)',
    veil: 20,
  },
  {
    id: 'amber',
    name: 'Amber CRT',
    keywords: ['amber', 'orange', 'crt', 'retro', 'vt220', 'monitor'],
    tokens: { '--bg': '#120a02', '--surface': '#1f1204', '--fg': '#ffc46b', '--accent': '#ff9f1c', '--border': '#5a3a10' },
    background:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px), radial-gradient(120% 90% at 50% 45%, rgba(255,159,28,0.16), rgba(0,0,0,0) 70%), linear-gradient(180deg, #180d02, #0a0501)',
    veil: 20,
  },
  {
    id: 'ledger',
    name: 'Ledger lines',
    keywords: ['ledger', 'ruled', 'lined', 'accounting', 'notebook', 'margin'],
    tokens: { '--bg': '#fbfaf3', '--surface': '#ffffff', '--fg': '#1f2a36', '--accent': '#c0392b', '--border': '#cfd8e3' },
    background:
      'linear-gradient(90deg, rgba(0,0,0,0) 1.4rem, rgba(192,57,43,0.55) 1.4rem, rgba(192,57,43,0.55) 1.5rem, rgba(0,0,0,0) 1.5rem), repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 27px, rgba(70,120,190,0.28) 27px, rgba(70,120,190,0.28) 28px), linear-gradient(180deg, #fdfcf6, #f4f2e6)',
    veil: 10,
  },
  {
    id: 'hardware',
    name: 'Hardware panel',
    keywords: ['hardware', 'panel', 'steel', 'aluminium', 'aluminum', 'instrument', 'rack', 'machine'],
    tokens: { '--bg': '#1c1f23', '--surface': '#262a30', '--fg': '#e9edf2', '--accent': '#ffb000', '--border': '#4a5058' },
    background:
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, rgba(0,0,0,0.03) 1px, rgba(0,0,0,0) 3px), radial-gradient(circle at 12px 12px, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 3px, rgba(0,0,0,0) 4px), linear-gradient(180deg, #2c3036, #1a1d21)',
    veil: 35,
  },
  {
    id: 'night-sky',
    name: 'Night sky',
    keywords: ['night', 'sky', 'stars', 'starry', 'space', 'galaxy', 'cosmos'],
    tokens: { '--bg': '#070b1c', '--surface': '#0e1430', '--fg': '#eaf0ff', '--accent': '#9ab8ff', '--border': '#26335e' },
    background:
      'radial-gradient(circle at 12% 18%, rgba(255,255,255,0.9) 0px, rgba(255,255,255,0) 1.5px), radial-gradient(circle at 73% 12%, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0) 1.5px), radial-gradient(circle at 41% 36%, rgba(255,255,255,0.7) 0px, rgba(255,255,255,0) 1px), radial-gradient(circle at 88% 44%, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0) 1.5px), radial-gradient(circle at 24% 62%, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0) 1px), radial-gradient(circle at 63% 74%, rgba(255,255,255,0.7) 0px, rgba(255,255,255,0) 1.5px), radial-gradient(circle at 6% 88%, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0) 1px), radial-gradient(120% 70% at 70% 110%, rgba(80,70,180,0.45), rgba(0,0,0,0) 60%), linear-gradient(180deg, #050816, #0b1230)',
    veil: 15,
  },
  {
    id: 'e-ink',
    name: 'E-ink',
    keywords: ['eink', 'e-ink', 'kindle', 'reader', 'grayscale', 'greyscale', 'calm'],
    tokens: { '--bg': '#e9e8e3', '--surface': '#f2f1ec', '--fg': '#1a1a1a', '--accent': '#444444', '--border': '#c4c3bd' },
    background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.5), rgba(0,0,0,0) 50%), linear-gradient(180deg, #ebeae5, #dfded8)',
    veil: 10,
  },
];

const COLOUR_WORDS: Record<string, string> = {
  red: '#8a1c1c',
  orange: '#a8521a',
  yellow: '#a88a1a',
  green: '#1f6a3a',
  teal: '#146a6a',
  blue: '#1a3f8a',
  navy: '#0f1f48',
  purple: '#4a1f7a',
  pink: '#8a1f5e',
  black: '#101113',
  white: '#ecebe6',
  grey: '#4a4b4e',
  gray: '#4a4b4e',
};

/** Materials ranked by how many of their keywords appear in the request. */
export function rankLibrary(request: string): Array<{ material: LibraryMaterial; hits: number }> {
  const words = new Set(request.toLowerCase().match(/[a-z]+/g) ?? []);
  return SKIN_LIBRARY.map((material) => ({
    material,
    hits: material.keywords.filter((keyword) => words.has(keyword)).length,
  })).sort((a, b) => b.hits - a.hits);
}

export function libraryToSkin(material: LibraryMaterial, target: SkinTarget, request: string, id: string, now: number): Skin {
  return {
    id,
    name: material.name,
    target,
    path: 'library',
    tokens: ensureReadable({ ...material.tokens }),
    background: material.background,
    image: null,
    veil: material.veil,
    request: request.slice(0, 300),
    description: `${material.name} from the material library (${LIBRARY_LICENSE}).`,
    score: null,
    round: null,
    created_at: now,
  };
}

/**
 * The instant first result. A library match if a keyword hits; otherwise a
 * tint from a colour word; otherwise a quiet paper-grey stand-in labelled as
 * a draft, so something changes at once while the refine loop runs.
 */
export function draftSkin(request: string, target: SkinTarget, id: string, now: number): Skin {
  const best = rankLibrary(request)[0];
  if (best && best.hits > 0) {
    return { ...libraryToSkin(best.material, target, request, id, now), name: `Draft: ${best.material.name}`.slice(0, 60) };
  }
  const words = request.toLowerCase().match(/[a-z]+/g) ?? [];
  const colour = words.map((word) => COLOUR_WORDS[word]).find(Boolean);
  const base = colour ?? '#2c3038';
  return {
    id,
    name: colour ? 'Draft: colour tint' : 'Draft: working on it',
    target,
    path: 'css_tokens',
    tokens: ensureReadable({ '--bg': base, '--surface': base }),
    background: `linear-gradient(160deg, ${base}, #0c0d10)`,
    image: null,
    veil: 30,
    request: request.slice(0, 300),
    description: 'A quick stand-in while better versions are made.',
    score: null,
    round: null,
    created_at: now,
  };
}
