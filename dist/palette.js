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

// src/browser.ts
async function snapshot() {
  const [local, session, tree, tabs, win, shortcuts] = await Promise.all([
    chrome.storage.local.get("preferences"),
    chrome.storage.session.get("session"),
    chrome.bookmarks.getTree(),
    chrome.tabs.query({ windowType: "normal" }),
    chrome.windows.getCurrent(),
    chrome.commands.getAll()
  ]);
  const prefs = migrate(local.preferences);
  if (!prefs.bookmarkRootId)
    prefs.bookmarkRootId = flatten(tree).find((n) => n.folderType === "bookmarks-bar")?.id ?? null;
  return {
    prefs,
    session: readSession(session.session),
    tree,
    tabs,
    windowId: win.id,
    active: tabs.find((t) => t.windowId === win.id && t.active),
    shortcuts
  };
}
async function preferences(prefs) {
  await chrome.storage.local.set({ preferences: migrate(prefs) });
}
function watch(refresh2) {
  let timer;
  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh2, 45);
  };
  const events = [
    chrome.tabs.onCreated,
    chrome.tabs.onUpdated,
    chrome.tabs.onRemoved,
    chrome.tabs.onMoved,
    chrome.tabs.onActivated,
    chrome.tabs.onAttached,
    chrome.tabs.onDetached,
    chrome.tabs.onReplaced,
    chrome.bookmarks.onCreated,
    chrome.bookmarks.onChanged,
    chrome.bookmarks.onMoved,
    chrome.bookmarks.onRemoved,
    chrome.bookmarks.onChildrenReordered,
    chrome.storage.onChanged
  ];
  for (const event of events) event.addListener(update);
  return () => {
    clearTimeout(timer);
    for (const event of events) event.removeListener(update);
  };
}
async function request(action, args = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...args });
  if (!response?.ok)
    throw new Error(
      response?.error ?? "Ox could not complete this action. Please try again."
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

// src/resolver.ts
function exactMatch(url, tabs, mru) {
  const key = canonical(url);
  if (!key) return;
  return tabs.filter((t) => canonical(t.url ?? "") === key).sort(
    (a, b) => Number(b.active) - Number(a.active) || (mru.indexOf(a.id) < 0 ? 1e9 : mru.indexOf(a.id)) - (mru.indexOf(b.id) < 0 ? 1e9 : mru.indexOf(b.id)) || a.index - b.index
  )[0];
}
function resolve(bookmark, windowId, tabs, session) {
  const current = tabs.filter((t) => t.windowId === windowId);
  return current.find(
    (t) => t.id === session.associations[String(windowId)]?.[bookmark.id]
  ) ?? exactMatch(bookmark.url ?? "", current, session.mru);
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
    for (const entry of entries)
      this.entries.set(entry.kind + ":" + entry.id, {
        entry,
        title: norm(entry.title),
        other: norm(entry.detail + " " + (entry.aliases ?? ""))
      });
  }
  remove(kind, id) {
    this.entries.delete(kind + ":" + id);
  }
  query(raw, windowId, activeId) {
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
      (a, b) => a.score - b.score || Number(b.entry.open ?? false) - Number(a.entry.open ?? false) || Number(b.entry.windowId === windowId) - Number(a.entry.windowId === windowId) || (a.entry.recent ?? 1e9) - (b.entry.recent ?? 1e9) || a.entry.title.localeCompare(b.entry.title) || a.entry.id.localeCompare(b.entry.id)
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

// src/palette.ts
var state;
var selected = 0;
var results = [];
var index = new SearchIndex();
var input = document.querySelector("#query");
var list = document.querySelector("#results");
async function refresh() {
  state = await snapshot();
  theme(state);
  const entries = state.tabs.map((t) => ({
    id: String(t.id),
    kind: "tab",
    title: t.title ?? "Untitled tab",
    detail: (t.windowId !== state.windowId ? "Other window \xB7 " : "") + (t.url ?? ""),
    windowId: t.windowId,
    tabId: t.id,
    recent: state.session.mru.indexOf(t.id) < 0 ? 1e9 : state.session.mru.indexOf(t.id)
  }));
  for (const b of flatten(state.tree)) {
    if (!b.parentId) continue;
    const t = b.url ? resolve(b, state.windowId, state.tabs, state.session) : void 0;
    entries.push({
      id: b.id,
      kind: b.url ? "bookmark" : "folder",
      title: b.title || "Untitled",
      detail: [b.path, b.url].filter(Boolean).join(" \xB7 "),
      url: b.url,
      tabId: t?.id,
      open: !!t,
      windowId: t?.windowId
    });
  }
  for (const c of commands)
    if (!c.needsTab || state.active)
      entries.push({
        id: c.id,
        kind: "command",
        title: c.label,
        detail: "Browser action",
        aliases: c.aliases
      });
  index.replace(entries);
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
    const icon = el(
      "span",
      result.kind === "command" ? "\u2318" : result.kind === "folder" ? "\u25B9" : monogram(result.title),
      "result-icon"
    );
    const copy = el("span", "", "result-copy");
    copy.append(
      el("span", result.title, "result-title"),
      el("span", result.detail, "result-detail")
    );
    const action = result.kind === "tab" || result.open ? "Switch tab" : result.kind === "bookmark" ? "Open bookmark" : result.kind === "folder" ? "Reveal folder" : result.kind === "url" ? "Open URL" : "Run command";
    row.append(icon, copy, el("span", action, "result-action"));
    row.onpointermove = (e) => {
      if (e.movementX || e.movementY) {
        selected = i;
        select();
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
watch(() => void safely(refresh));
void safely(refresh);
input.focus();
