import { canonical } from "./navigation";
import type { Bookmark, Session, Tab } from "./model";
export function exactMatch(
  url: string,
  tabs: Tab[],
  mru: number[],
): Tab | undefined {
  const key = canonical(url);
  if (!key) return;
  return tabs
    .filter((t) => canonical(t.url ?? "") === key)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        (mru.indexOf(a.id!) < 0 ? 1e9 : mru.indexOf(a.id!)) -
          (mru.indexOf(b.id!) < 0 ? 1e9 : mru.indexOf(b.id!)) ||
        a.index - b.index,
    )[0];
}
export function resolve(
  bookmark: Bookmark,
  windowId: number,
  tabs: Tab[],
  session: Session,
): Tab | undefined {
  const current = tabs.filter((t) => t.windowId === windowId);
  return (
    current.find(
      (t) => t.id === session.associations[String(windowId)]?.[bookmark.id],
    ) ?? exactMatch(bookmark.url ?? "", current, session.mru)
  );
}
/** One visible owner per live tab, favourites before native tree order. Extra live duplicates remain ordinary tabs. */
export function owners(
  bookmarks: Bookmark[],
  favourites: string[],
  windowId: number,
  tabs: Tab[],
  session: Session,
): Map<number, string> {
  const lookup = resolutionIndex(windowId, tabs, session);
  const ordered = [
    ...favourites
      .map((id) => bookmarks.find((b) => b.id === id))
      .filter((b): b is Bookmark => !!b),
    ...bookmarks.filter((b) => !favourites.includes(b.id)),
  ];
  const result = new Map<number, string>();
  for (const b of ordered) {
    if (!b.url) continue;
    const t = lookup(b);
    if (t?.id !== undefined && !result.has(t.id)) result.set(t.id, b.id);
  }
  return result;
}
export interface ResolverAdapter {
  tabs(): Promise<Tab[]>;
  activate(id: number): Promise<void>;
  create(url: string, windowId: number): Promise<Tab>;
}
export class SavedResolver {
  private pending = new Map<string, Promise<Tab>>();
  constructor(
    private adapter: ResolverAdapter,
    private session: Session,
    private save: () => Promise<void>,
  ) {}
  activate(b: Bookmark, w: number, fresh = false): Promise<Tab> {
    const key = w + ":" + b.id;
    if (!fresh && this.pending.has(key)) return this.pending.get(key)!;
    const job = this.perform(b, w, fresh);
    if (!fresh) {
      this.pending.set(key, job);
      void job.finally(() => this.pending.delete(key)).catch(() => {});
    }
    return job;
  }
  private async perform(b: Bookmark, w: number, fresh: boolean): Promise<Tab> {
    if (!b.url || !canonical(b.url))
      throw new Error("This saved destination is unsupported.");
    const match = fresh
      ? undefined
      : resolve(b, w, await this.adapter.tabs(), this.session);
    if (match?.id !== undefined) {
      await this.adapter.activate(match.id);
      this.session.associations[w] ??= {};
      this.session.associations[w][b.id] = match.id;
      await this.save();
      return match;
    }
    const tab = await this.adapter.create(b.url, w);
    if (!fresh && tab.id !== undefined) {
      this.session.associations[w] ??= {};
      this.session.associations[w][b.id] = tab.id;
      await this.save();
    }
    return tab;
  }
}
/** One canonical tab index per snapshot, rather than reparsing every tab for every bookmark. */
export function resolutionIndex(
  windowId: number,
  tabs: Tab[],
  session: Session,
): (b: Bookmark) => Tab | undefined {
  const current = tabs.filter((t) => t.windowId === windowId),
    byId = new Map(current.map((t) => [t.id, t]));
  const recency = new Map(session.mru.map((id, index) => [id, index]));
  const sorted = [...current].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (recency.get(a.id!) ?? 1e9) - (recency.get(b.id!) ?? 1e9) ||
      a.index - b.index,
  );
  const byURL = new Map<string, Tab>();
  for (const tab of sorted) {
    const key = canonical(tab.url ?? "");
    if (key && !byURL.has(key)) byURL.set(key, tab);
  }
  return (b) =>
    byId.get(session.associations[windowId]?.[b.id]) ??
    byURL.get(canonical(b.url ?? "") ?? "");
}
