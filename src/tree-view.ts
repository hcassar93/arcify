import type { Bookmark } from "./model";
export interface TreeRow {
  node: Bookmark;
  depth: number;
  contextual: boolean;
}
export const PAGE_SIZE = 80;
/** Flatten only disclosed rows. Collapsed branches expose at most one active child. */
export function treeRows(
  children: Bookmark[],
  expanded: Set<string>,
  favourites: Set<string>,
  active: Set<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const activeChild = (nodes: Bookmark[]): Bookmark | undefined => {
    for (const n of nodes) {
      if (n.url && active.has(n.id) && !favourites.has(n.id)) return n;
      const child = activeChild(n.children ?? []);
      if (child) return child;
    }
    return undefined;
  };
  const visit = (nodes: Bookmark[], depth: number) => {
    for (const node of nodes) {
      if (node.url && favourites.has(node.id)) continue;
      rows.push({ node, depth, contextual: false });
      if (!node.url) {
        if (expanded.has(node.id)) visit(node.children ?? [], depth + 1);
        else {
          const child = activeChild(node.children ?? []);
          if (child)
            rows.push({ node: child, depth: depth + 1, contextual: true });
        }
      }
    }
  };
  visit(children, 0);
  return rows;
}
export function pageRange(
  length: number,
  page: number,
  size = PAGE_SIZE,
): { page: number; start: number; end: number; pages: number } {
  const pages = Math.max(1, Math.ceil(length / size));
  const safe = Math.max(0, Math.min(page, pages - 1));
  return {
    page: safe,
    start: safe * size,
    end: Math.min(length, (safe + 1) * size),
    pages,
  };
}
