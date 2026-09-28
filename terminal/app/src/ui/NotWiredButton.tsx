import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { useToast } from './Toast';

interface Props {
  what: string;
  label: string;
  icon?: boolean;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}

/**
 * A control that exists but is not functional yet. Always shows the
 * "not wired yet" tooltip and toasts on click. Dashed border in dev mode
 * comes from data-not-wired styling.
 */
export function NotWiredButton({ what, label, icon = false, children, align = 'center' }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  return (
    <Tooltip label={`${label} · ${t('notWired')}`} align={align}>
      <Button
        icon={icon}
        notWired
        variant="ghost"
        aria-label={`${label} (${t('notWired')})`}
        onClick={() => toast(t('notWired.toast', { what }))}
      >
        {children}
      </Button>
    </Tooltip>
  );
}
