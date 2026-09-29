import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { deleteOwnKey, maskKey, readOwnKey, writeOwnKey } from './ownKey';

export type PayMode = 'ours' | 'own';

interface Props {
  open: boolean;
  payMode: PayMode;
  onPayMode: (mode: PayMode) => void;
  onClose: () => void;
}

/**
 * Two ways to pay. (a) Use Fresh Terminal's key: calls go through our router,
 * the ledger charges pass-through plus margin. (b) Bring your own OpenRouter
 * key: stored only in this browser, calls go straight to OpenRouter, the
 * ledger records price = cost with margin 0.
 */
export function SettingsPanel({ open, payMode, onPayMode, onClose }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(() => readOwnKey());
  const [show, setShow] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSaved(readOwnKey());
      setDraft('');
      firstRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const save = () => {
    const value = draft.trim();
    if (value.length < 8) {
      toast(t('pay.keyTooShort'));
      return;
    }
    writeOwnKey(value);
    setSaved(value);
    setDraft('');
    onPayMode('own');
    toast(t('pay.keySaved'));
  };

  const remove = () => {
    deleteOwnKey();
    setSaved('');
    onPayMode('ours');
    toast(t('pay.keyDeleted'));
  };

  return (
    <>
      <button type="button" className="scrim" aria-label={t('canvas.close')} onClick={onClose} />
      <section
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 id="settings-title">{t('pay.title')}</h2>
        <p className="canvas-meta">{t('pay.intro')}</p>

        <fieldset className="pay-options">
          <legend className="sr-only">{t('pay.title')}</legend>
          <label className="pay-option" data-checked={payMode === 'ours'}>
            <input
              ref={firstRef}
              type="radio"
              name="pay"
              value="ours"
              checked={payMode === 'ours'}
              onChange={() => onPayMode('ours')}
            />
            <span>
              <b>{t('pay.ours')}</b>
              <small>{t('pay.oursBody')}</small>
            </span>
          </label>
          <label className="pay-option" data-checked={payMode === 'own'} data-disabled={saved === ''}>
            <input
              type="radio"
              name="pay"
              value="own"
              checked={payMode === 'own'}
              disabled={saved === ''}
              onChange={() => onPayMode('own')}
            />
            <span>
              <b>{t('pay.own')}</b>
              <small>{t('pay.ownBody')}</small>
            </span>
          </label>
        </fieldset>

        <div className="field">
          <label htmlFor="own-key">{saved ? t('pay.replaceKey') : t('pay.enterKey')}</label>
          <div className="key-row">
            <input
              id="own-key"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  save();
                }
              }}
            />
            <Button variant="ghost" aria-pressed={show} onClick={() => setShow(!show)}>
              {show ? t('pay.hide') : t('pay.show')}
            </Button>
            <Button variant="primary" onClick={save} disabled={draft.trim().length === 0}>
              {t('pay.save')}
            </Button>
          </div>
          <small className="canvas-meta">{t('pay.keyNote')}</small>
        </div>

        {saved ? (
          <div className="key-saved">
            <span className="canvas-meta">
              {t('pay.keyStored')} <code>{maskKey(saved)}</code>
            </span>
            <Button onClick={remove} data-testid="delete-key">
              {t('pay.deleteKey')}
            </Button>
          </div>
        ) : null}

        <div className="pm-tabs" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>
            {t('canvas.close')}
          </Button>
        </div>
      </section>
    </>
  );
}
