// src/appearance.ts
function validateAppearance(raw) {
  if (!raw || typeof raw !== "object") return {};
  const v = raw, out = {};
  if (v.name !== void 0) {
    if (typeof v.name !== "string" || v.name.length > 120)
      throw new Error("Display names must be at most 120 characters.");
    if (v.name.trim()) out.name = v.name.trim();
  }
  if (v.emoji !== void 0) {
    if (typeof v.emoji !== "string" || v.emoji.length > 16)
      throw new Error("Choose a short icon or emoji.");
    if (v.emoji.trim()) out.emoji = v.emoji.trim();
  }
  if (v.image !== void 0) {
    if (typeof v.image !== "string" || v.image.length > 1e5 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(v.image))
      throw new Error("Choose a validated PNG image.");
    out.image = v.image;
  }
  return out;
}
function readAppearances(raw) {
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [id, value] of Object.entries(raw)) {
    if (["__proto__", "constructor", "prototype"].includes(id)) continue;
    try {
      result[id] = validateAppearance(value);
    } catch {
    }
  }
  return JSON.stringify(result).length <= 2e6 ? result : {};
}
function checkAppearanceQuota(value) {
  if (JSON.stringify(value).length > 2e6)
    throw new Error(
      "Custom images use 2 MB. Remove an image before adding another."
    );
}

// src/model.ts
var defaults = {
  schemaVersion: 1,
  bookmarkRootId: null,
  favourites: [],
  icons: {},
  expanded: [],
  savedCollapsed: false,
  theme: "system"
};
var emptySession = () => ({
  associations: {},
  mru: [],
  panels: {},
  fullscreen: {}
});
var ids = (x) => Array.isArray(x) ? [...new Set(x.filter((v) => typeof v === "string"))] : [];
function migrate(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    ...defaults,
    customizations: readAppearances(p.customizations),
    bookmarkRootId: typeof p.bookmarkRootId === "string" ? p.bookmarkRootId : null,
    favourites: ids(p.favourites).slice(0, 12),
    expanded: ids(p.expanded),
    savedCollapsed: p.savedCollapsed === true,
    theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system",
    icons: Object.fromEntries(
      Object.entries(
        p.icons && typeof p.icons === "object" ? p.icons : {}
      ).filter(
        ([k, v]) => k !== "__proto__" && typeof v === "string" && v.length <= 16
      )
    )
  };
}
function flatten(nodes, path = "") {
  return nodes.flatMap((n) => [
    { ...n, path },
    ...flatten(n.children ?? [], [path, n.title].filter(Boolean).join(" / "))
  ]);
}
function pruneSession(s, tabs, bookmarks) {
  const valid = new Map(tabs.map((t) => [t.id, t]));
  const ids2 = new Set(bookmarks.map((b) => b.id));
  const associations = Object.fromEntries(
    Object.entries(s.associations ?? {}).map(([w, items]) => [
      w,
      Object.fromEntries(
        Object.entries(items).filter(
          ([b, t]) => ids2.has(b) && valid.get(t)?.windowId === Number(w)
        )
      )
    ])
  );
  return {
    ...emptySession(),
    ...s,
    associations,
    tabCustomizations: Object.fromEntries(
      Object.entries(s.tabCustomizations ?? {}).filter(
        ([id]) => valid.has(Number(id))
      )
    ),
    mru: (s.mru ?? []).filter((id) => valid.has(id))
  };
}
function writable(node) {
  return !!node && !node.unmodifiable;
}
function movable(node) {
  return writable(node) && !!node?.parentId && !node.folderType;
}
function canMove(node, target, all) {
  if (!movable(node) || !writable(target) || target.url || node.id === target.id)
    return false;
  let p = target;
  const seen = /* @__PURE__ */ new Set();
  while (p) {
    if (p.id === node.id || seen.has(p.id)) return false;
    seen.add(p.id);
    p = all.find((n) => n.id === p?.parentId);
  }
  return true;
}
function readSession(raw) {
  const result = emptySession();
  if (!raw || typeof raw !== "object") return result;
  const s = raw;
  const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  for (const [w, items] of Object.entries(record(s.associations))) {
    if (!/^\d+$/.test(w)) continue;
    result.associations[w] = Object.fromEntries(
      Object.entries(record(items)).filter(
        ([id, t]) => id !== "__proto__" && Number.isInteger(t) && Number(t) >= 0
      )
    );
  }
  result.tabCustomizations = readAppearances(s.tabCustomizations);
  result.mru = Array.isArray(s.mru) ? [
    ...new Set(
      s.mru.filter((id) => Number.isInteger(id) && id >= 0)
    )
  ].slice(0, 1e3) : [];
  for (const [w, open] of Object.entries(record(s.panels)))
    if (/^\d+$/.test(w) && typeof open === "boolean") result.panels[w] = open;
  for (const [w, state] of Object.entries(record(s.fullscreen)))
    if (/^\d+$/.test(w) && (state === "normal" || state === "maximized"))
      result.fullscreen[w] = state;
  return result;
}

// src/order.ts
function bookmarkPlacement(source, target, placement, all) {
  const parent = placement === "inside" ? target : all.find((b) => b.id === target.parentId);
  if (!parent || !canMove(source, parent, all) || source.id === target.id)
    throw new Error("Choose a writable destination outside this folder.");
  if (placement === "inside") return { parentId: parent.id };
  const siblings = all.filter((b) => b.parentId === parent.id && b.id !== source.id).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const targetIndex = siblings.findIndex((b) => b.id === target.id);
  if (targetIndex < 0)
    throw new Error("The destination moved. Please try again.");
  return {
    parentId: parent.id,
    index: targetIndex + (placement === "after" ? 1 : 0)
  };
}
function reorderIDs(ids2, source, target, placement) {
  if (source === target) return [...ids2];
  if (!ids2.includes(source) || !ids2.includes(target))
    throw new Error("This favourite is no longer available.");
  const list = ids2.filter((id) => id !== source);
  list.splice(
    list.indexOf(target) + (placement === "after" ? 1 : 0),
    0,
    source
  );
  return list;
}

// src/navigation.ts
function canonical(value) {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      return null;
    return u.href;
  } catch {
    return null;
  }
}
var internal = {
  downloads: "chrome://downloads/",
  newTab: "chrome://newtab/",
  shortcuts: "chrome://extensions/shortcuts"
};
function destination(url, allowInternal = false) {
  const safe = canonical(url);
  if (safe) return safe;
  if (allowInternal && Object.values(internal).includes(url))
    return url;
  throw new Error(
    "Only HTTP and HTTPS destinations without embedded credentials are supported."
  );
}
async function openURL(url, windowId, allowInternal = false) {
  return chrome.tabs.create({
    windowId,
    url: destination(url, allowInternal),
    active: true
  });
}
async function resetURL(tabId, url) {
  const tab = await chrome.tabs.update(tabId, {
    url: destination(url),
    active: true
  });
  if (!tab) throw new Error("The tab is no longer available.");
  return tab;
}
async function switchTab(id) {
  const t = await chrome.tabs.get(id);
  await chrome.tabs.update(id, { active: true });
  await chrome.windows.update(t.windowId, { focused: true });
}

// src/resolver.ts
function exactMatch(url, tabs, mru) {
  const key = canonical(url);
  if (!key) return;
  return tabs.filter((t) => canonical(t.url ?? "") === key).sort(
    (a, b) => Number(b.active) - Number(a.active) || (mru.indexOf(a.id) < 0 ? 1e9 : mru.indexOf(a.id)) - (mru.indexOf(b.id) < 0 ? 1e9 : mru.indexOf(b.id)) || a.index - b.index
  )[0];
}
function resolve(bookmark2, windowId, tabs, session2) {
  const current = tabs.filter((t) => t.windowId === windowId);
  return current.find(
    (t) => t.id === session2.associations[String(windowId)]?.[bookmark2.id]
  ) ?? exactMatch(bookmark2.url ?? "", current, session2.mru);
}
var SavedResolver = class {
  constructor(adapter, session2, save2) {
    this.adapter = adapter;
    this.session = session2;
    this.save = save2;
  }
  pending = /* @__PURE__ */ new Map();
  activate(b, w, fresh = false) {
    const key = w + ":" + b.id;
    if (!fresh && this.pending.has(key)) return this.pending.get(key);
    const job = this.perform(b, w, fresh);
    if (!fresh) {
      this.pending.set(key, job);
      void job.finally(() => this.pending.delete(key)).catch(() => {
      });
    }
    return job;
  }
  async perform(b, w, fresh) {
    if (!b.url || !canonical(b.url))
      throw new Error("This saved destination is unsupported.");
    const match = fresh ? void 0 : resolve(b, w, await this.adapter.tabs(), this.session);
    if (match?.id !== void 0) {
      await this.adapter.activate(match.id);
      this.session.associations[w] ??= {};
      this.session.associations[w][b.id] = match.id;
      await this.save();
      return match;
    }
    const tab = await this.adapter.create(b.url, w);
    if (!fresh && tab.id !== void 0) {
      this.session.associations[w] ??= {};
      this.session.associations[w][b.id] = tab.id;
      await this.save();
    }
    return tab;
  }
};

// src/worker.ts
var session = emptySession();
var save = () => chrome.storage.session.set({ session });
var ready = chrome.storage.session.get("session").then(async (value) => {
  session = readSession(value.session);
  session = pruneSession(
    session,
    await chrome.tabs.query({ windowType: "normal" }),
    flatten(await chrome.bookmarks.getTree())
  );
  for (const [w, open] of Object.entries(session.panels))
    if (open) panels.add(Number(w));
  await save();
});
var queue = Promise.resolve();
var serial = (fn) => {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => {
    },
    () => {
    }
  );
  return next;
};
var panels = /* @__PURE__ */ new Set();
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
  if (command === "toggle-sidebar" && tab?.windowId !== void 0) {
    const w = tab.windowId;
    const action = panels.has(w) ? chrome.sidePanel.close({ windowId: w }) : chrome.sidePanel.open({ windowId: w });
    void action.catch(() => {
    });
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void ready.then(
    () => serial(async () => {
      session.mru = [tabId, ...session.mru.filter((id) => id !== tabId)].slice(
        0,
        1e3
      );
      await save();
    })
  );
});
var reconcile = () => {
  void ready.then(
    () => serial(async () => {
      const all = flatten(await chrome.bookmarks.getTree());
      session = pruneSession(
        session,
        await chrome.tabs.query({ windowType: "normal" }),
        all
      );
      const stored = await chrome.storage.local.get("preferences");
      if (stored.preferences) {
        const p = migrate(stored.preferences);
        p.favourites = p.favourites.filter(
          (id) => all.some((b) => b.id === id)
        );
        p.customizations = Object.fromEntries(
          Object.entries(p.customizations ?? {}).filter(
            ([id]) => all.some((b) => b.id === id)
          )
        );
        p.icons = Object.fromEntries(
          Object.entries(p.icons).filter(
            ([id]) => all.some((b) => b.id === id)
          )
        );
        p.expanded = p.expanded.filter((id) => all.some((b) => b.id === id));
        await chrome.storage.local.set({ preferences: p });
      }
      await save();
    })
  );
};
chrome.tabs.onRemoved.addListener(reconcile);
chrome.tabs.onAttached.addListener(reconcile);
chrome.tabs.onDetached.addListener(reconcile);
chrome.tabs.onReplaced.addListener((added, removed) => {
  void ready.then(
    () => serial(async () => {
      if (session.tabCustomizations?.[removed]) {
        session.tabCustomizations[added] = session.tabCustomizations[removed];
        delete session.tabCustomizations[removed];
      }
      for (const a of Object.values(session.associations))
        for (const id of Object.keys(a)) if (a[id] === removed) a[id] = added;
      await save();
    })
  );
});
chrome.bookmarks.onRemoved.addListener(reconcile);
chrome.runtime.onStartup.addListener(() => {
  void ready.then(() => {
    session = emptySession();
    return save();
  });
});
async function bookmark(id) {
  if (!id) throw new Error("Choose a bookmark.");
  return (await chrome.bookmarks.get(id))[0];
}
async function run(m) {
  await ready;
  const w = m.windowId;
  if (w !== void 0) {
    const win = await chrome.windows.get(w);
    if (win.type !== "normal")
      throw new Error("Choose a normal Chrome window.");
  }
  const tab = async () => {
    if (m.tabId === void 0) throw new Error("No content tab is selected.");
    return chrome.tabs.get(m.tabId);
  };
  switch (m.action) {
    case "downloads":
      if (w === void 0) throw new Error("No originating window.");
      return openURL(internal.downloads, w, true);
    case "reveal-download": {
      if (!Number.isInteger(m.downloadId))
        throw new Error("Choose a download.");
      const [item] = await chrome.downloads.search({
        id: m.downloadId,
        limit: 1
      });
      if (!item || item.state !== "complete" || !item.exists)
        throw new Error(
          "This file is missing or not complete. Manage it in Chrome."
        );
      chrome.downloads.show(item.id);
      return;
    }
    case "customize": {
      const appearance = validateAppearance(m.appearance);
      if (m.bookmarkId) {
        await bookmark(m.bookmarkId);
        const prefs = migrate(
          (await chrome.storage.local.get("preferences")).preferences
        );
        const items = { ...prefs.customizations };
        if (Object.keys(appearance).length) items[m.bookmarkId] = appearance;
        else delete items[m.bookmarkId];
        checkAppearanceQuota(items);
        delete prefs.icons[m.bookmarkId];
        await chrome.storage.local.set({
          preferences: { ...prefs, customizations: items }
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
      if (w === void 0) throw new Error("No originating window.");
      const resolver = new SavedResolver(
        {
          tabs: () => chrome.tabs.query({ windowType: "normal" }),
          activate: switchTab,
          create: openURL
        },
        session,
        save
      );
      return resolver.activate(await bookmark(m.bookmarkId), w, m.fresh);
    }
    case "switch":
      return switchTab((await tab()).id);
    case "open-url":
      if (w === void 0) throw new Error("No originating window.");
      return openURL(m.url ?? "", w);
    case "new-tab":
      if (w === void 0) throw new Error("No originating window.");
      return openURL(internal.newTab, w, true);
    case "shortcuts":
      if (w === void 0) throw new Error("No originating window.");
      return openURL(internal.shortcuts, w, true);
    case "reset": {
      const b = await bookmark(m.bookmarkId);
      const id = session.associations[String(w)]?.[b.id];
      if (id === void 0)
        throw new Error("This bookmark has no associated live tab.");
      return resetURL(id, b.url ?? "");
    }
    case "close-tab":
      return chrome.tabs.remove((await tab()).id);
    case "reload":
      return chrome.tabs.reload((await tab()).id);
    case "mute": {
      const t = await tab();
      return chrome.tabs.update(t.id, { muted: !t.mutedInfo?.muted });
    }
    case "pin": {
      const t = await tab();
      return chrome.tabs.update(t.id, { pinned: !t.pinned });
    }
    case "duplicate": {
      const t = await tab();
      if (w === void 0) throw new Error("No originating window.");
      return openURL(t.url ?? "", w, true);
    }
    case "move-tab": {
      const t = await tab();
      const ts = await chrome.tabs.query({ windowId: t.windowId });
      const pinCount = ts.filter((t2) => t2.pinned).length;
      const index = m.index ?? 0;
      if (t.pinned && index >= pinCount || !t.pinned && index < pinCount)
        throw new Error("Pinned tabs must stay before unpinned tabs.");
      return chrome.tabs.move(t.id, { index });
    }
    case "fullscreen": {
      if (w === void 0) throw new Error("No originating window.");
      const win = await chrome.windows.get(w);
      if (win.state === "fullscreen")
        return chrome.windows.update(w, {
          state: session.fullscreen[w] ?? "normal"
        });
      session.fullscreen[w] = win.state === "maximized" ? "maximized" : "normal";
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
        (await chrome.storage.local.get("preferences")).preferences
      );
      if (m.favourite && prefs.favourites.length >= 12)
        throw new Error("Favourites are limited to 12. Remove one first.");
      const b = await chrome.bookmarks.create({
        parentId: p.id,
        title: m.title,
        url: m.url ? destination(m.url) : void 0
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
        ...b.url ? { url: destination(m.url ?? b.url) } : {}
      });
    }
    case "delete": {
      const b = await bookmark(m.bookmarkId);
      if (!movable(b)) throw new Error("This item cannot be deleted.");
      return b.url ? chrome.bookmarks.remove(b.id) : chrome.bookmarks.removeTree(b.id);
    }
    case "move": {
      const b = await bookmark(m.bookmarkId), all = flatten(await chrome.bookmarks.getTree());
      let destination2;
      if (m.targetId) {
        destination2 = bookmarkPlacement(
          b,
          await bookmark(m.targetId),
          m.placement ?? "inside",
          all
        );
      } else if (m.direction) {
        const siblings = all.filter((n) => n.parentId === b.parentId).sort((a, b2) => (a.index ?? 0) - (b2.index ?? 0));
        const index = siblings.findIndex((n) => n.id === b.id);
        const target = siblings[index + (m.direction === "earlier" ? -1 : 1)];
        if (!target) return b;
        destination2 = bookmarkPlacement(
          b,
          target,
          m.direction === "earlier" ? "before" : "after",
          all
        );
      } else {
        const p = await bookmark(m.parentId);
        if (!canMove(b, p, all))
          throw new Error(
            "This move would create a cycle or use a read-only folder."
          );
        destination2 = { parentId: p.id, index: m.index };
      }
      return chrome.bookmarks.move(b.id, destination2);
    }
    case "reorder-favourite": {
      const p = migrate(
        (await chrome.storage.local.get("preferences")).preferences
      );
      const id = m.bookmarkId ?? "";
      const position = p.favourites.indexOf(id);
      const target = m.targetId ?? p.favourites[position + (m.direction === "earlier" ? -1 : 1)];
      if (!target) return;
      p.favourites = reorderIDs(
        p.favourites,
        id,
        target,
        m.placement === "after" || m.direction === "later" ? "after" : "before"
      );
      return chrome.storage.local.set({ preferences: p });
    }
    case "favourite": {
      const b = await bookmark(m.bookmarkId);
      if (!b.url) throw new Error("Choose a saved link.");
      const p = migrate(
        (await chrome.storage.local.get("preferences")).preferences
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
        (await chrome.storage.local.get("preferences")).preferences
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
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (m.action === "show-sidebar" || m.action === "hide-sidebar" || m.action === "toggle-sidebar") {
    if (m.windowId === void 0) {
      reply({ ok: false, error: "No originating window." });
      return false;
    }
    const close = m.action === "hide-sidebar" || m.action === "toggle-sidebar" && panels.has(m.windowId);
    const result = close ? chrome.sidePanel.close({ windowId: m.windowId }) : chrome.sidePanel.open({ windowId: m.windowId });
    void result.then(
      () => reply({ ok: true }),
      (e) => reply({ ok: false, error: String(e.message) })
    );
    return true;
  }
  void serial(() => run(m)).then(
    (value) => reply({ ok: true, value }),
    (e) => reply({
      ok: false,
      error: e instanceof Error ? e.message : "Action failed."
    })
  );
  return true;
});
