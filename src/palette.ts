import { DownloadStore, downloadStatus } from "./downloads";
import { icon, siteIcon } from "./icons";
import {
  snapshot,
  watch,
  request,
  preferences,
  type Snapshot,
} from "./browser";
import { flatten } from "./model";
import { type Entry } from "./search";
import { SearchCatalog } from "./catalog";
import { type CommandId } from "./commands";
import {
  el,
  button,
  safely,
  theme,
  runCommand,
  bookmarkMenu,
  tabMenu,
} from "./ui";
let state: Snapshot;
let selected = 0;
let results: Entry[] = [];
const downloads = new DownloadStore(chrome.downloads);
const catalog = new SearchCatalog();
let downloadIDs: string[] = [];
downloads.watch(() => {
  for (const id of downloadIDs) catalog.index.remove("download", id);
  downloadIDs = downloads.items.map((d) => String(d.id));
  catalog.index.upsert(
    downloads.items.map((d) => ({
      id: String(d.id),
      kind: "download" as const,
      title: d.name,
      detail: downloadStatus(d),
      aliases: "download file",
    })),
  );
  if (state) render();
});
const index = catalog.index;
const input = document.querySelector<HTMLInputElement>("#query")!,
  list = document.querySelector<HTMLElement>("#results")!;
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
        "hint",
      ),
    );
    return;
  }
  results.forEach((result, i) => {
    const row = button(
      "",
      () => execute(result, false),
      "result" + (i === selected ? " selected" : ""),
    );
    row.id = "result-" + i;
    row.role = "option";
    row.setAttribute("aria-selected", String(i === selected));
    const symbol = el("span", "", "result-icon");
    const appearance =
      result.kind === "tab"
        ? state.session.tabCustomizations?.[result.id]
        : state.prefs.customizations?.[result.id];
    symbol.append(
      result.kind === "download"
        ? icon("download")
        : result.kind === "command"
          ? icon("command")
          : result.kind === "folder" && !appearance?.image && !appearance?.emoji
            ? icon("folder")
            : siteIcon(
                result.title,
                result.url ??
                  state.tabs.find((t) => t.id === result.tabId)?.url,
                appearance?.emoji,
                appearance?.image,
              ),
    );
    const copy = el("span", "", "result-copy");
    copy.append(
      el("span", result.title, "result-title"),
      el("span", result.detail, "result-detail"),
    );
    const action =
      result.kind === "download"
        ? downloads.items.find((d) => String(d.id) === result.id)?.exists &&
          downloads.items.find((d) => String(d.id) === result.id)?.state ===
            "complete"
          ? "Reveal file"
          : "Manage download"
        : result.kind === "tab" || result.open
          ? "Switch tab"
          : result.kind === "bookmark"
            ? "Open bookmark"
            : result.kind === "folder"
              ? "Reveal folder"
              : result.kind === "url"
                ? "Open URL"
                : "Run command";
    row.append(symbol, copy, el("span", action, "result-action"));
    row.onpointermove = (e) => {
      if (e.movementX || e.movementY) {
        selected = i;
        select();
      }
    };
    const context = () => {
      if (result.kind === "tab") {
        const t = state.tabs.find((t) => t.id === result.tabId);
        if (t) tabMenu(row, t, state);
      } else if (result.kind === "bookmark" || result.kind === "folder") {
        const b = flatten(state.tree).find((b) => b.id === result.id);
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
  const kind = results[selected]?.kind;
  const freshHint = document.querySelector<HTMLElement>("#fresh-hint");
  if (freshHint)
    freshHint.hidden = !["tab", "bookmark", "url"].includes(kind ?? "");
  const hint = document.querySelector("#enter-hint");
  if (hint)
    hint.textContent = kind === "download" ? "↵ Reveal / manage" : "↵ Open";

  [...list.querySelectorAll<HTMLElement>(".result")].forEach((e, i) => {
    e.classList.toggle("selected", i === selected);
    e.setAttribute("aria-selected", String(i === selected));
  });
  input.setAttribute("aria-activedescendant", "result-" + selected);
}
async function execute(e: Entry, fresh: boolean) {
  if (e.kind === "download") {
    const d = downloads.items.find((d) => String(d.id) === e.id);
    await request(
      d?.state === "complete" && d.exists ? "reveal-download" : "downloads",
      { downloadId: Number(e.id), windowId: state.windowId },
    );
    window.close();
    return;
  }
  if (e.kind === "command") {
    await runCommand(e.id as CommandId, state);
    return;
  }
  if (e.kind === "folder") {
    await request("show-sidebar", { windowId: state.windowId });
    const all = flatten(state.tree);
    const ids = [e.id];
    let b = all.find((b) => b.id === e.id);
    while (b?.parentId) {
      ids.push(b.parentId);
      b = all.find((n) => n.id === b?.parentId);
    }
    await preferences({
      ...state.prefs,
      savedCollapsed: false,
      expanded: [...new Set([...state.prefs.expanded, ...ids])],
    });
    window.close();
    return;
  }
  if (e.kind === "tab")
    await request(fresh ? "duplicate" : "switch", {
      tabId: e.tabId,
      windowId: state.windowId,
    });
  else if (e.kind === "bookmark")
    await request("activate", {
      bookmarkId: e.id,
      windowId: state.windowId,
      fresh,
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
    selected =
      (selected +
        (e.key === "ArrowDown" ? 1 : -1) +
        Math.max(1, results.length)) %
      Math.max(1, results.length);
    select();
    document
      .querySelector("#result-" + selected)
      ?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && results[selected]) {
    e.preventDefault();
    void safely(() => execute(results[selected], e.metaKey || e.ctrlKey));
  }
};
document.addEventListener(
  "keydown",
  (e) => {
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (dialog) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        dialog.close();
      }
      return;
    }
    if (
      e.key === "Escape" ||
      ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k")
    ) {
      e.preventDefault();
      window.close();
    }
  },
  true,
);
document.querySelector(".palette-search")?.prepend(icon("search"));
watch(() => void safely(refresh));
void safely(refresh);
input.focus();
