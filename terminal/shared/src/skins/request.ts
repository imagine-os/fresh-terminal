import type { SkinTarget } from '../ui/skin';

const TARGET_WORDS: Array<{ target: SkinTarget; pattern: RegExp }> = [
  { target: 'sidebar', pattern: /\b(side ?bar|menu|left panel|navigation|nav)\b/i },
  { target: 'topbar', pattern: /\b(top ?bar|header|title ?bar|toolbar)\b/i },
  { target: 'composer', pattern: /\b(composer|prompt box|input|text box|bottom bar|prompt)\b/i },
  { target: 'shell', pattern: /\b(whole (app|thing|terminal|screen)|everything|entire|all of it|the app|whole)\b/i },
  { target: 'stage', pattern: /\b(stage|background|backdrop|transcript|main area|canvas|screen)\b/i },
];

const FILLER =
  /\b(please|skin|reskin|re-skin|make|use|give|apply|set|turn|paint|the|a|an|look|looks|like|as|in|with|material|texture|textured|on|to|it|of|my|this|that|for|me|into|style|styled|feel|made|out|and|so)\b/gi;

/** "skin the sidebar brass" → {target: sidebar, material: "brass"}. */
export function parseSkinRequest(text: string): { target: SkinTarget; material: string } {
  let target: SkinTarget = 'stage';
  let rest = text;
  for (const entry of TARGET_WORDS) {
    if (entry.pattern.test(text)) {
      target = entry.target;
      rest = rest.replace(entry.pattern, ' ');
      break;
    }
  }
  const material = rest.replace(FILLER, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return { target, material: material || text.trim() };
}

/** Local shortcut: prompts that are clearly a skin or material request. */
export function looksLikeSkinRequest(text: string): boolean {
  return /^\s*(re-?skin|skin)\b/i.test(text) || /\b(material|texture)\b/i.test(text) || /\b(make|turn)\b.*\b(look|feel)s? like\b/i.test(text);
}
