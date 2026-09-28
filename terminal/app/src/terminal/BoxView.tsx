import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chip } from '@shared/chips';
import { PRODUCT_NAME, PRODUCT_VERSION, REPO_URL } from '@shared/brand';
import type { Theme } from '@shared/themes';
import { verifyLedger } from '@shared/ledger';
import { listActions } from '../actions/registry';
import { useI18n } from '../i18n';
import { streamRoute } from '../lib/routerClient';
import { store, useStoreSnapshot, type Box } from '../store';
import { Composer } from './Composer';
import { Doodles } from './Doodles';
import { Transcript } from './Transcript';

export interface AppCommands {
  setTheme: (id: string) => void;
  setDialect: (text: string) => void;
  setLang: (lang: 'en' | 'es') => void;
  dialectText: string;
}

interface Props {
  box: Box;
  theme: Theme;
  landing: boolean;
  showNewBoxDoodle: boolean;
  onOpenBox: (id: string) => void;
  commands: AppCommands;
}

/**
 * The terminal: transcript above, composer below. Used for both `/` (landing,
 * with the one-line headline and the how-it-works row) and `/box/:id`.
 */
export function BoxView({ box, theme, landing, showNewBoxDoodle, onOpenBox, commands }: Props) {
  const { t, lang } = useI18n();
  const snapshot = useStoreSnapshot();
  const [busy, setBusy] = useState(false);
  const [fading, setFading] = useState(false);
  const sentOnce = useRef(false);

  const lines = useMemo(() => snapshot.lines.filter((line) => line.box_id === box.id), [snapshot.lines, box.id]);
  const isEmpty = lines.length === 0;

  useEffect(() => {
    store.openSession(box.id);
    store.touchPresence(box.id);
  }, [box.id]);

  const onSend = useCallback(
    async (text: string, chips: Chip[]) => {
      if (!sentOnce.current) {
        sentOnce.current = true;
        setFading(true);
      }
      store.appendLine(box.id, 'user', text, chips);

      const { matchLocalCommand } = await import('./localCommands');
      const local = matchLocalCommand(text, chips, {
        boxes: snapshot.boxes,
        lang,
        dialectText: commands.dialectText,
        actionIntents: listActions().filter((action) => !action.notWired).map((action) => action.intent),
      });
      if (local !== null) {
        switch (local.kind) {
          case 'create-box': {
            const created = store.createBox(local.name);
            store.appendLine(box.id, 'system', t('system.boxCreated', { name: created.name }), [], { reveal: 'typewriter' });
            onOpenBox(created.id);
            return;
          }
          case 'system':
            store.appendLine(box.id, 'system', t(local.key, local.vars ?? {}), [], { reveal: local.reveal });
            return;
          case 'text':
            store.appendLine(box.id, 'assistant', local.text, [], { reveal: local.reveal });
            if (local.speak && 'speechSynthesis' in window) {
              window.speechSynthesis.speak(new SpeechSynthesisUtterance(local.text));
            }
            return;
          case 'draw':
            store.appendLine(
              box.id,
              'assistant',
              local.wired ? `${local.component} (live data)` : `${local.component} (${t('notWired').toLowerCase()}: demo composition)`,
              [],
              { component: local.component, reveal: local.reveal },
            );
            return;
          case 'theme':
            commands.setTheme(local.themeId);
            store.appendLine(box.id, 'system', `Theme: ${local.themeId}.`, [], { reveal: 'none' });
            return;
          case 'dialect':
            commands.setDialect(local.text);
            store.appendLine(box.id, 'system', local.text, [], { reveal: 'typewriter' });
            return;
          case 'lang':
            commands.setLang(local.lang);
            store.appendLine(
              box.id,
              'system',
              local.lang === 'es'
                ? 'Interfaz en español. Traducir el contenido de la caja aún no está conectado.'
                : 'Interface in English. Translating box content is not wired yet.',
              [],
              { reveal: 'none' },
            );
            return;
          case 'verify-chain': {
            const result = verifyLedger(store.getSnapshot().entries);
            const own = result.owners[store.identity];
            const ownText = own ? (own.ok ? `ok (${own.count})` : `broken at ${own.brokenAt}: ${own.reason}`) : 'ok (0)';
            const sharedText = result.shared.ok ? `ok (${result.shared.count})` : `broken at ${result.shared.brokenAt}`;
            store.appendLine(box.id, 'system', `Chain: yours ${ownText} · shared ${sharedText}.`, [], { reveal: 'typewriter' });
            return;
          }
        }
      }

      setBusy(true);
      const reply = store.appendLine(box.id, 'assistant', '', []);
      let assembled = '';
      const history = lines
        .filter((line) => line.kind !== 'system')
        .slice(-12)
        .map((line) => ({ role: line.kind as 'user' | 'assistant', content: line.text }));

      await streamRoute(
        { boxId: box.id, text, chips, history },
        {
          onDelta: (delta) => {
            assembled += delta;
            store.updateLine(reply.id, assembled, true);
          },
          onDone: (done) => {
            store.updateLine(reply.id, assembled, false);
            if (done.entry) {
              const { owner_identity: _ignored, ...draft } = done.entry;
              store.appendEntry(draft);
            }
          },
          onFail: (failure) => {
            store.updateLine(reply.id, assembled, false);
            let message: string;
            if (failure.kind === 'no-router') {
              message = t('system.noRouter');
            } else if (failure.kind === 'no-key') {
              message = t('system.noKey');
            } else if (failure.kind === 'pending') {
              message = t('system.pending', { note: failure.note });
            } else {
              message = t('system.error', { message: failure.message });
            }
            store.appendLine(box.id, 'system', message, []);
          },
        },
      );
      setBusy(false);
    },
    [box.id, lines, snapshot.boxes, lang, t, onOpenBox, commands],
  );

  return (
    <>
      {isEmpty ? (
        <section className="empty" data-fading={fading} aria-label={PRODUCT_NAME}>
          {landing ? (
            <>
              <h1 className="headline">
                {t('landing.headline').split(' ').slice(0, -3).join(' ')}{' '}
                <em>{t('landing.headline').split(' ').slice(-3).join(' ')}</em>
              </h1>
              <ol className="how">
                <li>
                  <b>{t('landing.how.1.title')}</b>
                  {t('landing.how.1.body')}
                </li>
                <li>
                  <b>{t('landing.how.2.title')}</b>
                  {t('landing.how.2.body')}
                </li>
                <li>
                  <b>{t('landing.how.3.title')}</b>
                  {t('landing.how.3.body')}
                </li>
              </ol>
            </>
          ) : null}
          <Doodles fading={fading} showNewBox={showNewBoxDoodle} />
        </section>
      ) : (
        <Transcript lines={lines} />
      )}
      {landing ? (
        <footer className="footer">
          <span>
            {PRODUCT_NAME} · {t('footer.version')} {PRODUCT_VERSION}
          </span>
          <span>
            <a className="btn" data-variant="ghost" href={REPO_URL} rel="noreferrer">
              {t('footer.source')}
            </a>
            <a className="btn" data-variant="ghost" href={`${REPO_URL}/tree/main/terminal/docs`} rel="noreferrer">
              {t('footer.docs')}
            </a>
          </span>
        </footer>
      ) : null}
      <ComposerSlot
        boxId={box.id}
        theme={theme}
        hasBoxes={snapshot.boxes.length > 1}
        hasLines={!isEmpty}
        busy={busy}
        onSend={onSend}
      />
    </>
  );
}

/**
 * The composer is rendered into the bottom bar by the page through a portal
 * target; BoxView exposes it through this small component so the bottom bar
 * region owns the layout.
 */
import { createPortal } from 'react-dom';

function ComposerSlot(props: {
  boxId: string;
  theme: Theme;
  hasBoxes: boolean;
  hasLines: boolean;
  busy: boolean;
  onSend: (text: string, chips: Chip[]) => void;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById('composer-slot'));
  }, []);
  if (target === null) {
    return null;
  }
  return createPortal(
    <Composer
      boxId={props.boxId}
      cursor={props.theme.cursor}
      themeId={props.theme.id}
      hasBoxes={props.hasBoxes}
      hasLines={props.hasLines}
      busy={props.busy}
      onSend={props.onSend}
    />,
    target,
  );
}
