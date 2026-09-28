import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';

interface TooltipProps {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  children: ReactElement<{ 'aria-describedby'?: string }>;
  extra?: ReactNode;
}

/**
 * Tooltip shown on hover and on keyboard focus (never hover-only). Touch users
 * get the same text through the click toast on placeholders and through
 * aria-label on icon buttons.
 */
export function Tooltip({ label, shortcut, side = 'bottom', align = 'center', children, extra }: TooltipProps) {
  const id = useId();
  return (
    <span className="tip" data-side={side} data-align={align}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span className="tip-bubble" role="tooltip" id={id}>
        {label}
        {shortcut ? <kbd className="kbd">{shortcut}</kbd> : null}
        {extra}
      </span>
    </span>
  );
}
