import { isAmbiguous, type Chip } from '@shared/chips';
import { useI18n } from '../i18n';
import { CHIP_ICONS, chipTitle } from './ChipText';

interface Props {
  chips: Chip[];
  onOpen: (chip: Chip, anchor: HTMLElement) => void;
}

/**
 * The draft's chips as real buttons (the composer mirror is paint-only).
 * Click, tap, or focus + Enter opens the chip popover.
 */
export function ChipTray({ chips, onOpen }: Props) {
  const { t } = useI18n();
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="chip-tray" role="list" aria-label={t('chips.tray')} data-testid="chip-tray">
      {chips.map((chip) => {
        const ambiguous = isAmbiguous(chip);
        const label = `${chip.text}: ${t(`chipKind.${chip.kind}`)}${ambiguous ? ` (${t('chips.ambiguous')})` : ''}`;
        return (
          <button
            key={`${chip.start}:${chip.end}:${chip.kind}`}
            type="button"
            role="listitem"
            className="chip chip-button"
            data-kind={chip.kind}
            data-ambiguous={ambiguous ? 'true' : undefined}
            data-source={chip.source}
            data-testid={`chip-${chip.text.toLowerCase()}`}
            title={chipTitle(chip)}
            aria-label={label}
            onClick={(event) => onOpen(chip, event.currentTarget)}
          >
            <span className="chip-icon" aria-hidden="true">
              {CHIP_ICONS[chip.kind]}
            </span>
            {chip.text}
            <small className="chip-kind">{t(`chipKind.${chip.kind}`)}</small>
            {ambiguous ? (
              <span className="chip-q" aria-hidden="true">
                ?
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
