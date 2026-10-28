import { DownloadStore } from "./downloads";
import { downloadsView } from "./downloads-ui";
import { icon, siteIcon } from "./icons";
import { treeRows, pageRange, type TreeRow } from "./tree-view";
import {
  snapshot,
  watch,
  preferences,
  request,
  type Snapshot,
} from "./browser";
import { flatten, type Bookmark } from "./model";
import { owners, resolutionIndex } from "./resolver";
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
let sectionMode: "tabs" | "downloads" = "tabs";
const downloads = new DownloadStore(chrome.downloads);
downloads.watch(() => {
  if (state && sectionMode === "downloads") render();
});
let port: chrome.runtime.Port;
let rendering = false;
let again = false;
let savedPage = 0,
  tabPage = 0;
let disclosed: TreeRow[] = [];
function focusBookmark(id: string) {
  const index = disclosed.findIndex((r) => r.node.id === id);
  if (index >= 0) {
    savedPage = Math.floor(index / 80);
    render();
    document
      .querySelector<HTMLElement>(`[data-key="bm-${CSS.escape(id)}"]`)
      ?.focus();
  }
}
function pager(
  length: number,
  page: number,
  onPage: (next: number) => void,
  key: string,
): HTMLElement {
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
    el("span", `${range.start + 1}–${range.end} of ${length}`),
    next,
  );
  return nav;
}
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
    event.stopPropagation();
    e.classList.remove("drop");
    const source = drag;
    drag = undefined;
    if (!source) return;
    void safely(async () => {
      if (favourite) {
        if (source.kind === "favourite" && b) {
          await request("reorder-favourite", {
            bookmarkId: source.id,
            targetId: b.id,
            placement: e.dataset.drop === "after" ? "after" : "before",
          });
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
      await request("move", {
        bookmarkId: source.id,
        targetId: b.id,
        placement: e.dataset.drop,
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
  const lookup = resolutionIndex(state.windowId, state.tabs, state.session);
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
  const tabsNav = el("nav", "", "surface-tabs");
  tabsNav.ariaLabel = "Sidebar views";
  for (const mode of ["tabs", "downloads"] as const) {
    const control = button(mode === "tabs" ? "Tabs" : "Downloads", () => {
      sectionMode = mode;
      render();
    });
    control.setAttribute("aria-pressed", String(sectionMode === mode));
    tabsNav.append(control);
  }
  root.append(tabsNav);
  if (sectionMode === "downloads") {
    const scroll = el("div", "", "scroll");
    scroll.append(downloadsView(downloads, state.windowId));
    root.append(scroll);
    if (focused)
      root
        .querySelector<HTMLElement>('[data-key="' + CSS.escape(focused) + '"]')
        ?.focus();
    scroll.scrollTop = oldScroll;
    return;
  }

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
  const search = header.querySelector("button")!;
  search.replaceChildren(
    icon("search"),
    el("span", "Search or jump"),
    el("kbd", short(state, "_execute_action")),
  );
  header.children[1].replaceChildren(icon("panel"));
  more.replaceChildren(icon("more"));
  header
    .querySelectorAll("button")
    .forEach((b, i) => (b.dataset.key = "header-" + i));
  header.children[1].setAttribute("aria-label", "Close arcify sidebar");
  root.append(header);
  const scroll = el("main", "", "scroll");
  const fav = el("div", "", "favourites");
  fav.ariaLabel = "Favourites";
  dropTarget(fav, undefined, undefined, true);
  for (const id of state.prefs.favourites) {
    const b = all.find((n) => n.id === id);
    if (!b) continue;
    const t = lookup(b);
    const tile = button(
      state.prefs.icons[id] || monogram(b.title),
      () => request("activate", { bookmarkId: id, windowId: state.windowId }),
      "tile" + (t?.active ? " active" : ""),
    );
    tile.replaceChildren(
      siteIcon(
        state.prefs.customizations?.[id]?.name ?? b.title,
        b.url,
        state.prefs.customizations?.[id]?.emoji ?? state.prefs.icons[id],
        state.prefs.customizations?.[id]?.image,
      ),
    );
    if (t) tile.classList.add("is-open");
    tile.title = tile.ariaLabel =
      (state.prefs.customizations?.[b.id]?.name || b.title) +
      " — " +
      b.url +
      (t?.url && t.url !== b.url ? " · Current: " + t.url : "");
    tile.dataset.key = "fav-" + id;
    tile.onkeydown = (e) => {
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        bookmarkMenu(
          tile,
          b,
          state,
          state.session.associations[state.windowId]?.[id],
        );
      }
    };
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
  saved.dataset.key = "saved-collapse";
  saved.replaceChildren(
    icon(state.prefs.savedCollapsed ? "chevron" : "down"),
    el("span", "Saved"),
  );
  scroll.append(saved);
  if (state.needsSetup || !chosen) {
    const setup = el("section", "", "setup");
    setup.append(
      el(
        "p",
        chosen
          ? "Choose your saved-links folder"
          : "That saved folder is no longer available. Choose another folder.",
      ),
    );
    const picker = el("select");
    picker.ariaLabel = "Bookmark root folder";
    for (const folder of all.filter((n) => !n.url && n.parentId)) {
      const option = el(
        "option",
        [folder.path, folder.title].filter(Boolean).join(" / ") +
          (folder.unmodifiable ? " (read-only)" : ""),
      );
      option.value = folder.id;
      picker.append(option);
    }
    picker.value = state.prefs.bookmarkRootId ?? "";
    if (!picker.value && picker.options.length) picker.selectedIndex = 0;
    setup.append(
      picker,
      button("Use folder", () =>
        preferences({ ...state.prefs, bookmarkRootId: picker.value }),
      ),
      button("Use default", () =>
        preferences({
          ...state.prefs,
          bookmarkRootId:
            all.find((n) => n.folderType === "bookmarks-bar")?.id ??
            picker.value,
        }),
      ),
    );
    scroll.append(setup);
  }

  const row = (b: Bookmark, depth: number, context = false) => {
    if (b.url && state.prefs.favourites.includes(b.id)) return;
    const t = b.url ? lookup(b) : undefined;
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
    target.replaceChildren(
      ...(b.url
        ? [
            siteIcon(
              b.title,
              b.url,
              state.prefs.customizations?.[b.id]?.emoji,
              state.prefs.customizations?.[b.id]?.image,
            ),
          ]
        : [
            icon(expanded ? "down" : "chevron"),
            state.prefs.customizations?.[b.id]?.emoji ||
            state.prefs.customizations?.[b.id]?.image
              ? siteIcon(
                  b.title,
                  undefined,
                  state.prefs.customizations?.[b.id]?.emoji,
                  state.prefs.customizations?.[b.id]?.image,
                )
              : icon("folder"),
          ]),
      el(
        "span",
        state.prefs.customizations?.[b.id]?.name || b.title || "Untitled",
        "row-label",
      ),
    );
    target.dataset.key = "bm-" + b.id;
    target.title =
      (state.prefs.customizations?.[b.id]?.name || b.title) +
      (b.url ? " — " + b.url : "") +
      (t?.url && t.url !== b.url ? " · Current: " + t.url : "");
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
          const child =
            disclosed[disclosed.findIndex((r) => r.node.id === b.id) + 1];
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
      close.replaceChildren(icon("close"));
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
    overflow.replaceChildren(icon("more"));
    overflow.ariaLabel = "Actions for " + b.title;
    overflow.dataset.key = "actions-" + b.id;
    wrapper.append(overflow);
    dragSource(wrapper, "bookmark", b.id);
    dropTarget(wrapper, b);
    scroll.append(wrapper);
  };
  if (!chosen) {
    // The inline root picker above is the recovery state.
  } else if (!state.prefs.savedCollapsed) {
    if (!chosen.children?.length)
      scroll.append(el("p", "No saved links in this folder.", "empty"));
    const activeIds = new Set<string>();
    for (const [tabId, id] of owner)
      if (state.tabs.find((t) => t.id === tabId)?.active) activeIds.add(id);
    disclosed = treeRows(
      chosen.children ?? [],
      new Set(state.prefs.expanded),
      new Set(state.prefs.favourites),
      activeIds,
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
            document.querySelector<HTMLElement>(".scroll .row-main")?.focus();
          },
          "Saved",
        ),
      );
  }
  scroll.append(el("hr"));
  const newTab = button(
    "＋  New tab",
    () => chrome.action.openPopup(),
    "row-main new-tab",
  );
  newTab.replaceChildren(
    icon("plus"),
    el("span", "New tab"),
    el("kbd", short(state, "_execute_action")),
  );
  scroll.append(newTab);
  const open = el("h2", "Open tabs", "section-title");
  open.id = "open-tabs";
  open.tabIndex = -1;
  scroll.append(open);
  const tabs = state.tabs
    .filter((t) => t.windowId === state.windowId && !owner.has(t.id!))
    .sort((a, b) => a.index - b.index);
  const tabRange = pageRange(tabs.length, tabPage);
  tabPage = tabRange.page;
  for (const t of tabs.slice(tabRange.start, tabRange.end)) {
    const r = el("div", "", "row" + (t.active ? " active" : ""));
    const main = button(
      (t.pinned ? "⌖ " : monogram(t.title ?? "") + "  ") +
        (t.title || t.url || "New tab"),
      () => request("switch", { tabId: t.id }),
      "row-main",
    );
    main.replaceChildren(
      siteIcon(
        t.title ?? "Tab",
        t.url,
        state.session.tabCustomizations?.[String(t.id)]?.emoji,
        state.session.tabCustomizations?.[String(t.id)]?.image,
      ),
      el(
        "span",
        state.session.tabCustomizations?.[String(t.id)]?.name ||
          t.title ||
          "New tab",
        "row-label",
      ),
    );
    if (t.pinned) main.append(icon("pin"));
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
        const next = tabs[i + 1] ?? tabs[i - 1];
        if (next)
          tabPage = Math.floor(
            Math.max(
              0,
              tabs
                .filter((candidate) => candidate.id !== t.id)
                .findIndex((t) => t.id === next.id),
            ) / 80,
          );
        await refresh();
        (
          document.querySelector(`[data-key="tab-${next?.id}"]`) as HTMLElement
        )?.focus();
      },
      "row-control",
    );
    close.replaceChildren(icon("close"));
    close.ariaLabel = "Close " + t.title;
    const more = button("⋯", () => tabMenu(main, t, state), "row-control");
    more.replaceChildren(icon("more"));
    more.ariaLabel = "Actions for " + t.title;
    r.append(main, more, close);
    dragSource(r, "tab", String(t.id));
    dropTarget(r, undefined, t);
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
          document.querySelector<HTMLElement>("#open-tabs")?.focus();
        },
        "Open tabs",
      ),
    );
  root.append(scroll);
  const footer = el("footer");
  footer.append(
    button("⚙  Settings", () => runCommand("settings", state)),
    button("⛶", () => runCommand("fullscreen", state), "icon"),
  );
  footer
    .querySelectorAll("button")
    .forEach((b, i) => (b.dataset.key = "footer-" + i));
  footer.children[1].setAttribute("aria-label", "Toggle browser fullscreen");
  const settings = footer.querySelector("button")!;
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
