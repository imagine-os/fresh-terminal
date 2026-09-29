import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  value: string;
  onCommit: (value: string) => void;
  /** Accessible label for the edit control ("Rename stage"). */
  label: string;
  /** 'click' edits on a click (the top bar); 'dblclick' keeps a single click for the row's own action (the sidebar). */
  activateOn?: 'click' | 'dblclick';
  className?: string;
  testId?: string;
}

/**
 * A name you click to edit in place (C-091). Enter saves, Escape cancels,
 * blur saves. Blank stays as it was. Nothing else on screen moves.
 */
export function InlineName({ value, onCommit, label, activateOn = 'click', className = '', testId }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const clean = draft.trim();
    if (clean.length > 0 && clean !== value) onCommit(clean);
    setEditing(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`inline-name-input ${className}`.trim()}
        value={draft}
        aria-label={label}
        maxLength={80}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    );
  }
  const start = (event: React.MouseEvent) => {
    event.stopPropagation();
    setEditing(true);
  };
  return (
    <button
      type="button"
      className={`inline-name ${className}`.trim()}
      title={label}
      aria-label={`${label}: ${value}`}
      onClick={activateOn === 'click' ? start : undefined}
      onDoubleClick={activateOn === 'dblclick' ? start : undefined}
      data-testid={testId}
    >
      {value}
    </button>
  );
}
