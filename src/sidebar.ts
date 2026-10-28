import {
  snapshot,
  watch,
  preferences,
  request,
  type Snapshot,
} from "./browser";
import { flatten, type Bookmark } from "./model";
import { owners, resolve } from "./resolver";
import {
  el,
  button,
  safely,
  theme,
  short,
  monogram,
  bookmarkMenu,
  tabMenu,
  runCommand,
  sheet,
  saveTab,
  menu,
} from "./ui";
let state: Snapshot;
let port: chrome.runtime.Port;
let rendering = false;
let again = false;
const root = document.querySelector<HTMLElement>("#app")!;
let drag: { kind: "bookmark" | "tab" | "favourite"; id: string } | undefined;
function dragSource(
  e: HTMLElement,
  kind: "bookmark" | "tab" | "favourite",
  id: string,
) {
  e.draggable = true;
  e.ondragstart = (event) => {
    drag = { kind, id };
    event.dataTransfer?.setData("text/plain", JSON.stringify(drag));
  };
  e.ondragend = () => {
    drag = undefined;
    document
      .querySelectorAll(".drop")
      .forEach((x) => x.classList.remove("drop"));
  };
}
function dropTarget(
  e: HTMLElement,
  b?: Bookmark,
  tab?: chrome.tabs.Tab,
  favourite = false,
) {
  e.ondragover = (event) => {
    if (!drag) return;
    event.preventDefault();
    e.classList.add("drop");
    const fraction =
      (event.clientY - e.getBoundingClientRect().top) / e.clientHeight;
    e.dataset.drop =
      b && !b.url && fraction > 0.25 && fraction < 0.75
        ? "inside"
        : fraction < 0.5
          ? "before"
          : "after";
  };
  e.ondragleave = () => e.classList.remove("drop");
  e.ondrop = (event) => {
    event.preventDefault();
    e.classList.remove("drop");
    const source = drag;
    drag = undefined;
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
            true,
          );
        else await request("favourite", { bookmarkId: source.id });
        return;
      }
      if (tab && source.kind === "tab") {
        await request("move-tab", {
          tabId: Number(source.id),
          index: tab.index,
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
              value: state.tabs.find((t) => t.id === Number(source.id))?.title,
            },
            {
              name: "url",
              label: "URL",
              value: state.tabs.find((t) => t.id === Number(source.id))?.url,
            },
          ],
          state,
          (v) => request("save", { ...v, parentId: b.url ? b.parentId : b.id }),
        );
        return;
      }
      const inside = e.dataset.drop === "inside";
      await request("move", {
        bookmarkId: source.id,
        parentId: inside ? b.id : b.parentId,
        index: inside
          ? undefined
          : (b.index ?? 0) + (e.dataset.drop === "after" ? 1 : 0),
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
  const focused = (document.activeElement as HTMLElement)?.dataset.key;
  const oldScroll = document.querySelector(".scroll")?.scrollTop ?? 0;
  const all = flatten(state.tree),
    chosen = all.find((n) => n.id === state.prefs.bookmarkRootId);
  const visible = chosen ? flatten(chosen.children ?? []) : [];
  const owner = owners(
    [
      ...state.prefs.favourites
        .map((id) => all.find((b) => b.id === id))
        .filter((b): b is NonNullable<typeof b> => !!b),
      ...visible,
    ],
    state.prefs.favourites,
    state.windowId,
    state.tabs,
    state.session,
  );
  root.replaceChildren();
  const header = el("header");
  header.append(
    button(
      "⌕  Search or jump",
      () => chrome.action.openPopup(),
      "search-trigger",
    ),
    button(
      "‹",
      () => request("hide-sidebar", { windowId: state.windowId }),
      "icon",
    ),
  );
  const more = button(
    "•••",
    () =>
      menu(more, [
        { label: "New blank tab", run: () => runCommand("new-tab", state) },
        {
          label: "Create folder",
          run: () =>
            sheet(
              "Create folder",
              [{ name: "title", label: "Folder name" }],
              state,
              (v) => request("save", v),
              true,
            ),
        },
        {
          label: "Collapse saved",
          run: () => runCommand("collapse-saved", state),
        },
        { label: "Jump to open tabs", run: () => jump() },
      ]),
    "icon",
  );
  more.ariaLabel = "More actions";
  header.append(more);
  root.append(header);
  const scroll = el("main", "", "scroll");
  const fav = el("div", "", "favourites");
  fav.ariaLabel = "Favourites";
  dropTarget(fav, undefined, undefined, true);
  for (const id of state.prefs.favourites) {
    const b = all.find((n) => n.id === id);
    if (!b) continue;
    const t = resolve(b, state.windowId, state.tabs, state.session);
    const tile = button(
      state.prefs.icons[id] || monogram(b.title),
      () => request("activate", { bookmarkId: id, windowId: state.windowId }),
      "tile" + (t?.active ? " active" : ""),
    );
    tile.title = tile.ariaLabel =
      b.title +
      " — " +
      b.url +
      (t?.url && t.url !== b.url ? " · Current: " + t.url : "");
    tile.dataset.key = "fav-" + id;
    tile.oncontextmenu = (e) => {
      e.preventDefault();
      bookmarkMenu(
        tile,
        b,
        state,
        state.session.associations[state.windowId]?.[id],
      );
    };
    dragSource(tile, "favourite", id);
    dropTarget(tile, b, undefined, true);
    fav.append(tile);
  }
  if (state.prefs.favourites.length) scroll.append(fav);
  const saved = button(
    (state.prefs.savedCollapsed ? "›" : "⌄") + "  Saved",
    () =>
      preferences({
        ...state.prefs,
        savedCollapsed: !state.prefs.savedCollapsed,
      }),
    "section-title",
  );
  saved.setAttribute("aria-expanded", String(!state.prefs.savedCollapsed));
  scroll.append(saved);
  const row = (b: Bookmark, depth: number, context = false) => {
    if (b.url && state.prefs.favourites.includes(b.id)) return;
    const t = b.url
      ? resolve(b, state.windowId, state.tabs, state.session)
      : undefined;
    const wrapper = el(
      "div",
      "",
      "row" + (t?.active ? " active" : "") + (context ? " contextual" : ""),
    );
    wrapper.dataset.depth = String(Math.min(depth, 8));
    const expanded = state.prefs.expanded.includes(b.id);
    const target = button(
      (b.url ? monogram(b.title) : expanded ? "⌄" : "›") +
        "  " +
        (b.title || "Untitled"),
      () =>
        b.url
          ? request("activate", { bookmarkId: b.id, windowId: state.windowId })
          : preferences({
              ...state.prefs,
              expanded: expanded
                ? state.prefs.expanded.filter((id) => id !== b.id)
                : [...state.prefs.expanded, b.id],
            }),
      "row-main",
    );
    target.dataset.key = "bm-" + b.id;
    target.title =
      b.title +
      (b.url ? " — " + b.url : "") +
      (t?.url && t.url !== b.url ? " · Current: " + t.url : "");
    if (!b.url) target.setAttribute("aria-expanded", String(expanded));
    target.onkeydown = (e) => {
      if (e.key === "ArrowRight" && !b.url) {
        e.preventDefault();
        if (!expanded) target.click();
        else
          (
            document.querySelector(
              `[data-key="bm-${CSS.escape(b.children?.[0]?.id ?? "")}"]`,
            ) as HTMLElement
          )?.focus();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (expanded && !b.url) target.click();
        else
          (
            document.querySelector(
              `[data-key="bm-${CSS.escape(b.parentId ?? "")}"]`,
            ) as HTMLElement
          )?.focus();
      }
    };
    target.oncontextmenu = (e) => {
      e.preventDefault();
      bookmarkMenu(
        target,
        b,
        state,
        state.session.associations[state.windowId]?.[b.id],
      );
    };
    wrapper.append(target);
    if (t) {
      wrapper.append(el("span", "•", "open-dot"));
      const close = button(
        "×",
        () => request("close-tab", { tabId: t.id }),
        "row-control",
      );
      close.ariaLabel = "Close live tab for " + b.title;
      wrapper.append(close);
    }
    const overflow = button(
      "⋯",
      () =>
        bookmarkMenu(
          target,
          b,
          state,
          state.session.associations[state.windowId]?.[b.id],
        ),
      "row-control",
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
          (c) =>
            c.url &&
            resolve(c, state.windowId, state.tabs, state.session)?.active,
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
        "Choose a bookmark folder to show saved links. Your bookmarks stay where they are.",
      ),
      button("Choose folder", () => chrome.runtime.openOptionsPage()),
    );
    scroll.append(setup);
  } else if (!state.prefs.savedCollapsed) {
    if (!chosen.children?.length)
      scroll.append(el("p", "No saved links in this folder.", "empty"));
    for (const b of chosen.children ?? []) row(b, 0);
  }
  scroll.append(el("hr"));
  const newTab = button(
    "＋  New tab",
    () => chrome.action.openPopup(),
    "row-main new-tab",
  );
  newTab.append(el("kbd", short(state, "_execute_action")));
  scroll.append(newTab);
  const open = el("h2", "Open tabs", "section-title");
  open.id = "open-tabs";
  open.tabIndex = -1;
  scroll.append(open);
  const tabs = state.tabs
    .filter((t) => t.windowId === state.windowId && !owner.has(t.id!))
    .sort((a, b) => a.index - b.index);
  for (const t of tabs) {
    const r = el("div", "", "row" + (t.active ? " active" : ""));
    const main = button(
      (t.pinned ? "⌖ " : monogram(t.title ?? "") + "  ") +
        (t.title || t.url || "New tab"),
      () => request("switch", { tabId: t.id }),
      "row-main",
    );
    main.title = t.url ?? "";
    main.dataset.key = "tab-" + t.id;
    main.oncontextmenu = (e) => {
      e.preventDefault();
      tabMenu(main, t, state);
    };
    const close = button(
      "×",
      async () => {
        const i = tabs.indexOf(t);
        await request("close-tab", { tabId: t.id });
        await refresh();
        const next = tabs[i + 1] ?? tabs[i - 1];
        (
          document.querySelector(`[data-key="tab-${next?.id}"]`) as HTMLElement
        )?.focus();
      },
      "row-control",
    );
    close.ariaLabel = "Close " + t.title;
    const more = button("⋯", () => tabMenu(main, t, state), "row-control");
    more.ariaLabel = "Actions for " + t.title;
    r.append(main, more, close);
    dragSource(r, "tab", String(t.id));
    dropTarget(r, undefined, t);
    scroll.append(r);
  }
  root.append(scroll);
  const footer = el("footer");
  footer.append(
    button("⚙  Settings", () => runCommand("settings", state)),
    button("⛶", () => runCommand("fullscreen", state), "icon"),
  );
  root.append(footer);
  scroll.scrollTop = oldScroll;
  if (focused)
    (
      document.querySelector(
        `[data-key="${CSS.escape(focused)}"]`,
      ) as HTMLElement
    )?.focus();
}
function jump() {
  const target = document.querySelector<HTMLElement>("#open-tabs");
  target?.scrollIntoView({ block: "start" });
  target?.focus();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.jumpOpen?.newValue === state?.windowId)
    jump();
});
watch(() => void safely(refresh));
void safely(refresh);
