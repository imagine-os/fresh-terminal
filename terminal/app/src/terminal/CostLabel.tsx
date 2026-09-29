import { formatMicro } from '@shared/ledger';
import type { ReplyMeta } from '@shared/reply';
import { useI18n } from '../i18n';

/**
 * The cost on a reply line (C-103): what the turn cost you, and when part of it is our
 * 10% markup (router-paid spend past the starter kit), how much. Shown as text, not only on
 * hover; the title adds the model cost for pointer users.
 */
export function CostLabel({ meta }: { meta: Pick<ReplyMeta, 'cost_micro' | 'markup_micro' | 'markup_bp'> }) {
  const { t } = useI18n();
  const markup = meta.markup_micro ?? 0;
  if (markup <= 0) return <span>{formatMicro(meta.cost_micro, 4)}</span>;
  const amount = formatMicro(markup, 4);
  const pct = String((meta.markup_bp ?? 1000) / 100);
  return (
    <span data-testid="reply-markup" title={t('reply.markupTip', { cost: formatMicro(meta.cost_micro - markup, 4), markup: amount, pct })}>
      {formatMicro(meta.cost_micro, 4)} <span className="rb-markup">({t('reply.markup', { amount, pct })})</span>
    </span>
  );
}
