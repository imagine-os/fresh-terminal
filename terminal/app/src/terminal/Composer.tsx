import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { localTagger, type Chip } from '@shared/chips';
import type { CursorSpec } from '@shared/themes';
import { useI18n } from '../i18n';
import { mergeChips, tagRemote } from '../lib/modelTagger';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { IconMic, IconSend } from '../ui/icons';
import type { VoiceControls } from '../voice/useVoice';
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
  voice: VoiceControls;
  voiceMode: 'toggle' | 'hold';
  voiceAvailable: boolean;
  /** Text arriving from a final voice transcript to append to the draft. */
  voiceAppend: string | null;
  onVoiceAppendConsumed: () => void;
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
export function Composer({
  boxId,
  cursor,
  themeId,
  modelTagger = false,
  hasBoxes,
  hasLines,
  busy,
  onSend,
  onActivity,
  voice,
  voiceMode,
  voiceAvailable,
  voiceAppend,
  onVoiceAppendConsumed,
}: Props) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A final voice transcript lands in the draft, separated by a space.
  useEffect(() => {
    if (voiceAppend === null) {
      return;
    }
    setText((current) => (current.trim().length > 0 ? `${current.trimEnd()} ${voiceAppend}` : voiceAppend));
    onVoiceAppendConsumed();
    textareaRef.current?.focus();
  }, [voiceAppend, onVoiceAppendConsumed]);

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


  const send = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) {
      return;
    }
    onSend(trimmed, localTagger.tag(trimmed));
    setText('');
    textareaRef.current?.focus();
  }, [text, busy, onSend]);

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
            {text.length > 0 ? <ChipText text={text} chips={chips} cursor={focused && !voice.interim} /> : null}
            {voice.interim ? (
              <span className="interim" data-testid="interim">
                {text.length > 0 ? ' ' : ''}
                {voice.interim}
                {focused ? <span className="cursor" /> : null}
              </span>
            ) : text.length === 0 && focused ? (
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
          {voice.active ? <Waveform level={voice.level} state={voice.state} /> : null}
          {voiceAvailable ? (
            <Tooltip
              label={voice.active ? t('voice.stop') : voiceMode === 'hold' ? t('voice.hold') : t('voice.start')}
              shortcut="V"
              side="top"
              align="end"
            >
              <Button
                icon
                variant="ghost"
                className="mic"
                data-listening={voice.active}
                data-state={voice.state}
                aria-pressed={voice.active}
                aria-label={voice.active ? t('voice.stop') : t('voice.start')}
                onClick={voiceMode === 'toggle' ? voice.toggle : undefined}
                onPointerDown={voiceMode === 'hold' ? voice.start : undefined}
                onPointerUp={voiceMode === 'hold' ? voice.stop : undefined}
                onPointerCancel={voiceMode === 'hold' ? voice.stop : undefined}
                onKeyDown={
                  voiceMode === 'hold'
                    ? (event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                          event.preventDefault();
                          voice.start();
                        }
                      }
                    : undefined
                }
                onKeyUp={
                  voiceMode === 'hold'
                    ? (event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                          voice.stop();
                        }
                      }
                    : undefined
                }
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
          {voice.active && voice.state !== 'idle' ? (
            <Tooltip label={voice.muted ? t('voice.unmute') : t('voice.mute')} side="top" align="end">
              <Button icon variant="ghost" aria-pressed={voice.muted} aria-label={voice.muted ? t('voice.unmute') : t('voice.mute')} onClick={() => voice.setMuted(!voice.muted)}>
                {voice.muted ? '🔇' : '🔊'}
              </Button>
            </Tooltip>
          ) : null}
          <Tooltip label={t('composer.send')} shortcut="↵" side="top" align="end">
            <Button icon variant="primary" aria-label={t('composer.send')} onClick={send} disabled={busy || text.trim().length === 0}>
              <IconSend />
            </Button>
          </Tooltip>
        </div>
      </div>
      <audio ref={voice.audioRef} autoPlay data-testid="assistant-audio" />
      <div className="composer-hint">
        <span>{voice.active ? t(voice.state === 'connecting' ? 'voice.connecting' : voice.state === 'speaking' ? 'voice.speaking' : 'voice.listening') : t('composer.hint')}</span>
        <span>
          {chips.length} {t('composer.chips')}
        </span>
      </div>
    </div>
  );
}

function Waveform({ level, state }: { level: number; state: string }) {
  const bars = [0.4, 0.7, 1, 0.7, 0.4];
  return (
    <span className="wave" data-state={state} aria-hidden="true">
      {bars.map((weight, index) => (
        <span key={index} style={{ transform: `scaleY(${0.15 + Math.min(1, level * 2.2) * weight})` }} />
      ))}
    </span>
  );
}
