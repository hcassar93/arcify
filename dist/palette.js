// src/icons.ts
var paths = {
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
  const monogram = () => {
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
    img2.onerror = monogram;
    box.append(img2);
    return box;
  }
  if (override) {
    monogram();
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
      monogram();
      return;
    }
    box.classList.add("packaged");
    box.dataset.site = asset.split("/").at(-1)?.split(".")[0] ?? "";
    img.onerror = () => {
      img.onerror = null;
      monogram();
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
    children.forEach((n, index2) => {
      if (n.index !== index2) {
        n.index = index2;
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
  move(id, parentId, index2) {
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
    target.splice(Math.min(index2, target.length), 0, node);
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
    siblings.forEach((t, index2) => {
      if (t.id === tab.id || t.index !== index2) this.upsert({ ...t, index: index2 });
    });
  }
  remove(id) {
    const removed = this.nodes.get(id);
    this.nodes.delete(id);
    this.changed.delete(id);
    this.removed.add(id);
    if (removed)
      [...this.nodes.values()].filter((t) => t.windowId === removed.windowId).sort((a, b) => a.index - b.index).forEach((t, index2) => {
        if (t.index !== index2) this.upsert({ ...t, index: index2 });
      });
  }
  activate(id, windowId2) {
    for (const tab of this.nodes.values())
      if (tab.windowId === windowId2 && tab.active !== (tab.id === id))
        this.upsert({ ...tab, active: tab.id === id });
  }
  move(id, windowId2, index2) {
    const tab = this.nodes.get(id);
    if (!tab) return;
    const siblings = [...this.nodes.values()].filter((t) => t.windowId === windowId2 && t.id !== id).sort((a, b) => a.index - b.index);
    siblings.splice(index2, 0, { ...tab, windowId: windowId2 });
    siblings.forEach((t, index3) => {
      if (t.index !== index3 || t.id === id) this.upsert({ ...t, index: index3 });
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
function enteredURL(value) {
  const text = value.trim();
  if (/\s/.test(text)) return null;
  if (/^https?:\/\//i.test(text)) return canonical(text);
  if (/^(localhost|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?([/?#].*)?$/u.test(
    text
  ))
    return canonical("https://" + text);
  return null;
}

// src/search.ts
var norm = (s) => s.normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "").toLocaleLowerCase();
function score(title, other, query) {
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(query))) return 2;
  if (title.includes(query)) return 3;
  if (other.includes(query)) return 4;
  let p = 0;
  for (const c of title) if (c === query[p]) p++;
  return p === query.length ? 5 : Infinity;
}
var SearchIndex = class {
  entries = /* @__PURE__ */ new Map();
  replace(entries) {
    this.entries.clear();
    this.upsert(entries);
  }
  upsert(entries) {
    for (const entry of entries) {
      const key = entry.kind + ":" + entry.id;
      const previous = this.entries.get(key);
      if (previous && previous.entry.title === entry.title && previous.entry.detail === entry.detail && previous.entry.aliases === entry.aliases)
        previous.entry = entry;
      else
        this.entries.set(key, {
          entry,
          title: norm(entry.title),
          other: norm(entry.detail + " " + (entry.aliases ?? ""))
        });
    }
  }
  remove(kind, id) {
    this.entries.delete(kind + ":" + id);
  }
  query(raw, windowId2, activeId) {
    const prefix = raw[0];
    const kind = prefix === ">" ? "command" : prefix === "@" ? "tab" : prefix === "#" ? "bookmark" : null;
    const q = norm(kind ? raw.slice(1).trim() : raw.trim());
    const all = [...this.entries.values()];
    if (!q && !kind) {
      return [
        ...all.filter((x) => x.entry.kind === "tab" && x.entry.tabId !== activeId).sort((a, b) => (a.entry.recent ?? 1e9) - (b.entry.recent ?? 1e9)).slice(0, 5).map((x) => x.entry),
        ...all.filter(
          (x) => x.entry.kind === "command" && ["new-tab", "toggle-sidebar", "fullscreen"].includes(x.entry.id)
        ).map((x) => x.entry)
      ];
    }
    const results2 = all.filter(
      (x) => !kind || x.entry.kind === kind || kind === "bookmark" && x.entry.kind === "folder"
    ).map((x) => ({
      entry: x.entry,
      score: q ? score(x.title, x.other, q) : 0
    })).filter((x) => Number.isFinite(x.score)).sort(
      (a, b) => a.score - b.score || Number(b.entry.open ?? false) - Number(a.entry.open ?? false) || Number(b.entry.windowId === windowId2) - Number(a.entry.windowId === windowId2) || (a.entry.recent ?? 1e9) - (b.entry.recent ?? 1e9) || a.entry.title.localeCompare(b.entry.title) || a.entry.id.localeCompare(b.entry.id)
    ).slice(0, 80).map((x) => x.entry);
    const seen = /* @__PURE__ */ new Set();
    const unique = results2.filter((e) => {
      if (e.tabId === void 0) return true;
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
        url
      });
    return unique;
  }
};

// src/commands.ts
var commands = [
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

// src/resolver.ts
function resolutionIndex(windowId2, tabs, session2) {
  const current = tabs.filter((t) => t.windowId === windowId2), byId = new Map(current.map((t) => [t.id, t]));
  const recency = new Map(session2.mru.map((id, index2) => [id, index2]));
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

// src/catalog.ts
var SearchCatalog = class {
  index = new SearchIndex();
  urls = /* @__PURE__ */ new Map();
  bookmarkURLs = /* @__PURE__ */ new Map();
  tabs = /* @__PURE__ */ new Map();
  associations = {};
  initialized = false;
  update(s) {
    const all = s.bookmarks?.nodes ?? new Map(flatten(s.tree).map((b) => [b.id, b]));
    const changes = s.changes;
    const full = !this.initialized || !changes;
    const dirty = new Set(
      full || changes?.preferences ? [...all.keys()] : changes.bookmarks
    );
    for (const id of changes?.removedBookmarks ?? []) {
      this.index.remove("bookmark", id);
      this.index.remove("folder", id);
      this.urls.get(this.bookmarkURLs.get(id) ?? "")?.delete(id);
      this.bookmarkURLs.delete(id);
    }
    const affectURL = (url) => {
      if (url)
        for (const id of this.urls.get(canonical(url) ?? "") ?? [])
          dirty.add(id);
    };
    for (const id of changes?.removedTabs ?? []) {
      affectURL(this.tabs.get(id)?.url);
      this.tabs.delete(id);
      this.index.remove("tab", String(id));
    }
    const changedTabs = full || changes?.session ? s.tabs : s.tabs.filter((t) => changes?.tabs.includes(t.id));
    for (const tab of changedTabs) {
      affectURL(this.tabs.get(tab.id)?.url);
      affectURL(tab.url);
      this.tabs.set(tab.id, { ...tab });
      const recent = s.session.mru.indexOf(tab.id);
      this.index.upsert([
        {
          id: String(tab.id),
          kind: "tab",
          title: s.session.tabCustomizations?.[String(tab.id)]?.name || tab.title || "Untitled tab",
          aliases: tab.title,
          detail: (tab.windowId !== s.windowId ? "Other window \xB7 " : "") + (tab.url ?? ""),
          windowId: tab.windowId,
          tabId: tab.id,
          recent: recent < 0 ? 1e9 : recent
        }
      ]);
    }
    const before = this.associations[s.windowId] ?? {}, after = s.session.associations[s.windowId] ?? {};
    for (const id of /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]))
      if (before[id] !== after[id] || changes?.tabs.includes(after[id]) || changes?.removedTabs.includes(before[id]))
        dirty.add(id);
    this.associations = structuredClone(s.session.associations);
    const lookup = resolutionIndex(s.windowId, s.tabs, s.session);
    const entries = [];
    for (const id of dirty) {
      const b = all.get(id);
      if (!b?.parentId) continue;
      const oldURL = this.bookmarkURLs.get(id);
      if (oldURL) this.urls.get(oldURL)?.delete(id);
      const url = b.url ? canonical(b.url) : null;
      if (url) {
        if (!this.urls.has(url)) this.urls.set(url, /* @__PURE__ */ new Set());
        this.urls.get(url).add(id);
        this.bookmarkURLs.set(id, url);
      } else this.bookmarkURLs.delete(id);
      const tab = b.url ? lookup(b) : void 0;
      this.index.remove(b.url ? "folder" : "bookmark", id);
      entries.push({
        id,
        kind: b.url ? "bookmark" : "folder",
        title: s.prefs.customizations?.[id]?.name || b.title || "Untitled",
        aliases: b.title,
        detail: [b.path, b.url].filter(Boolean).join(" \xB7 "),
        url: b.url,
        tabId: tab?.id,
        open: !!tab,
        windowId: tab?.windowId
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
          aliases: command.aliases
        }
      ]);
    }
    this.initialized = true;
  }
};

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
async function sheet(title, fields, s, save, folder = false) {
  const dialog = el("dialog");
  const form = el("form");
  form.append(el("h2", title));
  const values = {};
  for (const f of fields) {
    const label = el("label", f.label);
    const input2 = el("input");
    input2.name = f.name;
    input2.value = f.value ?? "";
    input2.required = true;
    label.append(input2);
    form.append(label);
    values[f.name] = input2;
  }
  if (folder) {
    const label = el("label", "Destination folder");
    const search = el("input");
    search.placeholder = "Find a folder\u2026";
    search.setAttribute("aria-label", "Find destination folder");
    const select2 = el("select");
    select2.size = 6;
    select2.required = true;
    const nodes = flatten(s.tree).filter(
      (b) => !b.url && b.parentId && !b.unmodifiable
    );
    const fill = () => {
      select2.replaceChildren(
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
    select2.value = s.prefs.bookmarkRootId ?? nodes[0]?.id ?? "";
    search.oninput = fill;
    label.append(search, select2);
    form.append(label);
    values.parentId = select2;
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
  for (const [label2, input2] of [
    ["Display name", name],
    ["Icon replacement", emoji]
  ]) {
    const l = el("label", label2);
    l.append(input2);
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

// src/palette.ts
var state;
var selected = 0;
var results = [];
var catalog = new SearchCatalog();
var index = catalog.index;
var input = document.querySelector("#query");
var list = document.querySelector("#results");
async function refresh() {
  state = await snapshot();
  theme(state);
  catalog.update(state);
  render();
}
function render() {
  results = index.query(input.value, state.windowId, state.active?.id);
  selected = Math.min(selected, Math.max(results.length - 1, 0));
  list.replaceChildren();
  if (!results.length) {
    list.append(
      el("p", "No local matches", "empty"),
      el(
        "p",
        "Try a title, folder, command or explicit URL. Search stays on this device.",
        "hint"
      )
    );
    return;
  }
  results.forEach((result, i) => {
    const row = button(
      "",
      () => execute(result, false),
      "result" + (i === selected ? " selected" : "")
    );
    row.id = "result-" + i;
    row.role = "option";
    row.setAttribute("aria-selected", String(i === selected));
    const symbol = el("span", "", "result-icon");
    const appearance = result.kind === "tab" ? state.session.tabCustomizations?.[result.id] : state.prefs.customizations?.[result.id];
    symbol.append(
      result.kind === "command" ? icon("command") : result.kind === "folder" && !appearance?.image && !appearance?.emoji ? icon("folder") : siteIcon(
        result.title,
        result.url ?? state.tabs.find((t) => t.id === result.tabId)?.url,
        appearance?.emoji,
        appearance?.image
      )
    );
    const copy = el("span", "", "result-copy");
    copy.append(
      el("span", result.title, "result-title"),
      el("span", result.detail, "result-detail")
    );
    const action = result.kind === "tab" || result.open ? "Switch tab" : result.kind === "bookmark" ? "Open bookmark" : result.kind === "folder" ? "Reveal folder" : result.kind === "url" ? "Open URL" : "Run command";
    row.append(symbol, copy, el("span", action, "result-action"));
    row.onpointermove = (e) => {
      if (e.movementX || e.movementY) {
        selected = i;
        select();
      }
    };
    const context = () => {
      if (result.kind === "tab") {
        const t = state.tabs.find((t2) => t2.id === result.tabId);
        if (t) tabMenu(row, t, state);
      } else if (result.kind === "bookmark" || result.kind === "folder") {
        const b = flatten(state.tree).find((b2) => b2.id === result.id);
        if (b) bookmarkMenu(row, b, state, result.tabId);
      }
    };
    row.oncontextmenu = (e) => {
      e.preventDefault();
      context();
    };
    row.onkeydown = (e) => {
      if (e.key === "F10" && e.shiftKey) {
        e.preventDefault();
        context();
      }
    };
    list.append(row);
  });
  select();
}
function select() {
  [...list.querySelectorAll(".result")].forEach((e, i) => {
    e.classList.toggle("selected", i === selected);
    e.setAttribute("aria-selected", String(i === selected));
  });
  input.setAttribute("aria-activedescendant", "result-" + selected);
}
async function execute(e, fresh) {
  if (e.kind === "command") {
    await runCommand(e.id, state);
    return;
  }
  if (e.kind === "folder") {
    await request("show-sidebar", { windowId: state.windowId });
    const all = flatten(state.tree);
    const ids2 = [e.id];
    let b = all.find((b2) => b2.id === e.id);
    while (b?.parentId) {
      ids2.push(b.parentId);
      b = all.find((n) => n.id === b?.parentId);
    }
    await preferences({
      ...state.prefs,
      savedCollapsed: false,
      expanded: [.../* @__PURE__ */ new Set([...state.prefs.expanded, ...ids2])]
    });
    window.close();
    return;
  }
  if (e.kind === "tab")
    await request(fresh ? "duplicate" : "switch", {
      tabId: e.tabId,
      windowId: state.windowId
    });
  else if (e.kind === "bookmark")
    await request("activate", {
      bookmarkId: e.id,
      windowId: state.windowId,
      fresh
    });
  else await request("open-url", { url: e.url, windowId: state.windowId });
  window.close();
}
input.oninput = () => {
  selected = 0;
  render();
};
input.onkeydown = (e) => {
  if (e.isComposing) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + Math.max(1, results.length)) % Math.max(1, results.length);
    select();
    document.querySelector("#result-" + selected)?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && results[selected]) {
    e.preventDefault();
    void safely(() => execute(results[selected], e.metaKey || e.ctrlKey));
  }
};
document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  if (e.key === "Escape" || (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    window.close();
  }
});
document.querySelector(".palette-search")?.prepend(icon("search"));
watch(() => void safely(refresh));
void safely(refresh);
input.focus();
