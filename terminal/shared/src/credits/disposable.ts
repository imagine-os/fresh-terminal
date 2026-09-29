/**
 * Disposable (throwaway) email domains that never get the $5 welcome credit (C-106).
 * A short built-in list of the common services, not exhaustive; extend it here.
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', '33mail.com', 'anonaddy.me', 'burnermail.io',
  'discard.email', 'dispostable.com', 'dropmail.me', 'emailondeck.com', 'fakeinbox.com', 'fakemail.net',
  'getairmail.com', 'getnada.com', 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'grr.la', 'harakirimail.com', 'inboxbear.com',
  'incognitomail.org', 'jetable.org', 'mailcatch.com', 'maildrop.cc', 'mailinator.com', 'mailinator.net',
  'mailinator2.com', 'mailnesia.com', 'mailpoof.com', 'mailsac.com', 'mailtemp.info', 'mintemail.com',
  'mohmal.com', 'mytemp.email', 'nada.email', 'sharklasers.com', 'spam4.me', 'spambog.com', 'spamgourmet.com',
  'temp-mail.io', 'temp-mail.org', 'tempail.com', 'tempinbox.com', 'tempmail.com', 'tempmail.dev', 'tempmail.net',
  'tempmailo.com', 'tempr.email', 'throwawaymail.com', 'trash-mail.com', 'trashmail.com', 'trashmail.de',
  'trashmail.net', 'wegwerfmail.de', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'emailfake.com', 'moakt.com',
  'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'linshiyouxiang.net', 'mail.tm', 'mailto.plus', 'fexbox.org',
  'inboxkitten.com', 'mail7.io',
]);

/** Providers that ignore dots in the local part (so j.ane@gmail.com is jane@gmail.com). */
const DOTLESS = new Set(['gmail.com', 'googlemail.com']);

/**
 * One person, one address: lowercase, the +tag removed (every provider), dots removed
 * for Gmail, googlemail.com read as gmail.com.
 */
export function normalizeEmail(email: string): string {
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at <= 0) return email.trim().toLowerCase();
  const raw = email.trim().toLowerCase();
  let local = raw.slice(0, at);
  let domain = raw.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  local = local.split('+')[0] ?? local;
  if (DOTLESS.has(domain)) local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // subdomains of a listed domain (x.mailinator.com)
  return [...DISPOSABLE_DOMAINS].some((listed) => domain.endsWith(`.${listed}`));
}
