import type { Block, Page } from '@shared/ui';
import { useI18n } from '../i18n';
import { useStoreSnapshot } from '../store';
import { Reveal } from '../ui/Reveal';

function runAction(id: string): void {
  window.dispatchEvent(new CustomEvent('ft:action', { detail: { id } }));
}

function BlockView({ block, pages, depth }: { block: Block; pages: Page[]; depth: number }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = (`h${Math.min(3, block.level) + 0}` as 'h1' | 'h2' | 'h3');
      return <Tag className={`pb-heading pb-h${block.level}`}>{block.text}</Tag>;
    }
    case 'text':
      return <p className="pb-text">{block.text}</p>;
    case 'list':
      return (
        <ul className="rb-list">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    case 'card':
      return (
        <div className="tile pb-card">
          <b>{block.title}</b>
          {block.body ? <p>{block.body}</p> : null}
        </div>
      );
    case 'button':
      return (
        <button type="button" className="btn" data-variant="primary" onClick={() => runAction(block.action)}>
          {block.label}
        </button>
      );
    case 'table':
      return (
        <div className="rb-table-wrap">
          <table className="table">
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
    case 'image':
      return <img className="pb-image" src={block.url} alt={block.alt} loading="lazy" />;
    case 'embed': {
      const inner = pages.find((page) => page.id === block.page || page.title.toLowerCase() === block.page.toLowerCase());
      if (!inner || depth > 1) {
        return <p className="rb-note">{block.page}</p>;
      }
      return (
        <div className="pb-embed">
          {inner.blocks.map((child, index) => (
            <BlockView key={index} block={child} pages={pages} depth={depth + 1} />
          ))}
        </div>
      );
    }
  }
}

/** A page in this box, made of blocks. Pages change only through ops. */
export function PageView({ pageId }: { pageId: string }) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const page = snapshot.pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return <p className="rb-note">{t('page.missing')}</p>;
  }
  const pages = snapshot.pages.filter((candidate) => candidate.box_id === page.box_id);
  return (
    <Reveal key={`${page.id}:${page.updated_at}`} pattern="beam-horizontal">
      <article className="page-view" data-testid="page-view">
        {page.blocks.length === 0 ? <h1 className="pb-heading pb-h1">{page.title}</h1> : null}
        {page.blocks.map((block, index) => (
          <BlockView key={index} block={block} pages={pages} depth={0} />
        ))}
      </article>
    </Reveal>
  );
}
