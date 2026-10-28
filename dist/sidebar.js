// src/downloads.ts
var DOWNLOAD_LIMIT = 50;
function summarizeDownload(d) {
  return {
    id: d.id,
    name: d.filename.split(/[\\/]/).at(-1) || "Unnamed download",
    state: d.state,
    paused: d.paused,
    exists: d.exists,
    received: Math.max(0, d.bytesReceived),
    total: d.totalBytes,
    start: d.startTime,
    danger: d.danger
  };
}
function downloadStatus(d) {
  if (d.state === "complete") return d.exists ? "Complete" : "File missing";
  if (d.state === "interrupted") return "Interrupted \xB7 manage in Chrome";
  if (d.paused) return "Paused";
  return d.total > 0 ? Math.min(100, Math.round(d.received / d.total * 100)) + "% downloaded" : "Downloading\u2026";
}
function canReveal(d) {
  return d.state === "complete" && d.exists;
}
var DownloadStore = class {
  constructor(api) {
    this.api = api;
  }
  items = [];
  error = "";
  listeners = /* @__PURE__ */ new Set();
  timer;
  running = false;
  again = false;
  async refresh() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      this.items = (await this.api.search({
        limit: DOWNLOAD_LIMIT,
        orderBy: ["-startTime"]
      })).filter((d) => !d.incognito).slice(0, DOWNLOAD_LIMIT).map(summarizeDownload);
      this.error = "";
    } catch {
      this.error = "Downloads are unavailable. Try again.";
    } finally {
      this.running = false;
      this.listeners.forEach((fn) => fn());
      if (this.again) {
        this.again = false;
        void this.refresh();
      }
    }
  }
  watch(fn) {
    this.listeners.add(fn);
    const changed = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.refresh(), 100);
    };
    this.api.onCreated.addListener(changed);
    this.api.onChanged.addListener(changed);
    this.api.onErased.addListener(changed);
    const interval = setInterval(() => {
      if (this.items.some((d) => d.state === "in_progress" && !d.paused))
        changed();
    }, 1e3);
    window.addEventListener(
      "pagehide",
      () => {
        clearInterval(interval);
        clearTimeout(this.timer);
        this.api.onCreated.removeListener(changed);
        this.api.onChanged.removeListener(changed);
        this.api.onErased.removeListener(changed);
      },
      { once: true }
    );
    void this.refresh();
  }
};

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
async function localImage(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2e6)
    throw new Error("Choose a PNG, JPEG or WebP smaller than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = file.type === "image/png" ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid) throw new Error("The file contents do not match its image type.");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 4096 || bitmap.height > 4096)
      throw new Error("Images must be no larger than 4096 \xD7 4096.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return validateAppearance({ image: canvas.toDataURL("image/png") }).image;
  } finally {
    bitmap.close();
  }
}

// src/icons.ts
var paths = {
  download: "M8 1v9 M4 6l4 4 4-4 M2 11v3h12v-3",
  search: "m14 14-4-4 M11.5 6.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  folder: "M1 3h5l2 2h7v9H1Z",
  chevron: "m6 4 4 4-4 4",
  down: "m4 6 4 4 4-4",
  plus: "M8 3v10 M3 8h10",
  settings: "M8 2v2 M8 12v2 M2 8h2 M12 8h2 M3.8 3.8l1.4 1.4 M10.8 10.8l1.4 1.4 M3.8 12.2l1.4-1.4 M10.8 5.2l1.4-1.4 M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  fullscreen: "M6 2H2v4 M10 2h4v4 M14 10v4h-4 M2 10v4h4",
  close: "m4 4 8 8 M12 4l-8 8",
  panel: "M2 3h12v10H2Z M6 3v10",
  more: "M3 8h.01 M8 8h.01 M13 8h.01",
  command: "M5 5h6v6H5Z M5 5H3a2 2 0 1 1 2-2v2 M11 5V3a2 2 0 1 1 2 2h-2 M11 11h2a2 2 0 1 1-2 2v-2 M5 11v2a2 2 0 1 1-2-2h2",
  pin: "m5 2 6 0-1 5 3 3H3l3-3Z M8 10v4",
  arrow: "M3 8h10 M9 4l4 4-4 4"
};
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ui-icon");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name] ?? paths.arrow);
  svg.append(path);
  return svg;
}
var packagedSites = {
  "github.com": "github.png",
  "mail.google.com": "gmail.png",
  "calendar.google.com": "calendar.png",
  "notion.so": "notion.png",
  "www.notion.so": "notion.png",
  "notion.com": "notion.png",
  "www.notion.com": "notion.png"
};
function siteAsset(url) {
  try {
    const u = new URL(url ?? "");
    if (!["https:", "http:"].includes(u.protocol)) return;
    const file = packagedSites[u.hostname];
    return file ? "site-icons/" + file : void 0;
  } catch {
    return;
  }
}
function cachedIconURL(url, getURL) {
  try {
    const page = new URL(url ?? "");
    if (!["http:", "https:"].includes(page.protocol) || page.username || page.password)
      return;
    const endpoint = new URL(getURL("_favicon/"));
    endpoint.searchParams.set("pageUrl", page.href);
    endpoint.searchParams.set("size", "32");
    return endpoint.href;
  } catch {
    return;
  }
}
function siteIcon(title, url, override, image) {
  const box = document.createElement("span");
  box.className = "site-icon";
  box.setAttribute("aria-hidden", "true");
  const monogram2 = () => {
    box.replaceChildren();
    box.classList.remove("cached", "packaged");
    delete box.dataset.site;
    box.textContent = override || [...title.trim()][0]?.toUpperCase() || "\u2022";
    box.classList.add(override ? "emoji" : "monogram");
    let hash = 0;
    for (const c of url ?? title) hash = hash * 31 + c.charCodeAt(0) >>> 0;
    box.dataset.tint = String(hash % 6);
  };
  if (image) {
    const img2 = document.createElement("img");
    img2.alt = "";
    img2.src = image;
    img2.onerror = monogram2;
    box.append(img2);
    return box;
  }
  if (override) {
    monogram2();
    return box;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.width = 20;
  img.height = 20;
  const packaged = () => {
    const asset = siteAsset(url);
    box.classList.remove("cached");
    if (!asset) {
      monogram2();
      return;
    }
    box.classList.add("packaged");
    box.dataset.site = asset.split("/").at(-1)?.split(".")[0] ?? "";
    img.onerror = () => {
      img.onerror = null;
      monogram2();
    };
    img.src = asset;
    box.replaceChildren(img);
  };
  const cached = typeof chrome !== "undefined" && chrome.runtime?.getURL ? cachedIconURL(url, chrome.runtime.getURL) : void 0;
  if (cached) {
    box.classList.add("cached");
    img.onerror = packaged;
    img.src = cached;
    box.append(img);
  } else packaged();
  return box;
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
function descendants(node) {
  return (node.children ?? []).reduce((n, c) => n + 1 + descendants(c), 0);
}
function writable(node) {
  return !!node && !node.unmodifiable;
}
function movable(node) {
  return writable(node) && !!node?.parentId && !node.folderType;
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
  for (const [w, state2] of Object.entries(record(s.fullscreen)))
    if (/^\d+$/.test(w) && (state2 === "normal" || state2 === "maximized"))
      result.fullscreen[w] = state2;
  return result;
}

// src/stores.ts
var BookmarkStore = class {
  nodes = /* @__PURE__ */ new Map();
  changed = /* @__PURE__ */ new Set();
  removed = /* @__PURE__ */ new Set();
  roots = [];
  constructor(tree = []) {
    this.reset(tree);
  }
  reset(tree) {
    for (const id of this.nodes.keys()) this.removed.add(id);
    this.nodes.clear();
    this.roots = structuredClone(tree);
    for (const n of this.roots) this.index(n, "");
  }
  index(node, path) {
    const saved = Object.assign(node, { path });
    this.nodes.set(node.id, saved);
    this.changed.add(node.id);
    this.removed.delete(node.id);
    for (const child of node.children ?? [])
      this.index(child, [path, node.title].filter(Boolean).join(" / "));
  }
  siblings(parentId) {
    if (!parentId) return this.roots;
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error("Missing bookmark parent");
    return parent.children ?? (parent.children = []);
  }
  reindex(children) {
    children.forEach((n, index) => {
      if (n.index !== index) {
        n.index = index;
        this.changed.add(n.id);
      }
    });
  }
  create(node) {
    if (this.nodes.has(node.id)) this.remove(node.id);
    const siblings = this.siblings(node.parentId);
    siblings.splice(
      Math.min(node.index ?? siblings.length, siblings.length),
      0,
      structuredClone(node)
    );
    const added = siblings.find((n) => n.id === node.id);
    const parent = this.nodes.get(node.parentId ?? "");
    this.index(
      added,
      parent ? [parent.path, parent.title].filter(Boolean).join(" / ") : ""
    );
    this.reindex(siblings);
  }
  update(id, change) {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Missing bookmark");
    Object.assign(node, change);
    this.index(node, node.path);
  }
  remove(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    const siblings = this.siblings(node.parentId);
    const i = siblings.findIndex((n) => n.id === id);
    if (i >= 0) siblings.splice(i, 1);
    const remove = (n) => {
      for (const child of n.children ?? []) remove(child);
      this.nodes.delete(n.id);
      this.changed.delete(n.id);
      this.removed.add(n.id);
    };
    remove(node);
    this.reindex(siblings);
  }
  move(id, parentId, index) {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Missing moved bookmark");
    const old = this.siblings(node.parentId);
    old.splice(
      old.findIndex((n) => n.id === id),
      1
    );
    this.reindex(old);
    node.parentId = parentId;
    const target = this.siblings(parentId);
    target.splice(Math.min(index, target.length), 0, node);
    this.reindex(target);
    const parent = this.nodes.get(parentId);
    this.index(node, [parent.path, parent.title].filter(Boolean).join(" / "));
  }
  reorder(parentId, ids2) {
    const siblings = this.siblings(parentId);
    const rank = new Map(ids2.map((id, i) => [id, i]));
    siblings.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    this.reindex(siblings);
  }
  drain() {
    const value = { changed: [...this.changed], removed: [...this.removed] };
    this.changed.clear();
    this.removed.clear();
    return value;
  }
};
var TabStore = class {
  nodes = /* @__PURE__ */ new Map();
  changed = /* @__PURE__ */ new Set();
  removed = /* @__PURE__ */ new Set();
  constructor(tabs = []) {
    for (const tab of tabs) this.upsert(tab);
  }
  upsert(tab) {
    if (tab.id === void 0) return;
    this.nodes.set(tab.id, { ...tab });
    this.changed.add(tab.id);
    this.removed.delete(tab.id);
  }
  insert(tab) {
    if (tab.id === void 0) return;
    const siblings = [...this.nodes.values()].filter((t) => t.windowId === tab.windowId && t.id !== tab.id).sort((a, b) => a.index - b.index);
    siblings.splice(Math.min(tab.index, siblings.length), 0, tab);
    siblings.forEach((t, index) => {
      if (t.id === tab.id || t.index !== index) this.upsert({ ...t, index });
    });
  }
  remove(id) {
    const removed = this.nodes.get(id);
    this.nodes.delete(id);
    this.changed.delete(id);
    this.removed.add(id);
    if (removed)
      [...this.nodes.values()].filter((t) => t.windowId === removed.windowId).sort((a, b) => a.index - b.index).forEach((t, index) => {
        if (t.index !== index) this.upsert({ ...t, index });
      });
  }
  activate(id, windowId2) {
    for (const tab of this.nodes.values())
      if (tab.windowId === windowId2 && tab.active !== (tab.id === id))
        this.upsert({ ...tab, active: tab.id === id });
  }
  move(id, windowId2, index) {
    const tab = this.nodes.get(id);
    if (!tab) return;
    const siblings = [...this.nodes.values()].filter((t) => t.windowId === windowId2 && t.id !== id).sort((a, b) => a.index - b.index);
    siblings.splice(index, 0, { ...tab, windowId: windowId2 });
    siblings.forEach((t, index2) => {
      if (t.index !== index2 || t.id === id) this.upsert({ ...t, index: index2 });
    });
  }
  drain() {
    const value = { changed: [...this.changed], removed: [...this.removed] };
    this.changed.clear();
    this.removed.clear();
    return value;
  }
};

// src/browser.ts
var init;
var bookmarkStore = new BookmarkStore();
var tabStore = new TabStore();
var prefs = migrate(null);
var session = readSession(null);
var windowId;
var shortcuts = [];
var initial = true;
var sessionChanged = true;
var preferencesChanged = true;
var hydrated = false;
var pending = [];
var subscribers = /* @__PURE__ */ new Set();
var timer;
var notify = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = void 0;
    for (const fn of subscribers) fn();
  }, 40);
};
var recovering = false;
async function recover() {
  if (recovering) return;
  recovering = true;
  try {
    bookmarkStore.reset(await chrome.bookmarks.getTree());
    notify();
  } finally {
    recovering = false;
  }
}
var apply = (fn) => {
  if (!hydrated) {
    pending.push(fn);
    return;
  }
  try {
    fn();
    notify();
  } catch {
    void recover();
  }
};
async function refreshTab(id) {
  try {
    const tab = await chrome.tabs.get(id);
    const win = await chrome.windows.get(tab.windowId);
    apply(
      () => win.type === "normal" ? tabStore.nodes.has(id) ? tabStore.upsert(tab) : tabStore.insert(tab) : tabStore.remove(id)
    );
  } catch {
    apply(() => tabStore.remove(id));
  }
}
function start() {
  if (init) return init;
  chrome.bookmarks.onCreated.addListener(
    (_id, node) => apply(() => bookmarkStore.create(node))
  );
  chrome.bookmarks.onChanged.addListener(
    (id, change) => apply(() => bookmarkStore.update(id, change))
  );
  chrome.bookmarks.onMoved.addListener(
    (id, info) => apply(() => bookmarkStore.move(id, info.parentId, info.index))
  );
  chrome.bookmarks.onRemoved.addListener(
    (id) => apply(() => bookmarkStore.remove(id))
  );
  chrome.bookmarks.onChildrenReordered.addListener(
    (id, info) => apply(() => bookmarkStore.reorder(id, info.childIds))
  );
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id !== void 0) void refreshTab(tab.id);
  });
  chrome.tabs.onUpdated.addListener((id, _change, tab) => {
    if (tabStore.nodes.has(id)) apply(() => tabStore.upsert(tab));
    else void refreshTab(id);
  });
  chrome.tabs.onRemoved.addListener((id) => apply(() => tabStore.remove(id)));
  chrome.tabs.onMoved.addListener(
    (id, info) => apply(() => tabStore.move(id, info.windowId, info.toIndex))
  );
  chrome.tabs.onActivated.addListener(
    (info) => apply(() => tabStore.activate(info.tabId, info.windowId))
  );
  chrome.tabs.onDetached.addListener((id) => apply(() => tabStore.remove(id)));
  chrome.tabs.onAttached.addListener((id) => void refreshTab(id));
  chrome.tabs.onReplaced.addListener((added, removed) => {
    apply(() => tabStore.remove(removed));
    void refreshTab(added);
  });
  chrome.storage.onChanged.addListener(
    (changes, area) => apply(() => {
      if (area === "local" && changes.preferences) {
        prefs = migrate(changes.preferences.newValue);
        preferencesChanged = true;
      }
      if (area === "session" && changes.session) {
        session = readSession(changes.session.newValue);
        sessionChanged = true;
      }
    })
  );
  init = Promise.all([
    chrome.storage.local.get("preferences"),
    chrome.storage.session.get("session"),
    chrome.bookmarks.getTree(),
    chrome.tabs.query({ windowType: "normal" }),
    chrome.windows.getCurrent(),
    chrome.commands.getAll()
  ]).then(([local, stored, tree, tabs, win, bindings]) => {
    prefs = migrate(local.preferences);
    session = readSession(stored.session);
    bookmarkStore = new BookmarkStore(tree);
    tabStore = new TabStore(tabs);
    windowId = win.id;
    shortcuts = bindings;
    hydrated = true;
    for (const fn of pending.splice(0)) apply(fn);
  });
  return init;
}
async function snapshot() {
  await start();
  const b = bookmarkStore.drain(), t = tabStore.drain();
  const effective = { ...prefs };
  if (!effective.bookmarkRootId)
    effective.bookmarkRootId = [...bookmarkStore.nodes.values()].find(
      (n) => n.folderType === "bookmarks-bar"
    )?.id ?? null;
  const tabs = [...tabStore.nodes.values()];
  const changes = {
    bookmarks: b.changed,
    removedBookmarks: b.removed,
    tabs: t.changed,
    removedTabs: t.removed,
    session: sessionChanged,
    preferences: preferencesChanged,
    initial
  };
  initial = false;
  sessionChanged = false;
  preferencesChanged = false;
  return {
    prefs: effective,
    needsSetup: prefs.bookmarkRootId === null,
    session,
    tree: bookmarkStore.roots,
    tabs,
    windowId,
    active: tabs.find((t2) => t2.windowId === windowId && t2.active),
    shortcuts,
    bookmarks: bookmarkStore,
    changes
  };
}
async function preferences(p) {
  await chrome.storage.local.set({ preferences: migrate(p) });
}
function watch(refresh2) {
  subscribers.add(refresh2);
  void start().catch(() => refresh2());
  return () => subscribers.delete(refresh2);
}
async function request(action, args = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...args });
  if (!response?.ok)
    throw new Error(
      response?.error ?? "arcify could not complete this action. Please try again."
    );
  return response.value;
}

// src/commands.ts
var commands = [
  {
    id: "downloads",
    label: "Manage downloads in Chrome",
    aliases: "downloads files recent"
  },
  { id: "new-tab", label: "New blank tab", aliases: "new tab create" },
  { id: "toggle-sidebar", label: "Toggle sidebar", aliases: "panel show hide" },
  { id: "show-sidebar", label: "Show sidebar", aliases: "panel open" },
  { id: "hide-sidebar", label: "Hide sidebar", aliases: "panel close" },
  {
    id: "fullscreen",
    label: "Toggle fullscreen",
    aliases: "full screen restore"
  },
  {
    id: "close-tab",
    label: "Close current tab",
    aliases: "close remove",
    needsTab: true
  },
  {
    id: "reload",
    label: "Reload current tab",
    aliases: "refresh",
    needsTab: true
  },
  {
    id: "mute",
    label: "Mute or unmute current tab",
    aliases: "audio sound",
    needsTab: true
  },
  {
    id: "pin",
    label: "Pin or unpin in Chrome",
    aliases: "native pinned",
    needsTab: true
  },
  {
    id: "save",
    label: "Save current tab to folder",
    aliases: "bookmark",
    needsTab: true
  },
  {
    id: "favourite",
    label: "Add current tab to favourites",
    aliases: "favorite bookmark",
    needsTab: true
  },
  { id: "collapse-saved", label: "Collapse saved", aliases: "folders" },
  { id: "jump-open", label: "Jump to open tabs", aliases: "temporary" },
  { id: "settings", label: "Settings", aliases: "theme privacy help" },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    aliases: "configure bindings"
  }
];
function available(c, ctx) {
  return !c.needsTab || ctx.tabId !== void 0;
}
async function executeCommand(id, ctx) {
  const c = commands.find((c2) => c2.id === id);
  if (!c || !available(c, ctx))
    throw new Error("This action needs an open content tab.");
  await ctx.execute(id);
}

// src/ui.ts
function el(tag, text = "", className = "") {
  const e = document.createElement(tag);
  e.textContent = text;
  e.className = className;
  return e;
}
function button(label, fn, className = "") {
  const b = el("button", label, className);
  b.type = "button";
  b.addEventListener("click", () => void safely(fn));
  return b;
}
async function safely(fn) {
  try {
    await fn();
  } catch (error) {
    showError(error);
  }
}
function showError(error) {
  let status = document.querySelector("#status");
  if (!status) {
    status = el("div", "", "status");
    status.id = "status";
    status.role = "alert";
    document.body.append(status);
  }
  status.replaceChildren(
    el("span", error instanceof Error ? error.message : String(error)),
    button("Dismiss", () => status.remove())
  );
}
function theme(s) {
  document.documentElement.dataset.theme = s.prefs.theme;
}
function short(s, name) {
  return s.shortcuts.find((c) => c.name === name)?.shortcut || "Not assigned";
}
function monogram(title) {
  return [...title.trim()][0]?.toUpperCase() || "\u2022";
}
async function sheet(title, fields, s, save, folder = false) {
  const dialog = el("dialog");
  const form = el("form");
  form.append(el("h2", title));
  const values = {};
  for (const f of fields) {
    const label = el("label", f.label);
    const input = el("input");
    input.name = f.name;
    input.value = f.value ?? "";
    input.required = true;
    label.append(input);
    form.append(label);
    values[f.name] = input;
  }
  if (folder) {
    const label = el("label", "Destination folder");
    const search = el("input");
    search.placeholder = "Find a folder\u2026";
    search.setAttribute("aria-label", "Find destination folder");
    const select = el("select");
    select.size = 6;
    select.required = true;
    const nodes = flatten(s.tree).filter(
      (b) => !b.url && b.parentId && !b.unmodifiable
    );
    const fill = () => {
      select.replaceChildren(
        ...nodes.filter(
          (n) => (n.path + " " + n.title).toLowerCase().includes(search.value.toLowerCase())
        ).map((n) => {
          const o = el("option", (n.path ? n.path + " / " : "") + n.title);
          o.value = n.id;
          return o;
        })
      );
    };
    fill();
    select.value = s.prefs.bookmarkRootId ?? nodes[0]?.id ?? "";
    search.oninput = fill;
    label.append(search, select);
    form.append(label);
    values.parentId = select;
  }
  const error = el("p", "", "error");
  error.role = "alert";
  const footer = el("div", "", "dialog-actions");
  const submit = el("button", "Save");
  submit.type = "submit";
  footer.append(
    button("Cancel", () => dialog.close()),
    submit
  );
  form.append(error, footer);
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await save(
        Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, v.value])
        )
      );
      dialog.close();
    } catch (e2) {
      error.textContent = e2 instanceof Error ? e2.message : String(e2);
      submit.disabled = false;
    }
  };
  dialog.showModal();
  form.querySelector("input,select")?.focus();
}
function menu(anchor, items) {
  document.querySelector("#context-menu")?.remove();
  const d = el("dialog", "", "menu");
  d.id = "context-menu";
  d.setAttribute("aria-label", "Actions");
  for (const item of items) {
    const b = button(item.label, () => {
      d.close();
      return item.run();
    });
    b.disabled = !!item.disabled;
    d.append(b);
  }
  d.append(button("Cancel", () => d.close()));
  document.body.append(d);
  d.addEventListener("close", () => {
    d.remove();
    anchor.focus();
  });
  d.addEventListener("keydown", (e) => {
    const buttons = [
      ...d.querySelectorAll("button:not(:disabled)")
    ];
    let i = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      i = (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[i]?.focus();
    }
  });
  d.showModal();
}
async function saveTab(s, tab, favourite = false) {
  if (!tab?.url) throw new Error("No supported content tab is selected.");
  await sheet(
    favourite ? "Save to favourites" : "Save to folder",
    [
      { name: "title", label: "Title", value: tab.title },
      { name: "url", label: "URL", value: tab.url }
    ],
    s,
    async (v) => {
      await request("save", { ...v, favourite });
    },
    true
  );
}
async function runCommand(id, s) {
  await executeCommand(id, {
    windowId: s.windowId,
    tabId: s.active?.id,
    panel: document.body.dataset.page === "sidebar",
    execute: async (id2) => {
      if (id2 === "save" || id2 === "favourite") {
        await saveTab(s, s.active, id2 === "favourite");
        return;
      }
      if (id2 === "collapse-saved") {
        await preferences({ ...s.prefs, savedCollapsed: true });
        return;
      }
      if (id2 === "jump-open") {
        await request("show-sidebar", { windowId: s.windowId });
        await chrome.storage.session.set({ jumpOpen: s.windowId });
        return;
      }
      await request(id2, { windowId: s.windowId, tabId: s.active?.id });
      if (document.body.dataset.page === "palette" && ["new-tab", "close-tab", "settings", "shortcuts"].includes(id2))
        window.close();
    }
  });
}
function bookmarkMenu(anchor, b, s, associated) {
  const write = movable(b);
  const rows = [];
  if (b.url)
    rows.push(
      {
        label: "Open",
        run: () => request("activate", { bookmarkId: b.id, windowId: s.windowId })
      },
      {
        label: "Open new tab",
        run: () => request("activate", {
          bookmarkId: b.id,
          windowId: s.windowId,
          fresh: true
        })
      },
      {
        label: "Reset to saved URL",
        disabled: associated === void 0,
        run: () => request("reset", { bookmarkId: b.id, windowId: s.windowId })
      },
      {
        label: "Close live tab",
        disabled: associated === void 0,
        run: () => request("close-tab", { tabId: associated })
      },
      {
        label: s.prefs.favourites.includes(b.id) ? "Remove from favourites" : "Add to favourites",
        run: () => request(
          s.prefs.favourites.includes(b.id) ? "unfavourite" : "favourite",
          { bookmarkId: b.id }
        )
      }
    );
  if (s.prefs.favourites.includes(b.id))
    rows.push(
      {
        label: "Move favourite earlier",
        disabled: s.prefs.favourites[0] === b.id,
        run: () => request("reorder-favourite", {
          bookmarkId: b.id,
          direction: "earlier"
        })
      },
      {
        label: "Move favourite later",
        disabled: s.prefs.favourites.at(-1) === b.id,
        run: () => request("reorder-favourite", {
          bookmarkId: b.id,
          direction: "later"
        })
      }
    );
  rows.push(
    { label: "Customize appearance\u2026", run: () => appearanceEditor(s, b.id) },
    {
      label: "Move bookmark earlier",
      disabled: !write || b.index === 0,
      run: () => request("move", { bookmarkId: b.id, direction: "earlier" })
    },
    {
      label: "Move bookmark later",
      disabled: !write,
      run: () => request("move", { bookmarkId: b.id, direction: "later" })
    },
    {
      label: write ? b.url ? "Edit bookmark" : "Rename folder" : "Read-only item \u2014 editing unavailable",
      disabled: !write,
      run: () => sheet(
        "Edit " + (b.url ? "bookmark" : "folder"),
        [
          { name: "title", label: "Title", value: b.title },
          ...b.url ? [{ name: "url", label: "URL", value: b.url }] : []
        ],
        s,
        (v) => request("edit", { bookmarkId: b.id, ...v })
      )
    },
    {
      label: "Move\u2026",
      disabled: !write,
      run: () => sheet(
        "Move item",
        [],
        s,
        (v) => request("move", { bookmarkId: b.id, ...v }),
        true
      )
    },
    {
      label: b.url ? "Delete bookmark\u2026" : "Delete folder\u2026",
      disabled: !write,
      run: () => {
        if (confirm(
          b.url ? "Delete this native bookmark? Its live tab will remain open." : `Delete this folder and ${descendants(b)} descendants?`
        ))
          return request("delete", { bookmarkId: b.id });
      }
    }
  );
  menu(anchor, rows);
}
function tabMenu(anchor, t, s) {
  menu(anchor, [
    {
      label: "Customize appearance\u2026",
      run: () => appearanceEditor(s, void 0, t.id)
    },
    { label: "Close", run: () => request("close-tab", { tabId: t.id }) },
    {
      label: "Duplicate",
      run: () => request("duplicate", { tabId: t.id, windowId: s.windowId })
    },
    { label: "Reload", run: () => request("reload", { tabId: t.id }) },
    {
      label: t.mutedInfo?.muted ? "Unmute" : "Mute",
      run: () => request("mute", { tabId: t.id })
    },
    {
      label: t.pinned ? "Unpin in Chrome" : "Pin in Chrome",
      run: () => request("pin", { tabId: t.id })
    },
    {
      label: "Move earlier",
      run: () => request("move-tab", { tabId: t.id, index: Math.max(0, t.index - 1) })
    },
    {
      label: "Move later",
      run: () => request("move-tab", { tabId: t.id, index: t.index + 1 })
    },
    { label: "Save to folder", run: () => saveTab(s, t) },
    { label: "Add to favourites", run: () => saveTab(s, t, true) },
    {
      label: "Show in palette",
      run: async () => {
        await chrome.action.openPopup();
      }
    }
  ]);
}
function appearanceEditor(s, bookmarkId, tabId) {
  const original = bookmarkId ? flatten(s.tree).find((b) => b.id === bookmarkId) : s.tabs.find((t) => t.id === tabId);
  const current = bookmarkId ? s.prefs.customizations?.[bookmarkId] : s.session.tabCustomizations?.[String(tabId)];
  let image = current?.image;
  const dialog = el("dialog"), form = el("form");
  form.append(
    el("h2", "Customize appearance"),
    el(
      "p",
      bookmarkId ? "Only changes how this item looks in arcify. Native bookmark names stay unchanged." : "Local to this live tab, including navigation. Cleared when it closes or Chrome restarts.",
      "hint"
    )
  );
  const name = el("input");
  name.value = current?.name ?? "";
  name.maxLength = 120;
  name.placeholder = original?.title ?? "Original name";
  const emoji = el("input");
  emoji.value = current?.emoji ?? "";
  emoji.maxLength = 16;
  emoji.placeholder = "Emoji or short icon";
  for (const [label2, input] of [
    ["Display name", name],
    ["Icon replacement", emoji]
  ]) {
    const l = el("label", label2);
    l.append(input);
    form.append(l);
  }
  const file = el("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp";
  const label = el("label", "Local image \xB7 PNG, JPEG or WebP \xB7 up to 2 MB");
  label.append(file);
  form.append(label);
  const preview = el("div", "", "appearance-preview"), error = el("p", "", "error");
  error.role = "alert";
  const paint = () => preview.replaceChildren(
    siteIcon(
      name.value || original?.title || "Item",
      original?.url,
      emoji.value,
      image
    )
  );
  paint();
  emoji.oninput = () => {
    image = void 0;
    paint();
  };
  name.oninput = paint;
  let loading = false;
  file.onchange = async () => {
    if (!file.files?.[0]) return;
    loading = true;
    error.textContent = "";
    try {
      image = await localImage(file.files[0]);
      emoji.value = "";
      paint();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  };
  const submit = el("button", "Save");
  submit.type = "submit";
  const commit = async (appearance) => {
    submit.disabled = true;
    try {
      await request("customize", { bookmarkId, tabId, appearance });
      dialog.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      submit.disabled = false;
    }
  };
  const footer = el("div", "", "dialog-actions");
  footer.append(
    button("Reset to original", () => commit({})),
    button("Cancel", () => dialog.close()),
    submit
  );
  form.append(preview, error, footer);
  dialog.append(form);
  document.body.append(dialog);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!loading)
      void commit({
        name: name.value,
        emoji: emoji.value,
        ...image ? { image } : {}
      });
  };
  dialog.onclose = () => dialog.remove();
  dialog.showModal();
  name.focus();
}

// src/downloads-ui.ts
function downloadsView(store, windowId2) {
  const section = el("section", "", "downloads-view");
  section.ariaLabel = "Recent downloads";
  const heading = el("div", "", "download-heading");
  heading.append(
    el("h2", "Downloads"),
    button("Manage in Chrome", () => request("downloads", { windowId: windowId2 }))
  );
  section.append(
    heading,
    el("p", "Your 50 most recent downloads \xB7 stays on this device", "hint")
  );
  if (store.error) {
    const error = el("p", store.error, "error");
    error.role = "alert";
    section.append(
      error,
      button("Try again", () => store.refresh())
    );
  }
  if (!store.items.length && !store.error)
    section.append(
      el("p", "No recent downloads", "empty"),
      el("p", "Files you download in Chrome will appear here.", "hint")
    );
  for (const d of store.items) {
    const row = el("article", "", "download-row"), copy = el("div", "", "download-copy");
    const date = new Date(d.start);
    const detail = downloadStatus(d) + (Number.isFinite(date.valueOf()) ? " \xB7 " + date.toLocaleDateString(void 0, { month: "short", day: "numeric" }) : "");
    copy.append(
      el("div", d.name, "row-label"),
      el("div", detail, "result-detail")
    );
    if (d.state === "in_progress") {
      const progress = el("progress");
      progress.max = 100;
      if (d.total > 0)
        progress.value = Math.min(100, d.received / d.total * 100);
      progress.ariaLabel = "Download progress for " + d.name;
      copy.append(progress);
    }
    if (!["safe", "accepted", "allowlistedByPolicy", "deepScannedSafe"].includes(
      d.danger
    ))
      copy.append(el("div", "Review safety status in Chrome", "hint"));
    const reveal = button(
      "Reveal",
      () => request("reveal-download", { downloadId: d.id }),
      "download-reveal"
    );
    reveal.dataset.key = "download-" + d.id;
    reveal.disabled = !canReveal(d);
    reveal.ariaLabel = "Reveal " + d.name + " in Finder or file manager";
    row.append(icon("download"), copy, reveal);
    section.append(row);
  }
  return section;
}

// src/tree-view.ts
var PAGE_SIZE = 80;
function treeRows(children, expanded, favourites, active) {
  const rows = [];
  const activeChild = (nodes) => {
    for (const n of nodes) {
      if (n.url && active.has(n.id) && !favourites.has(n.id)) return n;
      const child = activeChild(n.children ?? []);
      if (child) return child;
    }
    return void 0;
  };
  const visit = (nodes, depth) => {
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
function pageRange(length, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(length / size));
  const safe = Math.max(0, Math.min(page, pages - 1));
  return {
    page: safe,
    start: safe * size,
    end: Math.min(length, (safe + 1) * size),
    pages
  };
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

// src/resolver.ts
function owners(bookmarks, favourites, windowId2, tabs, session2) {
  const lookup = resolutionIndex(windowId2, tabs, session2);
  const ordered = [
    ...favourites.map((id) => bookmarks.find((b) => b.id === id)).filter((b) => !!b),
    ...bookmarks.filter((b) => !favourites.includes(b.id))
  ];
  const result = /* @__PURE__ */ new Map();
  for (const b of ordered) {
    if (!b.url) continue;
    const t = lookup(b);
    if (t?.id !== void 0 && !result.has(t.id)) result.set(t.id, b.id);
  }
  return result;
}
function resolutionIndex(windowId2, tabs, session2) {
  const current = tabs.filter((t) => t.windowId === windowId2), byId = new Map(current.map((t) => [t.id, t]));
  const recency = new Map(session2.mru.map((id, index) => [id, index]));
  const sorted = [...current].sort(
    (a, b) => Number(b.active) - Number(a.active) || (recency.get(a.id) ?? 1e9) - (recency.get(b.id) ?? 1e9) || a.index - b.index
  );
  const byURL = /* @__PURE__ */ new Map();
  for (const tab of sorted) {
    const key = canonical(tab.url ?? "");
    if (key && !byURL.has(key)) byURL.set(key, tab);
  }
  return (b) => byId.get(session2.associations[windowId2]?.[b.id]) ?? byURL.get(canonical(b.url ?? "") ?? "");
}

// src/sidebar.ts
var state;
var sectionMode = "tabs";
var downloads = new DownloadStore(chrome.downloads);
downloads.watch(() => {
  if (state && sectionMode === "downloads") render();
});
var port;
var rendering = false;
var again = false;
var savedPage = 0;
var tabPage = 0;
var disclosed = [];
function focusBookmark(id) {
  const index = disclosed.findIndex((r) => r.node.id === id);
  if (index >= 0) {
    savedPage = Math.floor(index / 80);
    render();
    document.querySelector(`[data-key="bm-${CSS.escape(id)}"]`)?.focus();
  }
}
function pager(length, page, onPage, key) {
  const range = pageRange(length, page);
  const nav = el("nav", "", "pager");
  nav.ariaLabel = key + " pages";
  const previous = button("Previous", () => onPage(range.page - 1));
  previous.disabled = range.page === 0;
  previous.dataset.key = key + "-previous";
  const next = button("Next", () => onPage(range.page + 1));
  next.disabled = range.page === range.pages - 1;
  next.dataset.key = key + "-next";
  nav.append(
    previous,
    el("span", `${range.start + 1}\u2013${range.end} of ${length}`),
    next
  );
  return nav;
}
var root = document.querySelector("#app");
var drag;
function dragSource(e, kind, id) {
  e.draggable = true;
  e.ondragstart = (event) => {
    drag = { kind, id };
    event.dataTransfer?.setData("text/plain", JSON.stringify(drag));
  };
  e.ondragend = () => {
    drag = void 0;
    document.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop"));
  };
}
function dropTarget(e, b, tab, favourite = false) {
  e.ondragover = (event) => {
    if (!drag) return;
    event.preventDefault();
    e.classList.add("drop");
    const fraction = (event.clientY - e.getBoundingClientRect().top) / e.clientHeight;
    e.dataset.drop = b && !b.url && fraction > 0.25 && fraction < 0.75 ? "inside" : fraction < 0.5 ? "before" : "after";
  };
  e.ondragleave = () => e.classList.remove("drop");
  e.ondrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    e.classList.remove("drop");
    const source = drag;
    drag = void 0;
    if (!source) return;
    void safely(async () => {
      if (favourite) {
        if (source.kind === "favourite" && b) {
          await request("reorder-favourite", {
            bookmarkId: source.id,
            targetId: b.id,
            placement: e.dataset.drop === "after" ? "after" : "before"
          });
        } else if (source.kind === "tab")
          await saveTab(
            state,
            state.tabs.find((t) => t.id === Number(source.id)),
            true
          );
        else await request("favourite", { bookmarkId: source.id });
        return;
      }
      if (tab && source.kind === "tab") {
        await request("move-tab", {
          tabId: Number(source.id),
          index: tab.index
        });
        return;
      }
      if (!b) return;
      if (source.kind === "tab") {
        await sheet(
          "Save to folder",
          [
            {
              name: "title",
              label: "Title",
              value: state.tabs.find((t) => t.id === Number(source.id))?.title
            },
            {
              name: "url",
              label: "URL",
              value: state.tabs.find((t) => t.id === Number(source.id))?.url
            }
          ],
          state,
          (v) => request("save", { ...v, parentId: b.url ? b.parentId : b.id })
        );
        return;
      }
      await request("move", {
        bookmarkId: source.id,
        targetId: b.id,
        placement: e.dataset.drop
      });
    });
  };
}
async function refresh() {
  if (rendering) {
    again = true;
    return;
  }
  rendering = true;
  try {
    state = await snapshot();
    theme(state);
    if (!port) {
      port = chrome.runtime.connect({ name: "panel:" + state.windowId });
      port.onDisconnect.addListener(() => {
        port = chrome.runtime.connect({ name: "panel:" + state.windowId });
      });
    }
    render();
  } finally {
    rendering = false;
    if (again) {
      again = false;
      void refresh();
    }
  }
}
function render() {
  const focused = document.activeElement?.dataset.key;
  const oldScroll = document.querySelector(".scroll")?.scrollTop ?? 0;
  const all = flatten(state.tree), chosen = all.find((n) => n.id === state.prefs.bookmarkRootId);
  const lookup = resolutionIndex(state.windowId, state.tabs, state.session);
  const visible = chosen ? flatten(chosen.children ?? []) : [];
  const owner = owners(
    [
      ...state.prefs.favourites.map((id) => all.find((b) => b.id === id)).filter((b) => !!b),
      ...visible
    ],
    state.prefs.favourites,
    state.windowId,
    state.tabs,
    state.session
  );
  root.replaceChildren();
  const tabsNav = el("nav", "", "surface-tabs");
  tabsNav.ariaLabel = "Sidebar views";
  for (const mode of ["tabs", "downloads"]) {
    const control = button(mode === "tabs" ? "Tabs" : "Downloads", () => {
      sectionMode = mode;
      render();
    });
    control.setAttribute("aria-pressed", String(sectionMode === mode));
    tabsNav.append(control);
  }
  root.append(tabsNav);
  if (sectionMode === "downloads") {
    const scroll2 = el("div", "", "scroll");
    scroll2.append(downloadsView(downloads, state.windowId));
    root.append(scroll2);
    if (focused)
      root.querySelector('[data-key="' + CSS.escape(focused) + '"]')?.focus();
    scroll2.scrollTop = oldScroll;
    return;
  }
  const header = el("header");
  header.append(
    button(
      "\u2315  Search or jump",
      () => chrome.action.openPopup(),
      "search-trigger"
    ),
    button(
      "\u2039",
      () => request("hide-sidebar", { windowId: state.windowId }),
      "icon"
    )
  );
  const more = button(
    "\u2022\u2022\u2022",
    () => menu(more, [
      { label: "New blank tab", run: () => runCommand("new-tab", state) },
      {
        label: "Create folder",
        run: () => sheet(
          "Create folder",
          [{ name: "title", label: "Folder name" }],
          state,
          (v) => request("save", v),
          true
        )
      },
      {
        label: "Collapse saved",
        run: () => runCommand("collapse-saved", state)
      },
      { label: "Jump to open tabs", run: () => jump() }
    ]),
    "icon"
  );
  more.ariaLabel = "More actions";
  header.append(more);
  const search = header.querySelector("button");
  search.replaceChildren(
    icon("search"),
    el("span", "Search or jump"),
    el("kbd", short(state, "_execute_action"))
  );
  header.children[1].replaceChildren(icon("panel"));
  more.replaceChildren(icon("more"));
  header.querySelectorAll("button").forEach((b, i) => b.dataset.key = "header-" + i);
  header.children[1].setAttribute("aria-label", "Close arcify sidebar");
  root.append(header);
  const scroll = el("main", "", "scroll");
  const fav = el("div", "", "favourites");
  fav.ariaLabel = "Favourites";
  dropTarget(fav, void 0, void 0, true);
  for (const id of state.prefs.favourites) {
    const b = all.find((n) => n.id === id);
    if (!b) continue;
    const t = lookup(b);
    const tile = button(
      state.prefs.icons[id] || monogram(b.title),
      () => request("activate", { bookmarkId: id, windowId: state.windowId }),
      "tile" + (t?.active ? " active" : "")
    );
    tile.replaceChildren(
      siteIcon(
        state.prefs.customizations?.[id]?.name ?? b.title,
        b.url,
        state.prefs.customizations?.[id]?.emoji ?? state.prefs.icons[id],
        state.prefs.customizations?.[id]?.image
      )
    );
    if (t) tile.classList.add("is-open");
    tile.title = tile.ariaLabel = (state.prefs.customizations?.[b.id]?.name || b.title) + " \u2014 " + b.url + (t?.url && t.url !== b.url ? " \xB7 Current: " + t.url : "");
    tile.dataset.key = "fav-" + id;
    tile.onkeydown = (e) => {
      if (e.key === "ContextMenu" || e.shiftKey && e.key === "F10") {
        e.preventDefault();
        bookmarkMenu(
          tile,
          b,
          state,
          state.session.associations[state.windowId]?.[id]
        );
      }
    };
    tile.oncontextmenu = (e) => {
      e.preventDefault();
      bookmarkMenu(
        tile,
        b,
        state,
        state.session.associations[state.windowId]?.[id]
      );
    };
    dragSource(tile, "favourite", id);
    dropTarget(tile, b, void 0, true);
    fav.append(tile);
  }
  if (state.prefs.favourites.length) scroll.append(fav);
  const saved = button(
    (state.prefs.savedCollapsed ? "\u203A" : "\u2304") + "  Saved",
    () => preferences({
      ...state.prefs,
      savedCollapsed: !state.prefs.savedCollapsed
    }),
    "section-title"
  );
  saved.setAttribute("aria-expanded", String(!state.prefs.savedCollapsed));
  saved.dataset.key = "saved-collapse";
  saved.replaceChildren(
    icon(state.prefs.savedCollapsed ? "chevron" : "down"),
    el("span", "Saved")
  );
  scroll.append(saved);
  if (state.needsSetup || !chosen) {
    const setup = el("section", "", "setup");
    setup.append(
      el(
        "p",
        chosen ? "Choose your saved-links folder" : "That saved folder is no longer available. Choose another folder."
      )
    );
    const picker = el("select");
    picker.ariaLabel = "Bookmark root folder";
    for (const folder of all.filter((n) => !n.url && n.parentId)) {
      const option = el(
        "option",
        [folder.path, folder.title].filter(Boolean).join(" / ") + (folder.unmodifiable ? " (read-only)" : "")
      );
      option.value = folder.id;
      picker.append(option);
    }
    picker.value = state.prefs.bookmarkRootId ?? "";
    if (!picker.value && picker.options.length) picker.selectedIndex = 0;
    setup.append(
      picker,
      button(
        "Use folder",
        () => preferences({ ...state.prefs, bookmarkRootId: picker.value })
      ),
      button(
        "Use default",
        () => preferences({
          ...state.prefs,
          bookmarkRootId: all.find((n) => n.folderType === "bookmarks-bar")?.id ?? picker.value
        })
      )
    );
    scroll.append(setup);
  }
  const row = (b, depth, context = false) => {
    if (b.url && state.prefs.favourites.includes(b.id)) return;
    const t = b.url ? lookup(b) : void 0;
    const wrapper = el(
      "div",
      "",
      "row" + (t?.active ? " active" : "") + (context ? " contextual" : "")
    );
    wrapper.dataset.depth = String(Math.min(depth, 8));
    const expanded = state.prefs.expanded.includes(b.id);
    const target = button(
      (b.url ? monogram(b.title) : expanded ? "\u2304" : "\u203A") + "  " + (b.title || "Untitled"),
      () => b.url ? request("activate", { bookmarkId: b.id, windowId: state.windowId }) : preferences({
        ...state.prefs,
        expanded: expanded ? state.prefs.expanded.filter((id) => id !== b.id) : [...state.prefs.expanded, b.id]
      }),
      "row-main"
    );
    target.replaceChildren(
      ...b.url ? [
        siteIcon(
          b.title,
          b.url,
          state.prefs.customizations?.[b.id]?.emoji,
          state.prefs.customizations?.[b.id]?.image
        )
      ] : [
        icon(expanded ? "down" : "chevron"),
        state.prefs.customizations?.[b.id]?.emoji || state.prefs.customizations?.[b.id]?.image ? siteIcon(
          b.title,
          void 0,
          state.prefs.customizations?.[b.id]?.emoji,
          state.prefs.customizations?.[b.id]?.image
        ) : icon("folder")
      ],
      el(
        "span",
        state.prefs.customizations?.[b.id]?.name || b.title || "Untitled",
        "row-label"
      )
    );
    target.dataset.key = "bm-" + b.id;
    target.title = (state.prefs.customizations?.[b.id]?.name || b.title) + (b.url ? " \u2014 " + b.url : "") + (t?.url && t.url !== b.url ? " \xB7 Current: " + t.url : "");
    if (!b.url) target.setAttribute("aria-expanded", String(expanded));
    target.onkeydown = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const index = disclosed.findIndex((r) => r.node.id === b.id);
        const next = disclosed[index + (e.key === "ArrowDown" ? 1 : -1)];
        if (next) focusBookmark(next.node.id);
      }
      if (e.key === "ArrowRight" && !b.url) {
        e.preventDefault();
        if (!expanded) target.click();
        else {
          const child = disclosed[disclosed.findIndex((r) => r.node.id === b.id) + 1];
          if (child) focusBookmark(child.node.id);
        }
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (expanded && !b.url) target.click();
        else if (b.parentId) focusBookmark(b.parentId);
      }
    };
    target.oncontextmenu = (e) => {
      e.preventDefault();
      bookmarkMenu(
        target,
        b,
        state,
        state.session.associations[state.windowId]?.[b.id]
      );
    };
    wrapper.append(target);
    if (t) {
      wrapper.append(el("span", "\u2022", "open-dot"));
      const close = button(
        "\xD7",
        () => request("close-tab", { tabId: t.id }),
        "row-control"
      );
      close.replaceChildren(icon("close"));
      close.ariaLabel = "Close live tab for " + b.title;
      wrapper.append(close);
    }
    const overflow = button(
      "\u22EF",
      () => bookmarkMenu(
        target,
        b,
        state,
        state.session.associations[state.windowId]?.[b.id]
      ),
      "row-control"
    );
    overflow.replaceChildren(icon("more"));
    overflow.ariaLabel = "Actions for " + b.title;
    overflow.dataset.key = "actions-" + b.id;
    wrapper.append(overflow);
    dragSource(wrapper, "bookmark", b.id);
    dropTarget(wrapper, b);
    scroll.append(wrapper);
  };
  if (!chosen) {
  } else if (!state.prefs.savedCollapsed) {
    if (!chosen.children?.length)
      scroll.append(el("p", "No saved links in this folder.", "empty"));
    const activeIds = /* @__PURE__ */ new Set();
    for (const [tabId, id] of owner)
      if (state.tabs.find((t) => t.id === tabId)?.active) activeIds.add(id);
    disclosed = treeRows(
      chosen.children ?? [],
      new Set(state.prefs.expanded),
      new Set(state.prefs.favourites),
      activeIds
    );
    const range = pageRange(disclosed.length, savedPage);
    savedPage = range.page;
    for (const item of disclosed.slice(range.start, range.end))
      row(item.node, item.depth, item.contextual);
    if (range.pages > 1)
      scroll.append(
        pager(
          disclosed.length,
          savedPage,
          (next) => {
            savedPage = next;
            render();
            document.querySelector(".scroll .row-main")?.focus();
          },
          "Saved"
        )
      );
  }
  scroll.append(el("hr"));
  const newTab = button(
    "\uFF0B  New tab",
    () => chrome.action.openPopup(),
    "row-main new-tab"
  );
  newTab.replaceChildren(
    icon("plus"),
    el("span", "New tab"),
    el("kbd", short(state, "_execute_action"))
  );
  scroll.append(newTab);
  const open = el("h2", "Open tabs", "section-title");
  open.id = "open-tabs";
  open.tabIndex = -1;
  scroll.append(open);
  const tabs = state.tabs.filter((t) => t.windowId === state.windowId && !owner.has(t.id)).sort((a, b) => a.index - b.index);
  const tabRange = pageRange(tabs.length, tabPage);
  tabPage = tabRange.page;
  for (const t of tabs.slice(tabRange.start, tabRange.end)) {
    const r = el("div", "", "row" + (t.active ? " active" : ""));
    const main = button(
      (t.pinned ? "\u2316 " : monogram(t.title ?? "") + "  ") + (t.title || t.url || "New tab"),
      () => request("switch", { tabId: t.id }),
      "row-main"
    );
    main.replaceChildren(
      siteIcon(
        t.title ?? "Tab",
        t.url,
        state.session.tabCustomizations?.[String(t.id)]?.emoji,
        state.session.tabCustomizations?.[String(t.id)]?.image
      ),
      el(
        "span",
        state.session.tabCustomizations?.[String(t.id)]?.name || t.title || "New tab",
        "row-label"
      )
    );
    if (t.pinned) main.append(icon("pin"));
    main.title = t.url ?? "";
    main.dataset.key = "tab-" + t.id;
    main.oncontextmenu = (e) => {
      e.preventDefault();
      tabMenu(main, t, state);
    };
    const close = button(
      "\xD7",
      async () => {
        const i = tabs.indexOf(t);
        await request("close-tab", { tabId: t.id });
        const next = tabs[i + 1] ?? tabs[i - 1];
        if (next)
          tabPage = Math.floor(
            Math.max(
              0,
              tabs.filter((candidate) => candidate.id !== t.id).findIndex((t2) => t2.id === next.id)
            ) / 80
          );
        await refresh();
        document.querySelector(`[data-key="tab-${next?.id}"]`)?.focus();
      },
      "row-control"
    );
    close.replaceChildren(icon("close"));
    close.ariaLabel = "Close " + t.title;
    const more2 = button("\u22EF", () => tabMenu(main, t, state), "row-control");
    more2.replaceChildren(icon("more"));
    more2.ariaLabel = "Actions for " + t.title;
    r.append(main, more2, close);
    dragSource(r, "tab", String(t.id));
    dropTarget(r, void 0, t);
    scroll.append(r);
  }
  if (tabRange.pages > 1)
    scroll.append(
      pager(
        tabs.length,
        tabPage,
        (next) => {
          tabPage = next;
          render();
          document.querySelector("#open-tabs")?.focus();
        },
        "Open tabs"
      )
    );
  root.append(scroll);
  const footer = el("footer");
  footer.append(
    button("\u2699  Settings", () => runCommand("settings", state)),
    button("\u26F6", () => runCommand("fullscreen", state), "icon")
  );
  footer.querySelectorAll("button").forEach((b, i) => b.dataset.key = "footer-" + i);
  footer.children[1].setAttribute("aria-label", "Toggle browser fullscreen");
  const settings = footer.querySelector("button");
  settings.replaceChildren(icon("settings"), el("span", "Settings"));
  footer.children[1].replaceChildren(icon("fullscreen"));
  const brand = el("span", "", "brand");
  const logo = el("img");
  logo.src = "brand/arc-logo.svg";
  logo.alt = "";
  brand.append(logo, el("span", "arcify"));
  footer.insertBefore(brand, footer.children[1]);
  root.append(footer);
  scroll.scrollTop = oldScroll;
  if (focused)
    document.querySelector(
      `[data-key="${CSS.escape(focused)}"]`
    )?.focus();
}
function jump() {
  const target = document.querySelector("#open-tabs");
  target?.scrollIntoView({ block: "start" });
  target?.focus();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.jumpOpen?.newValue === state?.windowId)
    jump();
});
watch(() => void safely(refresh));
void safely(refresh);
