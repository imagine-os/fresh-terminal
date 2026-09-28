import { STARTERS } from '@shared/starters';
import { useI18n } from '../i18n';

interface Props {
  visible: boolean;
  hasBoxes: boolean;
  hasLines: boolean;
  themeId: string;
  onPick: (text: string) => void;
}

/**
 * 4-6 suggested starts from the starters list, filtered by what exists:
 * "List my boxes" needs more than one box, "Show today" only in a fresh box,
 * "Switch to Glass Window" only when not already there.
 */
export function SuggestionStrip({ visible, hasBoxes, hasLines, themeId, onPick }: Props) {
  const { t } = useI18n();
  if (!visible) {
    return null;
  }
  const picks = STARTERS.filter((starter) => {
    if (starter.id === 'list-boxes') {
      return hasBoxes;
    }
    if (starter.id === 'show-today') {
      return !hasLines;
    }
    if (starter.id === 'switch-glass') {
      return themeId !== 'glass-window';
    }
    return true;
  }).slice(0, 6);
  return (
    <div className="suggestions" role="list" aria-label={t('composer.chips')} data-testid="suggestions">
      {picks.map((starter) => (
        <button key={starter.id} type="button" role="listitem" className="suggestion" onClick={() => onPick(starter.text)}>
          {starter.text}
        </button>
      ))}
    </div>
  );
}
