import type { Bookmark, Tab } from "./model";
export type SavedNode = Bookmark & { path: string };
/** Browser-event store. Untouched nodes retain identity; only affected subtrees change paths. */
export class BookmarkStore {
  readonly nodes = new Map<string, SavedNode>();
  readonly changed = new Set<string>();
  readonly removed = new Set<string>();
  roots: Bookmark[] = [];
  constructor(tree: Bookmark[] = []) {
    this.reset(tree);
  }
  reset(tree: Bookmark[]): void {
    for (const id of this.nodes.keys()) this.removed.add(id);
    this.nodes.clear();
    this.roots = structuredClone(tree);
    for (const n of this.roots) this.index(n, "");
  }
  private index(node: Bookmark, path: string): void {
    const saved = Object.assign(node, { path });
    this.nodes.set(node.id, saved);
    this.changed.add(node.id);
    this.removed.delete(node.id);
    for (const child of node.children ?? [])
      this.index(child, [path, node.title].filter(Boolean).join(" / "));
  }
  private siblings(parentId?: string): Bookmark[] {
    if (!parentId) return this.roots;
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error("Missing bookmark parent");
    return parent.children ?? (parent.children = []);
  }
  private reindex(children: Bookmark[]): void {
    children.forEach((n, index) => {
      if (n.index !== index) {
        n.index = index;
        this.changed.add(n.id);
      }
    });
  }
  create(node: Bookmark): void {
    if (this.nodes.has(node.id)) this.remove(node.id);
    const siblings = this.siblings(node.parentId);
    siblings.splice(
      Math.min(node.index ?? siblings.length, siblings.length),
      0,
      structuredClone(node),
    );
    const added = siblings.find((n) => n.id === node.id)!;
    const parent = this.nodes.get(node.parentId ?? "");
    this.index(
      added,
      parent ? [parent.path, parent.title].filter(Boolean).join(" / ") : "",
    );
    this.reindex(siblings);
  }
  update(id: string, change: { title?: string; url?: string }): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Missing bookmark");
    Object.assign(node, change);
    this.index(node, node.path);
  }
  remove(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const siblings = this.siblings(node.parentId);
    const i = siblings.findIndex((n) => n.id === id);
    if (i >= 0) siblings.splice(i, 1);
    const remove = (n: Bookmark) => {
      for (const child of n.children ?? []) remove(child);
      this.nodes.delete(n.id);
      this.changed.delete(n.id);
      this.removed.add(n.id);
    };
    remove(node);
    this.reindex(siblings);
  }
  move(id: string, parentId: string, index: number): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Missing moved bookmark");
    const old = this.siblings(node.parentId);
    old.splice(
      old.findIndex((n) => n.id === id),
      1,
    );
    this.reindex(old);
    node.parentId = parentId;
    const target = this.siblings(parentId);
    target.splice(Math.min(index, target.length), 0, node);
    this.reindex(target);
    const parent = this.nodes.get(parentId)!;
    this.index(node, [parent.path, parent.title].filter(Boolean).join(" / "));
  }
  reorder(parentId: string, ids: string[]): void {
    const siblings = this.siblings(parentId);
    const rank = new Map(ids.map((id, i) => [id, i]));
    siblings.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    this.reindex(siblings);
  }
  drain(): { changed: string[]; removed: string[] } {
    const value = { changed: [...this.changed], removed: [...this.removed] };
    this.changed.clear();
    this.removed.clear();
    return value;
  }
}
export class TabStore {
  readonly nodes = new Map<number, Tab>();
  readonly changed = new Set<number>();
  readonly removed = new Set<number>();
  constructor(tabs: Tab[] = []) {
    for (const tab of tabs) this.upsert(tab);
  }
  upsert(tab: Tab): void {
    if (tab.id === undefined) return;
    this.nodes.set(tab.id, { ...tab });
    this.changed.add(tab.id);
    this.removed.delete(tab.id);
  }
  insert(tab: Tab): void {
    if (tab.id === undefined) return;
    const siblings = [...this.nodes.values()]
      .filter((t) => t.windowId === tab.windowId && t.id !== tab.id)
      .sort((a, b) => a.index - b.index);
    siblings.splice(Math.min(tab.index, siblings.length), 0, tab);
    siblings.forEach((t, index) => {
      if (t.id === tab.id || t.index !== index) this.upsert({ ...t, index });
    });
  }
  remove(id: number): void {
    const removed = this.nodes.get(id);
    this.nodes.delete(id);
    this.changed.delete(id);
    this.removed.add(id);
    if (removed)
      [...this.nodes.values()]
        .filter((t) => t.windowId === removed.windowId)
        .sort((a, b) => a.index - b.index)
        .forEach((t, index) => {
          if (t.index !== index) this.upsert({ ...t, index });
        });
  }
  activate(id: number, windowId: number): void {
    for (const tab of this.nodes.values())
      if (tab.windowId === windowId && tab.active !== (tab.id === id))
        this.upsert({ ...tab, active: tab.id === id });
  }
  move(id: number, windowId: number, index: number): void {
    const tab = this.nodes.get(id);
    if (!tab) return;
    const siblings = [...this.nodes.values()]
      .filter((t) => t.windowId === windowId && t.id !== id)
      .sort((a, b) => a.index - b.index);
    siblings.splice(index, 0, { ...tab, windowId });
    siblings.forEach((t, index) => {
      if (t.index !== index || t.id === id) this.upsert({ ...t, index });
    });
  }
  drain(): { changed: number[]; removed: number[] } {
    const value = { changed: [...this.changed], removed: [...this.removed] };
    this.changed.clear();
    this.removed.clear();
    return value;
  }
}
