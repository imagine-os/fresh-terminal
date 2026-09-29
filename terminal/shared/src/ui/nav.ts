import type { NavItem } from './types';

export interface NavNode {
  item: NavItem;
  children: NavNode[];
}

function byOrder(a: NavItem, b: NavItem): number {
  return a.order - b.order || a.created_at - b.created_at || a.id.localeCompare(b.id);
}

/** Builds the nested tree. Orphans (missing parent) surface at the top level. */
export function buildNavTree(items: NavItem[]): NavNode[] {
  const ids = new Set(items.map((item) => item.id));
  const childrenOf = new Map<string | null, NavItem[]>();
  for (const item of items) {
    const parent = item.parent_id !== null && ids.has(item.parent_id) ? item.parent_id : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(item);
    childrenOf.set(parent, list);
  }
  const build = (parent: string | null, depth: number): NavNode[] =>
    (childrenOf.get(parent) ?? [])
      .sort(byOrder)
      .map((item) => ({ item, children: depth > 8 ? [] : build(item.id, depth + 1) }));
  return build(null, 0);
}

/** The item and every descendant, parents first. */
export function subtree(items: NavItem[], rootId: string): NavItem[] {
  const out: NavItem[] = [];
  const visit = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }
    out.push(item);
    for (const child of items.filter((candidate) => candidate.parent_id === id)) {
      visit(child.id);
    }
  };
  visit(rootId);
  return out;
}

export function pathLabel(items: NavItem[], id: string): string {
  const parts: string[] = [];
  let current = items.find((item) => item.id === id);
  let guard = 0;
  while (current && guard < 10) {
    parts.unshift(current.label);
    current = current.parent_id ? items.find((item) => item.id === current?.parent_id) : undefined;
    guard += 1;
  }
  return parts.join(' › ');
}
