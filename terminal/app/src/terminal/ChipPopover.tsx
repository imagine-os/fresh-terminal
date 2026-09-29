import { useEffect, useRef, useState } from 'react';
import { CHIP_KINDS, isAmbiguous, type Chip, type ChipKind, type ChipOverride } from '@shared/chips';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { CHIP_ICONS } from './ChipText';

export interface ChipRecords {
  pages: Array<{ id: string; title: string }>;
  nav: Array<{ id: string; label: string }>;
  themes: Array<{ id: string; name: string }>;
}

export interface ChipDecision {
  override: ChipOverride;
  /** Write a glossary term: always treat this text as this type in the box. */
  teach: { text: string; type: ChipKind; note: string; case_sensitive: boolean } | null;
}

interface Props {
  chip: Chip;
  records: ChipRecords;
  anchor: HTMLElement | null;
  onApply: (decision: ChipDecision) => void;
  onClose: () => void;
}

/**
 * Change what a chip means: type, resolved value, a context note, and
 * optionally "always treat X as Y in this box" (a glossary term).
 * Keyboard: Tab through, Enter applies, Escape closes and returns focus.
 */
export function ChipPopover({ chip, records, anchor, onApply, onClose }: Props) {
  const { t } = useI18n();
  const [kind, setKind] = useState<ChipKind>(chip.kind);
  const [value, setValue] = useState(chip.value ?? '');
  const [note, setNote] = useState(chip.note ?? '');
  const [teach, setTeach] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      anchor?.focus();
    };
  }, [anchor]);

  const readings: Array<{ kind: ChipKind; p: number }> = [
    { kind: chip.kind, p: chip.p ?? 0.7 },
    ...(chip.alternatives ?? []).map((reading) => ({ kind: reading.kind, p: reading.p })),
  ].slice(0, 2);

  const apply = () => {
    const override: ChipOverride = { kind };
    if (value.trim()) override.value = value.trim();
    if (note.trim()) override.note = note.trim();
    onApply({
      override,
      teach: teach ? { text: chip.text, type: kind, note: note.trim(), case_sensitive: chip.text !== chip.text.toLowerCase() } : null,
    });
  };

  const valueField = () => {
    if (kind === 'date') {
      return <input className="field-input" type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''} onChange={(event) => setValue(event.target.value)} aria-label={t('chips.value')} />;
    }
    if (kind === 'time') {
      return <input className="field-input" type="time" value={/^\d{2}:\d{2}$/.test(value) ? value : ''} onChange={(event) => setValue(event.target.value)} aria-label={t('chips.value')} />;
    }
    const options = kind === 'page' ? records.pages.map((page) => ({ id: page.id, name: page.title })) : kind === 'nav' ? records.nav.map((item) => ({ id: item.id, name: item.label })) : kind === 'theme' ? records.themes : null;
    if (options) {
      return (
        <select className="field-input" value={value} onChange={(event) => setValue(event.target.value)} aria-label={t('chips.value')}>
          <option value="">{t('chips.pickRecord')}</option>
          {options.map((option) => (
            <option key={option.id} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      );
    }
    return <input className="field-input" type="text" value={value} onChange={(event) => setValue(event.target.value)} aria-label={t('chips.value')} placeholder={t('chips.valuePlaceholder')} />;
  };

  return (
    <>
      <button type="button" className="scrim popover-scrim" aria-label={t('canvas.close')} onClick={onClose} />
      <div
        ref={panel}
        className="chip-popover"
        role="dialog"
        aria-modal="true"
        aria-label={t('chips.editTitle', { text: chip.text })}
        data-testid="chip-popover"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'TEXTAREA' && (event.target as HTMLElement).tagName !== 'BUTTON') {
            event.preventDefault();
            apply();
          }
        }}
      >
        <h2>{t('chips.editTitle', { text: chip.text })}</h2>
        {isAmbiguous(chip) ? (
          <div className="pm-tabs" role="group" aria-label={t('chips.readings')}>
            {readings.map((reading) => (
              <Button key={reading.kind} variant={kind === reading.kind ? 'primary' : 'ghost'} onClick={() => setKind(reading.kind)} data-testid={`reading-${reading.kind}`}>
                {t(`chipKind.${reading.kind}`)} · {Math.round(reading.p * 100)}%
              </Button>
            ))}
          </div>
        ) : null}
        <div className="kind-grid" role="radiogroup" aria-label={t('chips.type')}>
          {CHIP_KINDS.map((candidate, index) => (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={kind === candidate}
              className="kind-option chip"
              data-kind={candidate}
              data-autofocus={index === 0 ? '' : undefined}
              data-testid={`kind-${candidate}`}
              onClick={() => setKind(candidate)}
            >
              <span className="chip-icon" aria-hidden="true">
                {CHIP_ICONS[candidate]}
              </span>
              {t(`chipKind.${candidate}`)}
            </button>
          ))}
        </div>
        <label className="field">
          <span>{t('chips.value')}</span>
          {valueField()}
        </label>
        <label className="field">
          <span>{t('chips.note')}</span>
          <textarea className="field-input" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('chips.notePlaceholder')} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={teach} onChange={(event) => setTeach(event.target.checked)} data-testid="teach-glossary" />
          <span>{t('chips.always', { text: chip.text, kind: t(`chipKind.${kind}`) })}</span>
        </label>
        <div className="pm-tabs" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>
            {t('canvas.close')}
          </Button>
          <Button variant="primary" onClick={apply} data-testid="chip-apply">
            {t('chips.apply')}
          </Button>
        </div>
      </div>
    </>
  );
}
