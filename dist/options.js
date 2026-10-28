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

// src/options.ts
var state;
var app = document.querySelector("#app");
async function refresh() {
  state = await snapshot();
  theme(state);
  app.replaceChildren(
    el("h1", "arcify"),
    el("p", "A quieter place for your tabs.", "muted")
  );
  const label = el("label", "Bookmark folder");
  const select = el("select");
  for (const b of flatten(state.tree).filter((n) => !n.url && n.parentId)) {
    const option = el(
      "option",
      (b.path ? b.path + " / " : "") + b.title + (b.unmodifiable ? " (read-only)" : "")
    );
    option.value = b.id;
    select.append(option);
  }
  select.value = state.prefs.bookmarkRootId ?? "";
  select.onchange = () => void safely(async () => {
    await preferences({ ...state.prefs, bookmarkRootId: select.value });
    await refresh();
  });
  label.append(select);
  app.append(label);
  const themes = el("label", "Theme");
  const choice = el("select");
  for (const value of ["system", "light", "dark"]) {
    const o = el("option", value[0].toUpperCase() + value.slice(1));
    o.value = value;
    choice.append(o);
  }
  choice.value = state.prefs.theme;
  choice.onchange = () => void safely(async () => {
    await preferences({
      ...state.prefs,
      theme: choice.value
    });
    await refresh();
  });
  themes.append(choice);
  app.append(themes);
  app.append(el("h2", "Favourites"));
  const all = flatten(state.tree);
  for (const id of state.prefs.favourites) {
    const b = all.find((n) => n.id === id);
    if (!b) continue;
    const row = el("div", "", "option-row");
    const icon = el("input");
    icon.value = state.prefs.icons[id] ?? "";
    icon.maxLength = 16;
    icon.placeholder = "Emoji";
    icon.ariaLabel = "Icon for " + b.title;
    icon.onchange = () => void safely(async () => {
      await preferences({
        ...state.prefs,
        icons: { ...state.prefs.icons, [id]: icon.value }
      });
      await refresh();
    });
    row.append(
      el("span", b.title),
      icon,
      button("Move up", async () => {
        const ids2 = [...state.prefs.favourites], i = ids2.indexOf(id);
        if (i > 0) [ids2[i - 1], ids2[i]] = [ids2[i], ids2[i - 1]];
        await preferences({ ...state.prefs, favourites: ids2 });
        await refresh();
      })
    );
    app.append(row);
  }
  app.append(
    el("h2", "Keyboard"),
    el("p", "Palette: " + short(state, "_execute_action")),
    el("p", "Sidebar: " + short(state, "toggle-sidebar")),
    button("Configure shortcuts", () => runCommand("shortcuts", state)),
    button("Open sidebar", () => runCommand("show-sidebar", state))
  );
  app.append(
    el("h2", "Help"),
    el(
      "p",
      "Choose left or right placement in Chrome Settings \u2192 Appearance \u2192 Side panel. Chrome owns the panel frame and popup placement."
    ),
    el(
      "p",
      "Search locally with > for actions, @ for tabs, and # for bookmarks. Enter activates; Command+Enter (Control+Enter on Windows/Linux) opens a fresh tab. Escape closes a picker first, then the palette."
    ),
    el(
      "p",
      "Right-click rows for actions. Favourites are local references to native bookmarks. Removing a favourite preserves the bookmark. Deleting a bookmark is a separate confirmed action."
    ),
    el("h2", "Appearance and icons"),
    el(
      "p",
      "System follows the browser\u2019s light/dark appearance signal live. Explicit Light or Dark overrides it. Chrome custom-theme colours are not available through the allowed APIs."
    ),
    el(
      "p",
      "Selected website icons are packaged locally. Other sites use local monograms or your chosen emoji. The approved favicon permission reads Chrome\u2019s extension-local favicon endpoint. On load failure, packaged website icons or local monograms are used. Chrome may return its own generic icon for a cache miss. No external favicon service is called."
    ),
    el(
      "p",
      "The Arc logo and website marks belong to their respective owners and are excluded from the source MIT licence. arcify is an independent project, without affiliation or endorsement."
    ),
    el("h2", "Privacy"),
    el(
      "p",
      "No accounts, telemetry, remote assets or extension-owned sync. Tab titles and URLs stay local. The tabs permission exposes metadata and may be described by Chrome as reading browsing history. The bookmarks permission includes both reading and writing; Chrome offers no read-only variant."
    ),
    el(
      "p",
      "Chrome may sync native bookmarks according to your browser settings. Uninstall removes arcify preferences, but does not undo confirmed bookmark changes."
    ),
    el("p", "Source: github.com/hcassar93/arcify \xB7 MIT licence"),
    button("Reset extension preferences\u2026", async () => {
      if (confirm("Reset arcify preferences? Native bookmarks will be preserved.")) {
        await preferences({ ...defaults });
        await refresh();
      }
    })
  );
}
void safely(refresh);
