import {
  snapshot,
  watch,
  request,
  preferences,
  type Snapshot,
} from "./browser";
import { flatten } from "./model";
import { resolve } from "./resolver";
import { SearchIndex, type Entry } from "./search";
import { commands, type CommandId } from "./commands";
import { el, button, safely, theme, runCommand, monogram } from "./ui";
let state: Snapshot;
let selected = 0;
let results: Entry[] = [];
const index = new SearchIndex();
const input = document.querySelector<HTMLInputElement>("#query")!,
  list = document.querySelector<HTMLElement>("#results")!;
async function refresh() {
  state = await snapshot();
  theme(state);
  const entries: Entry[] = state.tabs.map((t) => ({
    id: String(t.id),
    kind: "tab",
    title: t.title ?? "Untitled tab",
    detail:
      (t.windowId !== state.windowId ? "Other window · " : "") + (t.url ?? ""),
    windowId: t.windowId,
    tabId: t.id,
    recent:
      state.session.mru.indexOf(t.id!) < 0
        ? 1e9
        : state.session.mru.indexOf(t.id!),
  }));
  for (const b of flatten(state.tree)) {
    if (!b.parentId) continue;
    const t = b.url
      ? resolve(b, state.windowId, state.tabs, state.session)
      : undefined;
    entries.push({
      id: b.id,
      kind: b.url ? "bookmark" : "folder",
      title: b.title || "Untitled",
      detail: [b.path, b.url].filter(Boolean).join(" · "),
      url: b.url,
      tabId: t?.id,
      open: !!t,
      windowId: t?.windowId,
    });
  }
  for (const c of commands)
    if (!c.needsTab || state.active)
      entries.push({
        id: c.id,
        kind: "command",
        title: c.label,
        detail: "Browser action",
        aliases: c.aliases,
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
    const icon = el(
      "span",
      result.kind === "command"
        ? "⌘"
        : result.kind === "folder"
          ? "▹"
          : monogram(result.title),
      "result-icon",
    );
    const copy = el("span", "", "result-copy");
    copy.append(
      el("span", result.title, "result-title"),
      el("span", result.detail, "result-detail"),
    );
    const action =
      result.kind === "tab" || result.open
        ? "Switch tab"
        : result.kind === "bookmark"
          ? "Open bookmark"
          : result.kind === "folder"
            ? "Reveal folder"
            : result.kind === "url"
              ? "Open URL"
              : "Run command";
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
  [...list.querySelectorAll<HTMLElement>(".result")].forEach((e, i) => {
    e.classList.toggle("selected", i === selected);
    e.setAttribute("aria-selected", String(i === selected));
  });
  input.setAttribute("aria-activedescendant", "result-" + selected);
}
async function execute(e: Entry, fresh: boolean) {
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
document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  if (
    e.key === "Escape" ||
    ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k")
  ) {
    e.preventDefault();
    window.close();
  }
});
watch(() => void safely(refresh));
void safely(refresh);
input.focus();
