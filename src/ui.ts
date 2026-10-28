import { localImage, type Appearance } from "./appearance";
import { siteIcon } from "./icons";
import { preferences, request, type Snapshot } from "./browser";
import { flatten, movable, descendants, type Bookmark } from "./model";
import { executeCommand, type CommandId } from "./commands";
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  e.className = className;
  return e;
}
export function button(
  label: string,
  fn: () => unknown,
  className = "",
): HTMLButtonElement {
  const b = el("button", label, className);
  b.type = "button";
  b.addEventListener("click", () => void safely(fn));
  return b;
}
export async function safely(fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (error) {
    showError(error);
  }
}
export function showError(error: unknown): void {
  let status = document.querySelector<HTMLElement>("#status");
  if (!status) {
    status = el("div", "", "status");
    status.id = "status";
    status.role = "alert";
    document.body.append(status);
  }
  status.replaceChildren(
    el("span", error instanceof Error ? error.message : String(error)),
    button("Dismiss", () => status!.remove()),
  );
}
export function theme(s: Snapshot): void {
  document.documentElement.dataset.theme = s.prefs.theme;
}
export function short(s: Snapshot, name: string): string {
  return s.shortcuts.find((c) => c.name === name)?.shortcut || "Not assigned";
}
export function monogram(title: string): string {
  return [...title.trim()][0]?.toUpperCase() || "•";
}
export async function sheet(
  title: string,
  fields: Array<{ name: string; label: string; value?: string }>,
  s: Snapshot,
  save: (values: Record<string, string>) => Promise<void>,
  folder = false,
): Promise<void> {
  const dialog = el("dialog");
  const form = el("form");
  form.append(el("h2", title));
  const values: Record<string, HTMLInputElement | HTMLSelectElement> = {};
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
    search.placeholder = "Find a folder…";
    search.setAttribute("aria-label", "Find destination folder");
    const select = el("select");
    select.size = 6;
    select.required = true;
    const nodes = flatten(s.tree).filter(
      (b) => !b.url && b.parentId && !b.unmodifiable,
    );
    const fill = () => {
      select.replaceChildren(
        ...nodes
          .filter((n) =>
            (n.path + " " + n.title)
              .toLowerCase()
              .includes(search.value.toLowerCase()),
          )
          .map((n) => {
            const o = el("option", (n.path ? n.path + " / " : "") + n.title);
            o.value = n.id;
            return o;
          }),
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
    submit,
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
          Object.entries(values).map(([k, v]) => [k, v.value]),
        ),
      );
      dialog.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      submit.disabled = false;
    }
  };
  dialog.showModal();
  (form.querySelector("input,select") as HTMLElement)?.focus();
}
export function menu(
  anchor: HTMLElement,
  items: Array<{ label: string; run: () => unknown; disabled?: boolean }>,
): void {
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
      ...d.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    let i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      i =
        (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
        buttons.length;
      buttons[i]?.focus();
    }
  });
  d.showModal();
}
export async function saveTab(
  s: Snapshot,
  tab: chrome.tabs.Tab | undefined,
  favourite = false,
): Promise<void> {
  if (!tab?.url) throw new Error("No supported content tab is selected.");
  await sheet(
    favourite ? "Save to favourites" : "Save to folder",
    [
      { name: "title", label: "Title", value: tab.title },
      { name: "url", label: "URL", value: tab.url },
    ],
    s,
    async (v) => {
      await request("save", { ...v, favourite });
    },
    true,
  );
}
export async function runCommand(id: CommandId, s: Snapshot): Promise<void> {
  await executeCommand(id, {
    windowId: s.windowId,
    tabId: s.active?.id,
    panel: document.body.dataset.page === "sidebar",
    execute: async (id) => {
      if (id === "save" || id === "favourite") {
        await saveTab(s, s.active, id === "favourite");
        return;
      }
      if (id === "collapse-saved") {
        await preferences({ ...s.prefs, savedCollapsed: true });
        return;
      }
      if (id === "jump-open") {
        await request("show-sidebar", { windowId: s.windowId });
        await chrome.storage.session.set({ jumpOpen: s.windowId });
        return;
      }
      await request(id, { windowId: s.windowId, tabId: s.active?.id });
      if (
        document.body.dataset.page === "palette" &&
        ["new-tab", "close-tab", "settings", "shortcuts"].includes(id)
      )
        window.close();
    },
  });
}
export function bookmarkMenu(
  anchor: HTMLElement,
  b: Bookmark,
  s: Snapshot,
  associated?: number,
): void {
  const write = movable(b);
  const rows: Array<{ label: string; run: () => unknown; disabled?: boolean }> =
    [];
  if (b.url)
    rows.push(
      {
        label: "Open",
        run: () =>
          request("activate", { bookmarkId: b.id, windowId: s.windowId }),
      },
      {
        label: "Open new tab",
        run: () =>
          request("activate", {
            bookmarkId: b.id,
            windowId: s.windowId,
            fresh: true,
          }),
      },
      {
        label: "Reset to saved URL",
        disabled: associated === undefined,
        run: () => request("reset", { bookmarkId: b.id, windowId: s.windowId }),
      },
      {
        label: "Close live tab",
        disabled: associated === undefined,
        run: () => request("close-tab", { tabId: associated }),
      },
      {
        label: s.prefs.favourites.includes(b.id)
          ? "Remove from favourites"
          : "Add to favourites",
        run: () =>
          request(
            s.prefs.favourites.includes(b.id) ? "unfavourite" : "favourite",
            { bookmarkId: b.id },
          ),
      },
    );
  if (s.prefs.favourites.includes(b.id))
    rows.push(
      {
        label: "Move favourite earlier",
        disabled: s.prefs.favourites[0] === b.id,
        run: () =>
          request("reorder-favourite", {
            bookmarkId: b.id,
            direction: "earlier",
          }),
      },
      {
        label: "Move favourite later",
        disabled: s.prefs.favourites.at(-1) === b.id,
        run: () =>
          request("reorder-favourite", {
            bookmarkId: b.id,
            direction: "later",
          }),
      },
    );
  rows.push(
    { label: "Customize appearance…", run: () => appearanceEditor(s, b.id) },
    {
      label: "Move bookmark earlier",
      disabled: !write || b.index === 0,
      run: () => request("move", { bookmarkId: b.id, direction: "earlier" }),
    },
    {
      label: "Move bookmark later",
      disabled: !write,
      run: () => request("move", { bookmarkId: b.id, direction: "later" }),
    },
    {
      label: write
        ? b.url
          ? "Edit bookmark"
          : "Rename folder"
        : "Read-only item — editing unavailable",
      disabled: !write,
      run: () =>
        sheet(
          "Edit " + (b.url ? "bookmark" : "folder"),
          [
            { name: "title", label: "Title", value: b.title },
            ...(b.url ? [{ name: "url", label: "URL", value: b.url }] : []),
          ],
          s,
          (v) => request("edit", { bookmarkId: b.id, ...v }),
        ),
    },
    {
      label: "Move…",
      disabled: !write,
      run: () =>
        sheet(
          "Move item",
          [],
          s,
          (v) => request("move", { bookmarkId: b.id, ...v }),
          true,
        ),
    },
    {
      label: b.url ? "Delete bookmark…" : "Delete folder…",
      disabled: !write,
      run: () => {
        if (
          confirm(
            b.url
              ? "Delete this native bookmark? Its live tab will remain open."
              : `Delete this folder and ${descendants(b)} descendants?`,
          )
        )
          return request("delete", { bookmarkId: b.id });
      },
    },
  );
  menu(anchor, rows);
}
export function tabMenu(
  anchor: HTMLElement,
  t: chrome.tabs.Tab,
  s: Snapshot,
): void {
  menu(anchor, [
    {
      label: "Customize appearance…",
      run: () => appearanceEditor(s, undefined, t.id),
    },
    { label: "Close", run: () => request("close-tab", { tabId: t.id }) },
    {
      label: "Duplicate",
      run: () => request("duplicate", { tabId: t.id, windowId: s.windowId }),
    },
    { label: "Reload", run: () => request("reload", { tabId: t.id }) },
    {
      label: t.mutedInfo?.muted ? "Unmute" : "Mute",
      run: () => request("mute", { tabId: t.id }),
    },
    {
      label: t.pinned ? "Unpin in Chrome" : "Pin in Chrome",
      run: () => request("pin", { tabId: t.id }),
    },
    {
      label: "Move earlier",
      run: () =>
        request("move-tab", { tabId: t.id, index: Math.max(0, t.index - 1) }),
    },
    {
      label: "Move later",
      run: () => request("move-tab", { tabId: t.id, index: t.index + 1 }),
    },
    { label: "Save to folder", run: () => saveTab(s, t) },
    { label: "Add to favourites", run: () => saveTab(s, t, true) },
    {
      label: "Show in palette",
      run: async () => {
        await chrome.action.openPopup();
      },
    },
  ]);
}

export function appearanceEditor(
  s: Snapshot,
  bookmarkId?: string,
  tabId?: number,
): void {
  const original = bookmarkId
    ? flatten(s.tree).find((b) => b.id === bookmarkId)
    : s.tabs.find((t) => t.id === tabId);
  const current = bookmarkId
    ? s.prefs.customizations?.[bookmarkId]
    : s.session.tabCustomizations?.[String(tabId)];
  let image = current?.image;
  const dialog = el("dialog"),
    form = el("form");
  form.append(
    el("h2", "Customize appearance"),
    el(
      "p",
      bookmarkId
        ? "Only changes how this item looks in arcify. Native bookmark names stay unchanged."
        : "Local to this live tab, including navigation. Cleared when it closes or Chrome restarts.",
      "hint",
    ),
  );
  const name = el("input");
  name.value = current?.name ?? "";
  name.maxLength = 120;
  name.placeholder = original?.title ?? "Original name";
  const emoji = el("input");
  emoji.value = current?.emoji ?? "";
  emoji.maxLength = 16;
  emoji.placeholder = "Emoji or short icon";
  for (const [label, input] of [
    ["Display name", name],
    ["Icon replacement", emoji],
  ] as const) {
    const l = el("label", label);
    l.append(input);
    form.append(l);
  }
  const file = el("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp";
  const label = el("label", "Local image · PNG, JPEG or WebP · up to 2 MB");
  label.append(file);
  form.append(label);
  const preview = el("div", "", "appearance-preview"),
    error = el("p", "", "error");
  error.role = "alert";
  const paint = () =>
    preview.replaceChildren(
      siteIcon(
        name.value || original?.title || "Item",
        original?.url,
        emoji.value,
        image,
      ),
    );
  paint();
  emoji.oninput = () => {
    image = undefined;
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
  const commit = async (appearance: Appearance) => {
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
    submit,
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
        ...(image ? { image } : {}),
      });
  };
  dialog.onclose = () => dialog.remove();
  dialog.showModal();
  name.focus();
}
