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
function owners(bookmarks, favourites, windowId, tabs, session) {
  const ordered = [
    ...favourites.map((id) => bookmarks.find((b) => b.id === id)).filter((b) => !!b),
    ...bookmarks.filter((b) => !favourites.includes(b.id))
  ];
  const result = /* @__PURE__ */ new Map();
  for (const b of ordered) {
    if (!b.url) continue;
    const t = resolve(b, windowId, tabs, session);
    if (t?.id !== void 0 && !result.has(t.id)) result.set(t.id, b.id);
  }
  return result;
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
  rows.push(
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

// src/sidebar.ts
var state;
var port;
var rendering = false;
var again = false;
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
    e.classList.remove("drop");
    const source = drag;
    drag = void 0;
    if (!source) return;
    void safely(async () => {
      if (favourite) {
        if (source.kind === "favourite" && b) {
          const list = state.prefs.favourites.filter((id) => id !== source.id);
          list.splice(Math.max(0, list.indexOf(b.id)), 0, source.id);
          await preferences({ ...state.prefs, favourites: list });
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
      const inside = e.dataset.drop === "inside";
      await request("move", {
        bookmarkId: source.id,
        parentId: inside ? b.id : b.parentId,
        index: inside ? void 0 : (b.index ?? 0) + (e.dataset.drop === "after" ? 1 : 0)
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
  root.append(header);
  const scroll = el("main", "", "scroll");
  const fav = el("div", "", "favourites");
  fav.ariaLabel = "Favourites";
  dropTarget(fav, void 0, void 0, true);
  for (const id of state.prefs.favourites) {
    const b = all.find((n) => n.id === id);
    if (!b) continue;
    const t = resolve(b, state.windowId, state.tabs, state.session);
    const tile = button(
      state.prefs.icons[id] || monogram(b.title),
      () => request("activate", { bookmarkId: id, windowId: state.windowId }),
      "tile" + (t?.active ? " active" : "")
    );
    tile.title = tile.ariaLabel = b.title + " \u2014 " + b.url + (t?.url && t.url !== b.url ? " \xB7 Current: " + t.url : "");
    tile.dataset.key = "fav-" + id;
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
  scroll.append(saved);
  const row = (b, depth, context = false) => {
    if (b.url && state.prefs.favourites.includes(b.id)) return;
    const t = b.url ? resolve(b, state.windowId, state.tabs, state.session) : void 0;
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
    target.dataset.key = "bm-" + b.id;
    target.title = b.title + (b.url ? " \u2014 " + b.url : "") + (t?.url && t.url !== b.url ? " \xB7 Current: " + t.url : "");
    if (!b.url) target.setAttribute("aria-expanded", String(expanded));
    target.onkeydown = (e) => {
      if (e.key === "ArrowRight" && !b.url) {
        e.preventDefault();
        if (!expanded) target.click();
        else
          document.querySelector(
            `[data-key="bm-${CSS.escape(b.children?.[0]?.id ?? "")}"]`
          )?.focus();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (expanded && !b.url) target.click();
        else
          document.querySelector(
            `[data-key="bm-${CSS.escape(b.parentId ?? "")}"]`
          )?.focus();
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
    overflow.ariaLabel = "Actions for " + b.title;
    wrapper.append(overflow);
    dragSource(wrapper, "bookmark", b.id);
    dropTarget(wrapper, b);
    scroll.append(wrapper);
    if (!b.url && !context) {
      if (expanded) for (const child of b.children ?? []) row(child, depth + 1);
      else {
        const active = flatten(b.children ?? []).find(
          (c) => c.url && resolve(c, state.windowId, state.tabs, state.session)?.active
        );
        if (active) row(active, depth + 1, true);
      }
    }
  };
  if (!chosen) {
    const setup = el("div", "", "setup");
    setup.append(
      el(
        "p",
        "Choose a bookmark folder to show saved links. Your bookmarks stay where they are."
      ),
      button("Choose folder", () => chrome.runtime.openOptionsPage())
    );
    scroll.append(setup);
  } else if (!state.prefs.savedCollapsed) {
    if (!chosen.children?.length)
      scroll.append(el("p", "No saved links in this folder.", "empty"));
    for (const b of chosen.children ?? []) row(b, 0);
  }
  scroll.append(el("hr"));
  const newTab = button(
    "\uFF0B  New tab",
    () => chrome.action.openPopup(),
    "row-main new-tab"
  );
  newTab.append(el("kbd", short(state, "_execute_action")));
  scroll.append(newTab);
  const open = el("h2", "Open tabs", "section-title");
  open.id = "open-tabs";
  open.tabIndex = -1;
  scroll.append(open);
  const tabs = state.tabs.filter((t) => t.windowId === state.windowId && !owner.has(t.id)).sort((a, b) => a.index - b.index);
  for (const t of tabs) {
    const r = el("div", "", "row" + (t.active ? " active" : ""));
    const main = button(
      (t.pinned ? "\u2316 " : monogram(t.title ?? "") + "  ") + (t.title || t.url || "New tab"),
      () => request("switch", { tabId: t.id }),
      "row-main"
    );
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
        await refresh();
        const next = tabs[i + 1] ?? tabs[i - 1];
        document.querySelector(`[data-key="tab-${next?.id}"]`)?.focus();
      },
      "row-control"
    );
    close.ariaLabel = "Close " + t.title;
    const more2 = button("\u22EF", () => tabMenu(main, t, state), "row-control");
    more2.ariaLabel = "Actions for " + t.title;
    r.append(main, more2, close);
    dragSource(r, "tab", String(t.id));
    dropTarget(r, void 0, t);
    scroll.append(r);
  }
  root.append(scroll);
  const footer = el("footer");
  footer.append(
    button("\u2699  Settings", () => runCommand("settings", state)),
    button("\u26F6", () => runCommand("fullscreen", state), "icon")
  );
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
