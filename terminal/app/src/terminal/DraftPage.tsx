import type { Chip } from '@shared/chips';
import { useI18n } from '../i18n';
import { ChipText } from './ChipText';
import { formatDraft, paragraphs } from './format';

interface Props {
  text: string;
  chips: Chip[];
  /** Puts the caret at this offset in the writing pad. */
  onJump: (offset: number) => void;
}

/**
 * The page above the writing pad: the same words, formatted as you type
 * (sentence capitals, the pronoun I), chips included, growing taller like a
 * sheet in a typewriter. Click a paragraph to edit it in the pad. Editing on
 * the page itself is the next step; the pad stays the source of truth.
 */
export function DraftPage({ text, chips, onJump }: Props) {
  const { t } = useI18n();
  const formatted = formatDraft(text);
  const parts = paragraphs(formatted);
  return (
    <section className="draft-page" aria-label={t('draft.title')} data-testid="draft-page">
      <div className="draft-page-head">
        <span>{t('draft.title')}</span>
        <span className="draft-page-hint">{t('draft.hint')}</span>
      </div>
      {parts.map((paragraph) => {
        const inside = chips
          .filter((chip) => chip.start >= paragraph.start && chip.end <= paragraph.end)
          .map((chip) => ({ ...chip, start: chip.start - paragraph.start, end: chip.end - paragraph.start }));
        return (
          <p key={paragraph.start} className="draft-paragraph" onClick={() => onJump(paragraph.start)} data-testid="draft-paragraph">
            <ChipText text={paragraph.text} chips={inside} />
          </p>
        );
      })}
    </section>
  );
}
