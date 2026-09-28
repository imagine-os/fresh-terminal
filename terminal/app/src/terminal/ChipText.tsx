import { segment, type Chip, type ChipKind } from '@shared/chips';

const ICONS: Record<ChipKind, string> = {
  date: '◷',
  action: '▶',
  list: '≡',
  object: '“”',
  variable: '$',
  entity: '◆',
};

interface Props {
  text: string;
  chips: Chip[];
  /** Renders a trailing cursor element (used by the composer mirror). */
  cursor?: boolean;
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
          <span key={index} className="chip" data-kind={part.chip.kind} title={part.chip.kind}>
            <span className="chip-icon" aria-hidden="true">
              {ICONS[part.chip.kind]}
            </span>
            {part.chip.text}
          </span>
        ),
      )}
      {cursor ? <span className="cursor" aria-hidden="true" /> : null}
    </>
  );
}
