import { useRef, useState, type KeyboardEvent } from 'react';
import { buildNavTree, type NavItem, type NavNode, type NavTarget } from '@shared/ui';
import { useI18n } from '../i18n';

interface Props {
  items: NavItem[];
  onActivate: (target: NavTarget, item: NavItem) => void;
}

/**
 * The box's sidebar menu, nested to any depth. A tree: Up/Down move, Right
 * expands (or enters), Left collapses (or goes to the parent), Enter/Space
 * activates. Every row is a 44px button, so touch and mouse work the same.
 */
export function NavTree({ items, onActivate }: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const root = useRef<HTMLUListElement>(null);
  const tree = buildNavTree(items);

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-nav-row]') ?? [])];

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, node: NavNode) => {
    const list = rows();
    const index = list.indexOf(event.currentTarget);
    const hasChildren = node.children.length > 0;
    const open = hasChildren && !collapsed.has(node.item.id);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      list[Math.min(list.length - 1, index + 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      list[Math.max(0, index - 1)]?.focus();
    } else if (event.key === 'ArrowRight' && hasChildren) {
      event.preventDefault();
      if (!open) toggle(node.item.id);
      else list[index + 1]?.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (open) toggle(node.item.id);
      else if (node.item.parent_id) root.current?.querySelector<HTMLButtonElement>(`[data-nav-id="${node.item.parent_id}"]`)?.focus();
    }
  };

  const renderNode = (node: NavNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const open = hasChildren && !collapsed.has(node.item.id);
    return (
      <li key={node.item.id} role="none">
        <button
          type="button"
          role="treeitem"
          className="nav-row"
          data-nav-row=""
          data-nav-id={node.item.id}
          data-testid={`nav-${node.item.label.toLowerCase().replace(/\s+/g, '-')}`}
          aria-level={depth + 1}
          aria-expanded={hasChildren ? open : undefined}
          style={{ paddingInlineStart: `calc(0.5rem + ${depth} * 1.1rem)` }}
          title={node.item.label}
          onKeyDown={(event) => onKey(event, node)}
          onClick={() => {
            if (node.item.target) onActivate(node.item.target, node.item);
            else if (hasChildren) toggle(node.item.id);
          }}
        >
          <span className="nav-caret" aria-hidden="true">
            {hasChildren ? (open ? '▾' : '▸') : ''}
          </span>
          <span className="box-glyph nav-glyph" aria-hidden="true">
            {node.item.icon ?? node.item.label.slice(0, 1).toUpperCase()}
          </span>
          <span className="box-name">{node.item.label}</span>
        </button>
        {hasChildren && node.item.target ? (
          <button
            type="button"
            className="nav-expand"
            aria-label={open ? t('nav.collapse', { label: node.item.label }) : t('nav.expand', { label: node.item.label })}
            onClick={() => toggle(node.item.id)}
          >
            {open ? '−' : '+'}
          </button>
        ) : null}
        {open ? (
          <ul role="group" className="nav-group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  if (tree.length === 0) {
    return null;
  }
  return (
    <ul ref={root} className="nav-tree" role="tree" aria-label={t('nav.menu')} data-testid="nav-tree">
      {tree.map((node) => renderNode(node, 0))}
    </ul>
  );
}
