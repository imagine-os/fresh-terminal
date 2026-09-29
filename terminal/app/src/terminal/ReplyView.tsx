import { formatMicro } from '@shared/ledger';
import type { Reply, ReplyBlock } from '@shared/reply';
import { useI18n } from '../i18n';
import { store, useStoreSnapshot } from '../store';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

const STEP_MARK = { done: '✓', active: '✱', todo: '○' } as const;

function insert(text: string): void {
  window.dispatchEvent(new CustomEvent('ft:composer-insert', { detail: { text } }));
}

function EditsBlock({ batchId, summary }: { batchId: string; summary: string }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const snapshot = useStoreSnapshot();
  const batch = snapshot.edits.find((candidate) => candidate.id === batchId);
  const undone = batch?.state === 'undone';
  return (
    <div className="rb-edits" data-state={undone ? 'undone' : 'applied'} data-testid="edits-block">
      <span className="rb-edits-text">{undone ? `${t('edits.undone')}: ${summary.replace(/^Edited: /, '')}` : summary}</span>
      {batch ? (
        <Button
          variant="ghost"
          className="rb-undo"
          data-testid={undone ? 'redo-button' : 'undo-button'}
          onClick={() => {
            const result = undone ? store.redo(batchId) : store.undo(batchId);
            if (!result.ok) {
              toast(result.reason);
            }
          }}
        >
          {undone ? t('edits.redo') : t('edits.undo')}
        </Button>
      ) : null}
    </div>
  );
}

function Block({ block }: { block: ReplyBlock }) {
  switch (block.kind) {
    case 'summary':
      return <p className="rb-summary">{block.text}</p>;
    case 'kv':
      return (
        <dl className="rb-kv">
          {block.rows.map((row, index) => (
            <div key={index} className="rb-kv-row">
              <dt>{row.key}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      );
    case 'table':
      return (
        <div className="rb-table-wrap">
          <table className="table rb-table">
            <thead>
              <tr>
                {block.columns.map((column, index) => (
                  <th key={index}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'steps':
      return (
        <ol className="rb-steps">
          {block.items.map((item, index) => (
            <li key={index} data-status={item.status}>
              <span aria-hidden="true">{STEP_MARK[item.status]}</span> {item.text}
            </li>
          ))}
        </ol>
      );
    case 'list':
      return (
        <ul className="rb-list">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre className="rb-code" data-lang={block.lang}>
          {block.lang ? <span className="rb-code-lang">{block.lang}</span> : null}
          <code>{block.code}</code>
        </pre>
      );
    case 'diff':
      return (
        <ul className="rb-diff" data-testid="diff-block">
          {block.rows.map((row, index) => (
            <li key={index}>
              <span className="rb-diff-label">{row.label}</span>{' '}
              {row.before !== null ? <del>{row.before}</del> : null}
              {row.before !== null && row.after !== null ? <span aria-hidden="true"> → </span> : null}
              {row.after !== null ? <ins>{row.after}</ins> : null}
            </li>
          ))}
        </ul>
      );
    case 'edits':
      return <EditsBlock batchId={block.batch_id} summary={block.summary} />;
    case 'next':
      return (
        <div className="rb-next" role="group" aria-label="next" data-testid="next-block">
          {block.commands.map((command, index) => (
            <button key={index} type="button" className="suggestion rb-next-chip" onClick={() => insert(command)}>
              › {command}
            </button>
          ))}
        </div>
      );
    case 'note':
      return <p className="rb-note">{block.text}</p>;
    case 'error':
      return <p className="rb-error">✗ {block.text}</p>;
    case 'text':
      return <p className="rb-text">{block.text}</p>;
  }
}

/** A super-CLI reply: header line, then typed blocks. */
export function ReplyView({ reply }: { reply: Reply }) {
  const { t } = useI18n();
  const meta = reply.meta;
  return (
    <div className="reply" data-testid="structured-reply">
      {meta ? (
        <div className="rb-header" data-testid="reply-header">
          <span>{meta.intent}</span>
          <span aria-hidden="true">·</span>
          <span>{meta.model || t('reply.local')}</span>
          <span aria-hidden="true">·</span>
          <span>{meta.ms >= 1000 ? `${(meta.ms / 1000).toFixed(1)}s` : `${Math.max(0, Math.round(meta.ms))}ms`}</span>
          <span aria-hidden="true">·</span>
          <span>{formatMicro(meta.cost_micro, 4)}</span>
        </div>
      ) : null}
      {reply.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

export function parseReply(json: string): Reply | null {
  if (!json) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as Reply;
    return Array.isArray(parsed.blocks) ? parsed : null;
  } catch {
    return null;
  }
}
