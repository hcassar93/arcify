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
async function request(action, args = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...args });
  if (!response?.ok)
    throw new Error(
      response?.error ?? "Ox could not complete this action. Please try again."
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
    el("h1", "Ox"),
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
    el("h2", "Privacy"),
    el(
      "p",
      "No accounts, telemetry, remote assets or extension-owned sync. Tab titles and URLs stay local. The tabs permission exposes metadata and may be described by Chrome as reading browsing history. The bookmarks permission includes both reading and writing; Chrome offers no read-only variant."
    ),
    el(
      "p",
      "Chrome may sync native bookmarks according to your browser settings. Uninstall removes Ox preferences, but does not undo confirmed bookmark changes."
    ),
    el("p", "Source: github.com/hcassar93/ox-chrome \xB7 MIT licence"),
    button("Reset extension preferences\u2026", async () => {
      if (confirm("Reset Ox preferences? Native bookmarks will be preserved.")) {
        await preferences({ ...defaults });
        await refresh();
      }
    })
  );
}
void safely(refresh);
