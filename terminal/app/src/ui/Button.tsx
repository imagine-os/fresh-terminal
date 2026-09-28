import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost';
  icon?: boolean;
  notWired?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', icon = false, notWired = false, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['btn', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-icon={icon ? 'true' : undefined}
      data-not-wired={notWired ? 'true' : undefined}
      {...rest}
    />
  );
});
