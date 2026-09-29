import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localTagger, type Chip } from '@shared/chips';
import type { Change, Op } from '@shared/ops';
import type { Reply, ReplyBlock, ReplyMeta } from '@shared/reply';
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
import type { GlossaryTerm } from '@shared/ui';
import type { ChipDecision, ChipRecords } from './ChipPopover';
import { Composer } from './Composer';
import { looksLikeSkinRequest } from '@shared/skins';
import { startSkinRun } from '../skins/runner';
import { Doodles } from './Doodles';
import { Transcript } from './Transcript';
import { PageView } from '../pages/PageView';
import { downloadSession } from '../lib/exportSession';
import { FirstRun } from './FirstRun';
import { creditsSnapshot, reportCreditsError } from '../credits';

export interface AppCommands {
  setLang: (lang: 'en' | 'es') => void;
  /** The layout text in effect for this box. */
  dialectText: string;
  /** The theme in effect for this box (its own, or the visitor default). */
  effectiveThemeId: string;
  openPage: (pageId: string) => void;
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
  /** A page of this box shown in the stage instead of the transcript; the composer stays. */
  pageId?: string | null;
  /** Sending from a page returns to the transcript so the reply is seen. */
  onLeavePage?: () => void;
  showNewBoxDoodle: boolean;
  onOpenBox: (id: string) => void;
  commands: AppCommands;
}

/** Turns applied changes into a diff block (before → after per record). */
function sentences(text: string): string[] {
  return text
    .split(/(?<=\.)\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Multi-sentence values (the layout) show only the sentences that changed. */
function diffRows(change: Change): Array<{ label: string; before: string | null; after: string | null }> {
  const clip = (value: string | null) => (value === null ? null : value.slice(0, 400));
  if (change.before !== null && change.after !== null) {
    const before = sentences(change.before);
    const after = sentences(change.after);
    if (before.length > 1 || after.length > 1) {
      const removed = before.filter((line) => !after.includes(line));
      const added = after.filter((line) => !before.includes(line));
      const count = Math.max(removed.length, added.length);
      return Array.from({ length: count }, (_, index) => ({
        label: change.region,
        before: clip(removed[index] ?? null),
        after: clip(added[index] ?? null),
      }));
    }
  }
  return [{ label: change.region, before: clip(change.before), after: clip(change.after) }];
}

function diffBlock(changes: Change[]): ReplyBlock | null {
  const rows = changes
    .filter((change) => change.before !== null || change.after !== null)
    .flatMap(diffRows)
    .slice(0, 30);
  return rows.length > 0 ? { kind: 'diff', rows } : null;
}

/** Orders a reply: model blocks, then diff and edits, then next last. */
function assemble(meta: ReplyMeta | null, modelBlocks: ReplyBlock[], batch: { id: string; summary: string; changes: Change[] } | null, extra: ReplyBlock[] = []): Reply {
  const next = modelBlocks.filter((block) => block.kind === 'next');
  const rest = modelBlocks.filter((block) => block.kind !== 'next');
  const blocks: ReplyBlock[] = [...rest, ...extra];
  if (batch) {
    const diff = diffBlock(batch.changes);
    if (diff) blocks.push(diff);
    blocks.push({ kind: 'edits', batch_id: batch.id, summary: batch.summary });
  }
  blocks.push(...next);
  return { meta, blocks };
}

/**
 * The terminal: transcript above, composer below. Used for both `/` (landing,
 * with the one-line headline and the how-it-works row) and `/box/:id`.
 */
export function BoxView({ box, theme, landing, showNewBoxDoodle, onOpenBox, commands, pageId = null, onLeavePage }: Props) {
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

  const records = useMemo<ChipRecords>(
    () => ({
      pages: snapshot.pages.filter((page) => page.box_id === box.id).map((page) => ({ id: page.id, title: page.title })),
      nav: snapshot.navItems.filter((item) => item.box_id === box.id).map((item) => ({ id: item.id, label: item.label })),
      themes: snapshot.themes.map((candidate) => ({ id: candidate.id, name: candidate.name })),
    }),
    [snapshot.pages, snapshot.navItems, snapshot.themes, box.id],
  );
  const glossary = useMemo(() => snapshot.glossary.filter((term) => term.box_id === box.id), [snapshot.glossary, box.id]);

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
      if (pageId) onLeavePage?.();
      store.appendLine(box.id, 'user', text, chips);

      // Skins and materials run the refine loop (pass 5).
      if (looksLikeSkinRequest(text)) {
        const line = store.appendLine(box.id, 'assistant', text, []);
        void startSkinRun({ boxId: box.id, text, lineId: line.id });
        return;
      }

      const localStarted = performance.now();
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
            store.appendLine(box.id, 'system', t(local.key, local.vars ?? {}), [], {
              reveal: local.reveal,
              reply: { meta: { intent: 'local', model: '', ms: performance.now() - localStarted, cost_micro: 0, source: 'local' }, blocks: [] },
            });
            return;
          case 'text':
            store.appendLine(box.id, 'assistant', local.text, [], {
              reveal: local.reveal,
              // A header line only (no blocks): the transcript keeps the plain text and its reveal.
              reply: { meta: { intent: 'local', model: '', ms: performance.now() - localStarted, cost_micro: 0, source: 'local' }, blocks: [] },
            });
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
              { component: local.component, reveal: local.reveal, reply: { meta: { intent: 'draw', model: '', ms: performance.now() - localStarted, cost_micro: 0, source: 'local' }, blocks: [] } },
            );
            return;
          case 'ops': {
            const started = performance.now();
            const applied = store.applyOps(box.id, local.ops, 'local');
            const meta: ReplyMeta = { intent: 'edit_ui', model: '', ms: performance.now() - started, cost_micro: 0, source: 'local' };
            if (!applied.ok) {
              store.appendLine(box.id, 'assistant', applied.reason, [], { reply: { meta, blocks: [{ kind: 'error', text: applied.reason }] } });
              return;
            }
            store.appendLine(box.id, 'assistant', applied.batch.summary, [], {
              reply: assemble(meta, [{ kind: 'summary', text: applied.batch.summary.replace(/^Edited: /, '') }], applied.batch),
            });
            if (local.openPage) {
              const page = store.getSnapshot().pages.find((candidate) => candidate.box_id === box.id && candidate.title === local.openPage);
              if (page) commands.openPage(page.id);
            }
            return;
          }
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
      let replyLineId: string | null = null;
      try {
        const started = performance.now();
        const startedAt = Date.now();
        const reply = store.appendLine(box.id, 'assistant', '', []);
        replyLineId = reply.id;
        let assembled = '';
        let modelBlocks: ReplyBlock[] = [];
        let batch: { id: string; summary: string; changes: Change[] } | null = null;
        const extra: ReplyBlock[] = [];
        let intent = 'chat';
        let skinRequested = false;
        const promptText = text;
        const history = lines
          .filter((line) => line.kind !== 'system')
          .slice(-12)
          .map((line) => ({ role: line.kind as 'user' | 'assistant', content: line.text }));
        const boxSnapshot = store.snapshotFor(box.id, commands.effectiveThemeId);

        const handlers: RouteHandlers = {
          onMeta: (meta) => {
            intent = meta.routing?.intent ?? meta.route.intent;
          },
          onDelta: (delta) => {
            assembled += delta;
            store.updateLine(reply.id, assembled, true);
          },
          onOps: (payload) => {
            if (payload.ops.length === 0) {
              if (payload.rejected.length > 0) {
                extra.push({ kind: 'error', text: payload.rejected.join('; ').slice(0, 600) });
              }
              return;
            }
            const applied = store.applyOps(box.id, payload.ops as Op[], 'assistant');
            if (applied.ok) {
              batch = { id: applied.batch.id, summary: applied.batch.summary, changes: applied.batch.changes };
            } else {
              extra.push({ kind: 'error', text: `Not applied: ${applied.reason}` });
            }
          },
          onReply: (blocks) => {
            modelBlocks = blocks;
          },
          onSkin: () => {
            skinRequested = true;
          },
          onDone: (done) => {
            if (done.entry) {
              const { owner_identity: _ignored, ...draft } = done.entry;
              store.appendEntry(draft);
            }
            if (skinRequested) {
              store.updateLine(reply.id, promptText, false);
              void startSkinRun({ boxId: box.id, text: promptText, lineId: reply.id });
              return;
            }
            const meta: ReplyMeta = {
              intent,
              model: done.served_model,
              ms: performance.now() - started,
              cost_micro: done.entry?.price_micro ?? 0,
            };
            const summaryText = modelBlocks.find((block) => block.kind === 'summary');
            const text = summaryText && summaryText.kind === 'summary' ? summaryText.text : assembled || batch?.summary || '';
            store.updateLine(reply.id, text, false);
            const blocks = modelBlocks.length > 0 ? modelBlocks : assembled ? [{ kind: 'summary', text: assembled.slice(0, 300) } as ReplyBlock] : [];
            store.setLineReply(reply.id, assemble(meta, blocks, batch, extra));
            // Free credits ran out and the router let this one through: say so, softly (1 of 2, 2 of 2).
            const soft = creditsSnapshot().lastSoftPrompt;
            if (soft && soft.at >= startedAt) {
              store.appendLine(box.id, 'system', t('credits.softPrompt', { n: String(soft.n), of: String(soft.of) }), []);
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
            } else if (failure.kind === 'credits') {
              reportCreditsError(failure.code, failure.message);
              message = t(`credits.${failure.code}` as 'credits.sign_in_required');
            } else {
              message = t('system.error', { message: failure.message });
            }
            store.appendLine(box.id, 'system', message, []);
          },
        };
        const ownKey = commands.payMode === 'own' ? readOwnKey() : '';
        if (ownKey) {
          // Bring your own key: browser -> OpenRouter directly; our router never sees the key.
          await streamDirect(
            { boxId: box.id, text, chips, history, snapshot: boxSnapshot },
            { apiKey: ownKey, referer: window.location.origin },
            handlers,
          );
        } else {
          // Never POST to a static host: a missing router used to surface as "HTTP 405".
          const health = await probeRouter();
          if (health.state !== 'ok') {
            store.updateLine(reply.id, '', false);
            store.appendLine(box.id, 'system', t('system.noRouterDeployed'), [], { reveal: 'none', component: 'no-router' });
            return;
          }
          await streamRoute({ boxId: box.id, text, chips, history, snapshot: boxSnapshot }, handlers);
        }
      } catch (error) {
        // Nothing may end in silence: a thrown turn leaves a visible line.
        if (replyLineId) store.updateLine(replyLineId, '', false);
        const message = error instanceof Error ? error.message : String(error);
        store.appendLine(box.id, 'system', t('system.turnFailed', { message: message.slice(0, 200) }), [], { reveal: 'none' });
      } finally {
        setBusy(false);
      }
    },
    [box.id, lines, snapshot.boxes, lang, t, onOpenBox, commands, pageId, onLeavePage],
  );

  return (
    <>
      <FirstRun onExport={() => downloadSession(box.id)} />
      {pageId ? (
        <PageView pageId={pageId} />
      ) : isEmpty ? (
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
            <a className="btn" data-variant="ghost" href={`${import.meta.env.BASE_URL}wiki/`}>
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
        records={records}
        glossary={glossary}
        onTeach={(term) => {
          const taught = store.applyOps(box.id, [{ op: 'glossary.add', text: term.text, type: term.type, note: term.note, case_sensitive: term.case_sensitive }], 'chip');
          if (taught.ok) {
            store.appendLine(box.id, 'system', taught.batch.summary, [], {
              reply: assemble(null, [], { id: taught.batch.id, summary: taught.batch.summary, changes: taught.batch.changes }),
            });
          }
        }}
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
  records: ChipRecords;
  glossary: GlossaryTerm[];
  onTeach: (term: NonNullable<ChipDecision['teach']>) => void;
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
      records={props.records}
      glossary={props.glossary}
      onTeach={props.onTeach}
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
