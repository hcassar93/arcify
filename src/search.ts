import { enteredURL } from "./navigation";
export type Kind = "tab" | "bookmark" | "folder" | "command" | "url";
export interface Entry {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  windowId?: number;
  tabId?: number;
  url?: string;
  aliases?: string;
  recent?: number;
  open?: boolean;
}
interface Indexed {
  entry: Entry;
  title: string;
  other: string;
}
const norm = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
export function score(title: string, other: string, query: string): number {
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(query))) return 2;
  if (title.includes(query)) return 3;
  if (other.includes(query)) return 4;
  let p = 0;
  for (const c of title) if (c === query[p]) p++;
  return p === query.length ? 5 : Infinity;
}
export class SearchIndex {
  private entries = new Map<string, Indexed>();
  replace(entries: Entry[]): void {
    this.entries.clear();
    this.upsert(entries);
  }
  upsert(entries: Entry[]): void {
    for (const entry of entries) {
      const key = entry.kind + ":" + entry.id;
      const previous = this.entries.get(key);
      if (
        previous &&
        previous.entry.title === entry.title &&
        previous.entry.detail === entry.detail &&
        previous.entry.aliases === entry.aliases
      )
        previous.entry = entry;
      else
        this.entries.set(key, {
          entry,
          title: norm(entry.title),
          other: norm(entry.detail + " " + (entry.aliases ?? "")),
        });
    }
  }

  remove(kind: Kind, id: string): void {
    this.entries.delete(kind + ":" + id);
  }
  query(raw: string, windowId: number, activeId?: number): Entry[] {
    const prefix = raw[0];
    const kind =
      prefix === ">"
        ? "command"
        : prefix === "@"
          ? "tab"
          : prefix === "#"
            ? "bookmark"
            : null;
    const q = norm(kind ? raw.slice(1).trim() : raw.trim());
    const all = [...this.entries.values()];
    if (!q && !kind) {
      return [
        ...all
          .filter((x) => x.entry.kind === "tab" && x.entry.tabId !== activeId)
          .sort((a, b) => (a.entry.recent ?? 1e9) - (b.entry.recent ?? 1e9))
          .slice(0, 5)
          .map((x) => x.entry),
        ...all
          .filter(
            (x) =>
              x.entry.kind === "command" &&
              ["new-tab", "toggle-sidebar", "fullscreen"].includes(x.entry.id),
          )
          .map((x) => x.entry),
      ];
    }
    const results = all
      .filter(
        (x) =>
          !kind ||
          x.entry.kind === kind ||
          (kind === "bookmark" && x.entry.kind === "folder"),
      )
      .map((x) => ({
        entry: x.entry,
        score: q ? score(x.title, x.other, q) : 0,
      }))
      .filter((x) => Number.isFinite(x.score))
      .sort(
        (a, b) =>
          a.score - b.score ||
          Number(b.entry.open ?? false) - Number(a.entry.open ?? false) ||
          Number(b.entry.windowId === windowId) -
            Number(a.entry.windowId === windowId) ||
          (a.entry.recent ?? 1e9) - (b.entry.recent ?? 1e9) ||
          a.entry.title.localeCompare(b.entry.title) ||
          a.entry.id.localeCompare(b.entry.id),
      )
      .slice(0, 80)
      .map((x) => x.entry);
    const seen = new Set<number>();
    const unique = results.filter((e) => {
      if (e.tabId === undefined) return true;
      if (seen.has(e.tabId)) return false;
      seen.add(e.tabId);
      return true;
    });
    const url = !kind ? enteredURL(raw) : null;
    if (url)
      unique.unshift({
        id: url,
        kind: "url",
        title: "Open " + url,
        detail: url,
        url,
      });
    return unique;
  }
}
