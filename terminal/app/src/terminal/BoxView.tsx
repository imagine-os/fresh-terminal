import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localTagger, type Chip } from '@shared/chips';
import { PRODUCT_NAME, PRODUCT_VERSION, REPO_URL } from '@shared/brand';
import type { Theme } from '@shared/themes';
import { verifyLedger } from '@shared/ledger';
import { listActions } from '../actions/registry';
import { useI18n } from '../i18n';
import { streamDirect } from '../lib/openrouterDirect';
import { streamRoute, type RouteHandlers } from '../lib/routerClient';
import { probeRouter } from '../lib/routerHealth';
import { speechRecognitionCtor, type VoiceSessionSummary } from '../voice';
import { useVoice, type VoiceControls } from '../voice/useVoice';
import { readOwnKey } from '../settings/ownKey';
import { store, useStoreSnapshot, type Box } from '../store';
import { Composer } from './Composer';
import { Doodles } from './Doodles';
import { Transcript } from './Transcript';

export interface AppCommands {
  setTheme: (id: string) => void;
  setDialect: (text: string) => void;
  setLang: (lang: 'en' | 'es') => void;
  dialectText: string;
  payMode: 'ours' | 'own';
  modelTagger: boolean;
  voiceProvider: 'webspeech' | 'openai' | 'gemini';
  voiceMode: 'toggle' | 'hold';
  openSettings: () => void;
  realtimePrice: (provider: 'openai' | 'gemini') => { audio_in_micro_per_minute: number; audio_out_micro_per_minute: number } | null;
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
  const [voiceAppend, setVoiceAppend] = useState<string | null>(null);
  const assistantLine = useRef<{ id: string; text: string } | null>(null);

  const voice = useVoice({
    providerId: commands.voiceProvider,
    lang,
    onFinalTranscript: (text) => {
      if (commands.voiceProvider === 'webspeech') {
        setVoiceAppend(text);
      } else {
        // Realtime conversation: what you said becomes a user line right away.
        store.appendLine(box.id, 'user', text, localTagger.tag(text), { reveal: 'none' });
      }
    },
    onAssistantText: (text, isFinal) => {
      if (!isFinal) {
        if (assistantLine.current === null) {
          const line = store.appendLine(box.id, 'assistant', '', [], { reveal: 'none' });
          assistantLine.current = { id: line.id, text: '' };
        }
        assistantLine.current.text += text;
        store.updateLine(assistantLine.current.id, assistantLine.current.text, true);
        return;
      }
      if (assistantLine.current !== null) {
        store.updateLine(assistantLine.current.id, text || assistantLine.current.text, false);
        assistantLine.current = null;
      } else if (text) {
        store.appendLine(box.id, 'assistant', text, [], { reveal: 'none' });
      }
    },
    onSessionEnd: (summary: VoiceSessionSummary) => {
      if (summary.provider === 'webspeech') {
        return;
      }
      const price = commands.realtimePrice(summary.provider);
      const perMinute = price ? price.audio_in_micro_per_minute + price.audio_out_micro_per_minute : 0;
      const costMicro = Math.round((summary.seconds / 60) * perMinute);
      store.appendEntry({
        box_id: box.id,
        kind: 'charge',
        what: 'voice.session.estimate',
        model: summary.model,
        units: summary.seconds,
        unit_kind: 'second',
        cost_micro: costMicro,
        price_micro: costMicro,
        ref: '',
        created_at: summary.endedAt,
      });
      store.appendLine(box.id, 'system', t('voice.sessionEntry', { seconds: String(summary.seconds), model: summary.model }), [], { reveal: 'none' });
    },
    onError: (message) => {
      store.appendLine(box.id, 'system', t('voice.error', { message }), [], { reveal: 'none' });
    },
  });

  // V toggles voice from anywhere (App dispatches the event on the shortcut).
  useEffect(() => {
    const onToggle = () => voice.toggle();
    window.addEventListener('ft:voice-toggle', onToggle);
    return () => window.removeEventListener('ft:voice-toggle', onToggle);
  }, [voice]);

  const voiceAvailable = commands.voiceProvider === 'webspeech' ? speechRecognitionCtor() !== null : true;

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

      const handlers: RouteHandlers = {
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
      };
      const ownKey = commands.payMode === 'own' ? readOwnKey() : '';
      if (ownKey) {
        // Bring your own key: browser -> OpenRouter directly; our router never sees the key.
        await streamDirect({ boxId: box.id, text, chips, history }, { apiKey: ownKey, referer: window.location.origin }, handlers);
      } else {
        // Never POST to a static host: a missing router used to surface as "HTTP 405".
        const health = await probeRouter();
        if (health.state !== 'ok') {
          store.updateLine(reply.id, '', false);
          store.appendLine(box.id, 'system', t('system.noRouterDeployed'), [], { reveal: 'none', component: 'no-router' });
          setBusy(false);
          return;
        }
        await streamRoute({ boxId: box.id, text, chips, history }, handlers);
      }
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
        modelTagger={commands.modelTagger}
        voice={voice}
        voiceMode={commands.voiceMode}
        voiceAvailable={voiceAvailable}
        voiceAppend={voiceAppend}
        onVoiceAppendConsumed={() => setVoiceAppend(null)}
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
  modelTagger: boolean;
  voice: VoiceControls;
  voiceMode: 'toggle' | 'hold';
  voiceAvailable: boolean;
  voiceAppend: string | null;
  onVoiceAppendConsumed: () => void;
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
      modelTagger={props.modelTagger}
      voice={props.voice}
      voiceMode={props.voiceMode}
      voiceAvailable={props.voiceAvailable}
      voiceAppend={props.voiceAppend}
      onVoiceAppendConsumed={props.onVoiceAppendConsumed}
      hasBoxes={props.hasBoxes}
      hasLines={props.hasLines}
      busy={props.busy}
      onSend={props.onSend}
    />,
    target,
  );
}
