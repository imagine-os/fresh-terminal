import { isAmbiguous, segment, type Chip, type ChipKind } from '@shared/chips';

export const CHIP_ICONS: Record<ChipKind, string> = {
  action: '▶',
  date: '◷',
  time: '⏱',
  person: '☺',
  org: '▣',
  place: '⌖',
  object: '“”',
  variable: '$',
  list: '≡',
  number: '#',
  money: '¤',
  url: '↗',
  page: '▭',
  nav: '☰',
  theme: '◐',
  mood: '☹',
  entity: '◆',
};

/** Mood shows its face: ☹ negative, ☺ positive. */
export function chipIcon(chip: Pick<Chip, 'kind' | 'value'>): string {
  if (chip.kind === 'mood') return chip.value === 'positive' ? '☺' : '☹';
  return CHIP_ICONS[chip.kind];
}

interface Props {
  text: string;
  chips: Chip[];
  /** Renders a trailing cursor element (used by the composer mirror). */
  cursor?: boolean;
}

export function chipTitle(chip: Chip): string {
  const readings = [`${chip.kind}${chip.p !== undefined ? ` ${Math.round(chip.p * 100)}%` : ''}`];
  for (const alternative of chip.alternatives ?? []) {
    readings.push(`${alternative.kind} ${Math.round(alternative.p * 100)}%`);
  }
  const who = chip.source === 'user' ? ' · set by you' : chip.source === 'glossary' ? ' · from this box glossary' : '';
  return `${readings.join(' or ')}${who}${chip.note ? ` · ${chip.note}` : ''}`;
}

/** Renders text with chips inline as pills. Pure; the source text is untouched. */
export function ChipText({ text, chips, cursor = false }: Props) {
  const parts = segment(text, chips);
  return (
    <>
      {parts.map((part, index) =>
        part.type === 'text' ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span
            key={index}
            className="chip"
            data-kind={part.chip.kind}
            data-ambiguous={isAmbiguous(part.chip) ? 'true' : undefined}
            data-source={part.chip.source}
            title={chipTitle(part.chip)}
          >
            <span className="chip-icon" aria-hidden="true">
              {chipIcon(part.chip)}
            </span>
            {part.chip.text}
            {isAmbiguous(part.chip) ? (
              <span className="chip-q" aria-hidden="true">
                ?
              </span>
            ) : null}
          </span>
        ),
      )}
      {cursor ? <span className="cursor" aria-hidden="true" /> : null}
    </>
  );
}
