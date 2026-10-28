import { SearchIndex, type Entry } from "./search";
import { commands } from "./commands";
import { flatten, type Session, type Tab } from "./model";
import { canonical } from "./navigation";
import { resolutionIndex } from "./resolver";
import type { Snapshot } from "./browser";
/** Keeps text normalization stable while browser events update affected records. */
export class SearchCatalog {
  readonly index = new SearchIndex();
  private urls = new Map<string, Set<string>>();
  private bookmarkURLs = new Map<string, string>();
  private tabs = new Map<number, Tab>();
  private associations: Session["associations"] = {};
  private initialized = false;
  update(s: Snapshot): void {
    const all =
      s.bookmarks?.nodes ?? new Map(flatten(s.tree).map((b) => [b.id, b]));
    const changes = s.changes;
    const full = !this.initialized || !changes;
    const dirty = new Set(
      full || changes?.preferences ? [...all.keys()] : changes.bookmarks,
    );
    for (const id of changes?.removedBookmarks ?? []) {
      this.index.remove("bookmark", id);
      this.index.remove("folder", id);
      this.urls.get(this.bookmarkURLs.get(id) ?? "")?.delete(id);
      this.bookmarkURLs.delete(id);
    }
    const affectURL = (url: string | undefined) => {
      if (url)
        for (const id of this.urls.get(canonical(url) ?? "") ?? [])
          dirty.add(id);
    };
    for (const id of changes?.removedTabs ?? []) {
      affectURL(this.tabs.get(id)?.url);
      this.tabs.delete(id);
      this.index.remove("tab", String(id));
    }
    const changedTabs =
      full || changes?.session
        ? s.tabs
        : s.tabs.filter((t) => changes?.tabs.includes(t.id!));
    for (const tab of changedTabs) {
      affectURL(this.tabs.get(tab.id!)?.url);
      affectURL(tab.url);
      this.tabs.set(tab.id!, { ...tab });
      const recent = s.session.mru.indexOf(tab.id!);
      this.index.upsert([
        {
          id: String(tab.id),
          kind: "tab",
          title:
            s.session.tabCustomizations?.[String(tab.id)]?.name ||
            tab.title ||
            "Untitled tab",
          aliases: tab.title,
          detail:
            (tab.windowId !== s.windowId ? "Other window · " : "") +
            (tab.url ?? ""),
          windowId: tab.windowId,
          tabId: tab.id,
          recent: recent < 0 ? 1e9 : recent,
        },
      ]);
    }
    const before = this.associations[s.windowId] ?? {},
      after = s.session.associations[s.windowId] ?? {};
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (
        before[id] !== after[id] ||
        changes?.tabs.includes(after[id]) ||
        changes?.removedTabs.includes(before[id])
      )
        dirty.add(id);
    this.associations = structuredClone(s.session.associations);
    const lookup = resolutionIndex(s.windowId, s.tabs, s.session);
    const entries: Entry[] = [];
    for (const id of dirty) {
      const b = all.get(id);
      if (!b?.parentId) continue;
      const oldURL = this.bookmarkURLs.get(id);
      if (oldURL) this.urls.get(oldURL)?.delete(id);
      const url = b.url ? canonical(b.url) : null;
      if (url) {
        if (!this.urls.has(url)) this.urls.set(url, new Set());
        this.urls.get(url)!.add(id);
        this.bookmarkURLs.set(id, url);
      } else this.bookmarkURLs.delete(id);
      const tab = b.url ? lookup(b) : undefined;
      this.index.remove(b.url ? "folder" : "bookmark", id);
      entries.push({
        id,
        kind: b.url ? "bookmark" : "folder",
        title: s.prefs.customizations?.[id]?.name || b.title || "Untitled",
        aliases: b.title,
        detail: [b.path, b.url].filter(Boolean).join(" · "),
        url: b.url,
        tabId: tab?.id,
        open: !!tab,
        windowId: tab?.windowId,
      });
    }
    this.index.upsert(entries);
    for (const command of commands) {
      if (command.needsTab && !s.active) {
        this.index.remove("command", command.id);
        continue;
      }
      this.index.upsert([
        {
          id: command.id,
          kind: "command",
          title: command.label,
          detail: "Browser action",
          aliases: command.aliases,
        },
      ]);
    }
    this.initialized = true;
  }
}
