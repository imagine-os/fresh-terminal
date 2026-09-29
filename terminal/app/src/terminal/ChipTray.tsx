import { isAmbiguous, type Chip } from '@shared/chips';
import { useI18n } from '../i18n';
import { CHIP_ICONS, chipIcon, chipTitle } from './ChipText';

interface Props {
  chips: Chip[];
  onOpen: (chip: Chip, anchor: HTMLElement) => void;
}

/**
 * The draft's chips as real buttons (the composer mirror is paint-only).
 * Click, tap, or focus + Enter opens the chip popover. Chips of one list
 * (same `group`) stack into one column, so "4 orgs" take the room of one
 * pill instead of four (Justin, C-079).
 */
export function ChipTray({ chips, onOpen }: Props) {
  const { t } = useI18n();
  if (chips.length === 0) {
    return null;
  }
  // Keep reading order: a group renders where its first chip sits.
  const rendered = new Set<string>();
  const entries: Array<{ key: string; chips: Chip[] }> = [];
  for (const chip of chips) {
    if (chip.group) {
      if (rendered.has(chip.group)) continue;
      rendered.add(chip.group);
      entries.push({ key: chip.group, chips: chips.filter((candidate) => candidate.group === chip.group) });
    } else {
      entries.push({ key: `${chip.start}:${chip.end}:${chip.kind}`, chips: [chip] });
    }
  }
  return (
    <div className="chip-tray" role="list" aria-label={t('chips.tray')} data-testid="chip-tray">
      {entries.map((entry) => {
        if (entry.chips.length > 1) {
          const kind = entry.chips[0]!.kind;
          return (
            <div key={entry.key} className="chip-stack" role="listitem" data-kind={kind} data-testid={`chip-stack-${kind}`}>
              <span className="chip-stack-head">
                <span className="chip-icon" aria-hidden="true">
                  {CHIP_ICONS[kind]}
                </span>
                {t('chips.stack', { n: String(entry.chips.length), kind: t(`chipKind.${kind}`) })}
              </span>
              {entry.chips.map((chip) => (
                <ChipButton key={`${chip.start}:${chip.end}`} chip={chip} onOpen={onOpen} inStack />
              ))}
            </div>
          );
        }
        return <ChipButton key={entry.key} chip={entry.chips[0]!} onOpen={onOpen} />;
      })}
    </div>
  );
}

function ChipButton({ chip, onOpen, inStack = false }: { chip: Chip; onOpen: Props['onOpen']; inStack?: boolean }) {
  const { t } = useI18n();
  const ambiguous = isAmbiguous(chip);
  const label = `${chip.text}: ${t(`chipKind.${chip.kind}`)}${ambiguous ? ` (${t('chips.ambiguous')})` : ''}`;
  // A count the list disagrees with shows both readings: "3 → 4?".
  const other = chip.kind === 'number' ? chip.alternatives?.find((reading) => reading.kind === 'number' && reading.value && reading.value !== chip.value) : undefined;
  return (
    <button
      type="button"
      role={inStack ? undefined : 'listitem'}
      className="chip chip-button"
      data-kind={chip.kind}
      data-ambiguous={ambiguous ? 'true' : undefined}
      data-source={chip.source}
      data-in-stack={inStack ? 'true' : undefined}
      data-testid={`chip-${chip.text.toLowerCase()}`}
      title={chipTitle(chip)}
      aria-label={label}
      onClick={(event) => onOpen(chip, event.currentTarget)}
    >
      {inStack ? null : (
        <span className="chip-icon" aria-hidden="true">
          {chipIcon(chip)}
        </span>
      )}
      {chip.text}
      {other ? <span className="chip-other">→ {other.value}</span> : null}
      {inStack ? null : <small className="chip-kind">{t(`chipKind.${chip.kind}`)}</small>}
      {ambiguous ? (
        <span className="chip-q" aria-hidden="true">
          ?
        </span>
      ) : null}
    </button>
  );
}
