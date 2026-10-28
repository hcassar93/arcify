import {
  validateAppearance,
  checkAppearanceQuota,
  type Appearance,
} from "./appearance";
import { bookmarkPlacement, reorderIDs, type Placement } from "./order";
import {
  emptySession,
  readSession,
  flatten,
  pruneSession,
  migrate,
  canMove,
  movable,
  writable,
  type Session,
  type Bookmark,
} from "./model";
import {
  openURL,
  resetURL,
  switchTab,
  internal,
  destination,
} from "./navigation";
import { SavedResolver } from "./resolver";
let session: Session = emptySession();
const save = () => chrome.storage.session.set({ session });
const ready = chrome.storage.session.get("session").then(async (value) => {
  session = readSession(value.session);
  session = pruneSession(
    session,
    await chrome.tabs.query({ windowType: "normal" }),
    flatten(await chrome.bookmarks.getTree()),
  );
  for (const [w, open] of Object.entries(session.panels))
    if (open) panels.add(Number(w));
  await save();
});
let queue = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => {},
    () => {},
  );
  return next;
};
const panels = new Set<number>();
// Mounted panel ports reconcile lifecycle after worker restart; lifecycle events persist the state.
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("panel:")) return;
  const w = Number(port.name.slice(6));
  panels.add(w);
  void ready.then(() => {
    session.panels[w] = true;
    return save();
  });
  port.onDisconnect.addListener(() => {
    panels.delete(w);
    void ready.then(() => {
      session.panels[w] = false;
      return save();
    });
  });
});
chrome.sidePanel.onOpened.addListener(({ windowId }) => {
  panels.add(windowId);
  void ready.then(() => {
    session.panels[windowId] = true;
    return save();
  });
});
chrome.sidePanel.onClosed.addListener(({ windowId }) => {
  panels.delete(windowId);
  void ready.then(() => {
    session.panels[windowId] = false;
    return save();
  });
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-sidebar" && tab?.windowId !== undefined) {
    const w = tab.windowId;
    const action = panels.has(w)
      ? chrome.sidePanel.close({ windowId: w })
      : chrome.sidePanel.open({ windowId: w });
    void action.catch(() => {});
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void ready.then(() =>
    serial(async () => {
      session.mru = [tabId, ...session.mru.filter((id) => id !== tabId)].slice(
        0,
        1000,
      );
      await save();
    }),
  );
});
const reconcile = () => {
  void ready.then(() =>
    serial(async () => {
      const all = flatten(await chrome.bookmarks.getTree());
      session = pruneSession(
        session,
        await chrome.tabs.query({ windowType: "normal" }),
        all,
      );
      const stored = await chrome.storage.local.get("preferences");
      if (stored.preferences) {
        const p = migrate(stored.preferences);
        p.favourites = p.favourites.filter((id) =>
          all.some((b) => b.id === id),
        );
        p.customizations = Object.fromEntries(
          Object.entries(p.customizations ?? {}).filter(([id]) =>
            all.some((b) => b.id === id),
          ),
        );
        p.icons = Object.fromEntries(
          Object.entries(p.icons).filter(([id]) =>
            all.some((b) => b.id === id),
          ),
        );
        p.expanded = p.expanded.filter((id) => all.some((b) => b.id === id));
        await chrome.storage.local.set({ preferences: p });
      }
      await save();
    }),
  );
};
chrome.tabs.onRemoved.addListener(reconcile);
chrome.tabs.onAttached.addListener(reconcile);
chrome.tabs.onDetached.addListener(reconcile);
chrome.tabs.onReplaced.addListener((added, removed) => {
  void ready.then(() =>
    serial(async () => {
      if (session.tabCustomizations?.[removed]) {
        session.tabCustomizations[added] = session.tabCustomizations[removed];
        delete session.tabCustomizations[removed];
      }
      for (const a of Object.values(session.associations))
        for (const id of Object.keys(a)) if (a[id] === removed) a[id] = added;
      await save();
    }),
  );
});
chrome.bookmarks.onRemoved.addListener(reconcile);
chrome.runtime.onStartup.addListener(() => {
  void ready.then(() => {
    session = emptySession();
    return save();
  });
});
interface Message {
  downloadId?: number;
  appearance?: Appearance;
  action: string;
  targetId?: string;
  placement?: Placement;
  direction?: "earlier" | "later";
  windowId?: number;
  tabId?: number;
  bookmarkId?: string;
  parentId?: string;
  title?: string;
  url?: string;
  index?: number;
  fresh?: boolean;
  favourite?: boolean;
}
async function bookmark(id: string | undefined): Promise<Bookmark> {
  if (!id) throw new Error("Choose a bookmark.");
  return (await chrome.bookmarks.get(id))[0];
}
async function run(m: Message): Promise<unknown> {
  await ready;
  const w = m.windowId;
  if (w !== undefined) {
    const win = await chrome.windows.get(w);
    if (win.type !== "normal")
      throw new Error("Choose a normal Chrome window.");
  }
  const tab = async () => {
    if (m.tabId === undefined) throw new Error("No content tab is selected.");
    return chrome.tabs.get(m.tabId);
  };
  switch (m.action) {
    case "downloads":
      if (w === undefined) throw new Error("No originating window.");
      return openURL(internal.downloads, w, true);
    case "reveal-download": {
      if (!Number.isInteger(m.downloadId))
        throw new Error("Choose a download.");
      const [item] = await chrome.downloads.search({
        id: m.downloadId,
        limit: 1,
      });
      if (!item || item.state !== "complete" || !item.exists)
        throw new Error(
          "This file is missing or not complete. Manage it in Chrome.",
        );
      chrome.downloads.show(item.id);
      return;
    }
    case "customize": {
      const appearance = validateAppearance(m.appearance);
      if (m.bookmarkId) {
        await bookmark(m.bookmarkId);
        const prefs = migrate(
          (await chrome.storage.local.get("preferences")).preferences,
        );
        const items = { ...prefs.customizations };
        if (Object.keys(appearance).length) items[m.bookmarkId] = appearance;
        else delete items[m.bookmarkId];
        checkAppearanceQuota(items);
        delete prefs.icons[m.bookmarkId];
        await chrome.storage.local.set({
          preferences: { ...prefs, customizations: items },
        });
      } else {
        const t = await tab();
        const items = { ...session.tabCustomizations };
        if (Object.keys(appearance).length) items[String(t.id)] = appearance;
        else delete items[String(t.id)];
        checkAppearanceQuota(items);
        const next = { ...session, tabCustomizations: items };
        await chrome.storage.session.set({ session: next });
        session = next;
      }
      return;
    }
    case "activate": {
      if (w === undefined) throw new Error("No originating window.");
      const resolver = new SavedResolver(
        {
          tabs: () => chrome.tabs.query({ windowType: "normal" }),
          activate: switchTab,
          create: openURL,
        },
        session,
        save,
      );
      return resolver.activate(await bookmark(m.bookmarkId), w, m.fresh);
    }
    case "switch":
      return switchTab((await tab()).id!);
    case "open-url":
      if (w === undefined) throw new Error("No originating window.");
      return openURL(m.url ?? "", w);
    case "new-tab":
      if (w === undefined) throw new Error("No originating window.");
      return openURL(internal.newTab, w, true);
    case "shortcuts":
      if (w === undefined) throw new Error("No originating window.");
      return openURL(internal.shortcuts, w, true);
    case "reset": {
      const b = await bookmark(m.bookmarkId);
      const id = session.associations[String(w)]?.[b.id];
      if (id === undefined)
        throw new Error("This bookmark has no associated live tab.");
      return resetURL(id, b.url ?? "");
    }
    case "close-tab":
      return chrome.tabs.remove((await tab()).id!);
    case "reload":
      return chrome.tabs.reload((await tab()).id!);
    case "mute": {
      const t = await tab();
      return chrome.tabs.update(t.id!, { muted: !t.mutedInfo?.muted });
    }
    case "pin": {
      const t = await tab();
      return chrome.tabs.update(t.id!, { pinned: !t.pinned });
    }
    case "duplicate": {
      const t = await tab();
      if (w === undefined) throw new Error("No originating window.");
      return openURL(t.url ?? "", w, true);
    }
    case "move-tab": {
      const t = await tab();
      const ts = await chrome.tabs.query({ windowId: t.windowId });
      const pinCount = ts.filter((t) => t.pinned).length;
      const index = m.index ?? 0;
      if ((t.pinned && index >= pinCount) || (!t.pinned && index < pinCount))
        throw new Error("Pinned tabs must stay before unpinned tabs.");
      return chrome.tabs.move(t.id!, { index });
    }
    case "fullscreen": {
      if (w === undefined) throw new Error("No originating window.");
      const win = await chrome.windows.get(w);
      if (win.state === "fullscreen")
        return chrome.windows.update(w, {
          state: session.fullscreen[w] ?? "normal",
        });
      session.fullscreen[w] =
        win.state === "maximized" ? "maximized" : "normal";
      await save();
      return chrome.windows.update(w, { state: "fullscreen" });
    }
    case "settings":
      return chrome.runtime.openOptionsPage();
    case "save": {
      const p = await bookmark(m.parentId);
      if (p.url || !writable(p)) throw new Error("This folder is read-only.");
      if (!m.title?.trim()) throw new Error("Enter a title.");
      const prefs = migrate(
        (await chrome.storage.local.get("preferences")).preferences,
      );
      if (m.favourite && prefs.favourites.length >= 12)
        throw new Error("Favourites are limited to 12. Remove one first.");
      const b = await chrome.bookmarks.create({
        parentId: p.id,
        title: m.title,
        url: m.url ? destination(m.url) : undefined,
      });
      if (m.favourite) {
        prefs.favourites.push(b.id);
        await chrome.storage.local.set({ preferences: prefs });
      }
      return b;
    }
    case "edit": {
      const b = await bookmark(m.bookmarkId);
      if (!movable(b)) throw new Error("This item cannot be edited.");
      return chrome.bookmarks.update(b.id, {
        title: m.title ?? b.title,
        ...(b.url ? { url: destination(m.url ?? b.url) } : {}),
      });
    }
    case "delete": {
      const b = await bookmark(m.bookmarkId);
      if (!movable(b)) throw new Error("This item cannot be deleted.");
      return b.url
        ? chrome.bookmarks.remove(b.id)
        : chrome.bookmarks.removeTree(b.id);
    }
    case "move": {
      const b = await bookmark(m.bookmarkId),
        all = flatten(await chrome.bookmarks.getTree());
      let destination: { parentId: string; index?: number };
      if (m.targetId) {
        destination = bookmarkPlacement(
          b,
          await bookmark(m.targetId),
          m.placement ?? "inside",
          all,
        );
      } else if (m.direction) {
        const siblings = all
          .filter((n) => n.parentId === b.parentId)
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const index = siblings.findIndex((n) => n.id === b.id);
        const target = siblings[index + (m.direction === "earlier" ? -1 : 1)];
        if (!target) return b;
        destination = bookmarkPlacement(
          b,
          target,
          m.direction === "earlier" ? "before" : "after",
          all,
        );
      } else {
        const p = await bookmark(m.parentId);
        if (!canMove(b, p, all))
          throw new Error(
            "This move would create a cycle or use a read-only folder.",
          );
        destination = { parentId: p.id, index: m.index };
      }
      return chrome.bookmarks.move(b.id, destination);
    }
    case "reorder-favourite": {
      const p = migrate(
        (await chrome.storage.local.get("preferences")).preferences,
      );
      const id = m.bookmarkId ?? "";
      const position = p.favourites.indexOf(id);
      const target =
        m.targetId ??
        p.favourites[position + (m.direction === "earlier" ? -1 : 1)];
      if (!target) return;
      p.favourites = reorderIDs(
        p.favourites,
        id,
        target,
        m.placement === "after" || m.direction === "later" ? "after" : "before",
      );
      return chrome.storage.local.set({ preferences: p });
    }
    case "favourite": {
      const b = await bookmark(m.bookmarkId);
      if (!b.url) throw new Error("Choose a saved link.");
      const p = migrate(
        (await chrome.storage.local.get("preferences")).preferences,
      );
      if (!p.favourites.includes(b.id)) {
        if (p.favourites.length >= 12)
          throw new Error("Favourites are limited to 12.");
        p.favourites.push(b.id);
      }
      return chrome.storage.local.set({ preferences: p });
    }
    case "unfavourite": {
      const p = migrate(
        (await chrome.storage.local.get("preferences")).preferences,
      );
      p.favourites = p.favourites.filter((id) => id !== m.bookmarkId);
      for (const a of Object.values(session.associations))
        delete a[m.bookmarkId ?? ""];
      await save();
      return chrome.storage.local.set({ preferences: p });
    }
    default:
      throw new Error("Unknown action.");
  }
}
chrome.runtime.onMessage.addListener((m: Message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (
    m.action === "show-sidebar" ||
    m.action === "hide-sidebar" ||
    m.action === "toggle-sidebar"
  ) {
    if (m.windowId === undefined) {
      reply({ ok: false, error: "No originating window." });
      return false;
    }
    const close =
      m.action === "hide-sidebar" ||
      (m.action === "toggle-sidebar" && panels.has(m.windowId));
    const result = close
      ? chrome.sidePanel.close({ windowId: m.windowId })
      : chrome.sidePanel.open({ windowId: m.windowId });
    void result.then(
      () => reply({ ok: true }),
      (e) => reply({ ok: false, error: String(e.message) }),
    );
    return true;
  }
  void serial(() => run(m)).then(
    (value) => reply({ ok: true, value }),
    (e) =>
      reply({
        ok: false,
        error: e instanceof Error ? e.message : "Action failed.",
      }),
  );
  return true;
});
