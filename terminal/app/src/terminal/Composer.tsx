import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { localTagger, type Chip } from '@shared/chips';
import type { CursorSpec } from '@shared/themes';
import { useI18n } from '../i18n';
import { mergeChips, tagRemote } from '../lib/modelTagger';
import { useSpeech } from '../lib/speech';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { IconMic, IconSend } from '../ui/icons';
import { ChipText } from './ChipText';
import { SuggestionStrip } from './SuggestionStrip';

interface Props {
  boxId: string;
  cursor: CursorSpec;
  themeId: string;
  /** Dev toggle: also ask the model tagger tier on keystroke pause. */
  modelTagger?: boolean;
  hasBoxes: boolean;
  hasLines: boolean;
  busy: boolean;
  onSend: (text: string, chips: Chip[]) => void;
  onActivity?: () => void;
}

export interface ComposerHandle {
  focus: () => void;
}

/**
 * Typewriter composer. Anchored at the bottom of its region; grows upward as
 * you type (auto-height, capped by --composer-max). Enter sends, Shift+Enter
 * inserts a newline. A mirror layer paints chips and the theme cursor over
 * the real textarea, which keeps native editing, IME and accessibility.
 */
export function Composer({ boxId, cursor, themeId, modelTagger = false, hasBoxes, hasLines, busy, onSend, onActivity }: Props) {
  const { t, lang } = useI18n();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const spokenBase = useRef('');

  const localChips = useMemo<Chip[]>(() => localTagger.tag(text), [text]);
  const [remoteChips, setRemoteChips] = useState<Chip[]>([]);
  const chips = useMemo<Chip[]>(() => (modelTagger ? mergeChips(localChips, remoteChips) : localChips), [localChips, remoteChips, modelTagger]);

  useEffect(() => {
    if (!modelTagger || text.trim().length < 4) {
      setRemoteChips([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void tagRemote(text, controller.signal).then((found) => {
        if (!controller.signal.aborted) {
          setRemoteChips(found);
        }
      });
    }, 600);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, modelTagger]);

  const resize = useCallback(() => {
    const element = textareaRef.current;
    if (element === null) {
      return;
    }
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  useEffect(() => {
    setText('');
    textareaRef.current?.focus();
  }, [boxId]);

  const onSpeech = useCallback(
    (spoken: string, final: boolean) => {
      const base = spokenBase.current;
      const joined = base ? `${base} ${spoken}` : spoken;
      setText(joined);
      if (final) {
        spokenBase.current = joined;
      }
    },
    [],
  );
  const speech = useSpeech(lang, onSpeech);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) {
      return;
    }
    onSend(trimmed, localTagger.tag(trimmed));
    setText('');
    spokenBase.current = '';
    speech.stop();
    textareaRef.current?.focus();
  }, [text, busy, onSend, speech]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  const showSuggestions = focused && text.trim().length === 0;

  return (
    <div className="composer" data-testid="composer">
      <SuggestionStrip
        visible={showSuggestions}
        hasBoxes={hasBoxes}
        hasLines={hasLines}
        themeId={themeId}
        onPick={(picked) => {
          setText(picked);
          textareaRef.current?.focus();
        }}
      />
      <div className="composer-frame">
        <div className="composer-stack">
          <div className="composer-mirror" aria-hidden="true" data-testid="composer-mirror">
            {text.length > 0 ? (
              <ChipText text={text} chips={chips} cursor={focused} />
            ) : focused ? (
              <span className="cursor" />
            ) : null}
          </div>
          <textarea
            ref={textareaRef}
            className="composer-input"
            data-cursor-shape={cursor.shape}
            rows={1}
            value={text}
            placeholder={t('composer.placeholder')}
            aria-label={t('composer.placeholder')}
            onChange={(event) => {
              setText(event.target.value);
              spokenBase.current = event.target.value;
              onActivity?.();
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              onActivity?.();
            }}
            onBlur={() => setFocused(false)}
            autoFocus
          />
        </div>
        <div className="composer-tools">
          {speech.available ? (
            <Tooltip label={speech.listening ? t('composer.micStop') : t('composer.mic')} side="top" align="end">
              <Button
                icon
                variant="ghost"
                className="mic"
                data-listening={speech.listening}
                aria-pressed={speech.listening}
                aria-label={speech.listening ? t('composer.micStop') : t('composer.mic')}
                onClick={speech.toggle}
                data-testid="mic"
              >
                <IconMic />
              </Button>
            </Tooltip>
          ) : (
            <Tooltip label={t('composer.micUnavailable')} side="top" align="end">
              <Button icon variant="ghost" className="mic" aria-label={t('composer.micUnavailable')} disabled data-testid="mic">
                <IconMic />
              </Button>
            </Tooltip>
          )}
          <Tooltip label={t('composer.send')} shortcut="↵" side="top" align="end">
            <Button icon variant="primary" aria-label={t('composer.send')} onClick={send} disabled={busy || text.trim().length === 0}>
              <IconSend />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="composer-hint">
        <span>{t('composer.hint')}</span>
        <span>
          {chips.length} {t('composer.chips')}
        </span>
      </div>
    </div>
  );
}
