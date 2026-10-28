import {
  migrate,
  readSession,
  type Preferences,
  type Session,
  type Bookmark,
  type Tab,
} from "./model";
import { BookmarkStore, TabStore } from "./stores";
export interface Changes {
  bookmarks: string[];
  removedBookmarks: string[];
  tabs: number[];
  removedTabs: number[];
  session: boolean;
  preferences: boolean;
  initial: boolean;
}
export interface Snapshot {
  prefs: Preferences;
  session: Session;
  tree: Bookmark[];
  tabs: Tab[];
  windowId: number;
  active?: Tab;
  shortcuts: chrome.commands.Command[];
  bookmarks?: BookmarkStore;
  changes?: Changes;
  needsSetup?: boolean;
}
let init: Promise<void> | undefined;
let bookmarkStore = new BookmarkStore(),
  tabStore = new TabStore();
let prefs = migrate(null),
  session = readSession(null),
  windowId: number,
  shortcuts: chrome.commands.Command[] = [];
let initial = true,
  sessionChanged = true,
  preferencesChanged = true;
let hydrated = false;
const pending: Array<() => void> = [];
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const notify = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    for (const fn of subscribers) fn();
  }, 40);
};
let recovering = false;
async function recover(): Promise<void> {
  if (recovering) return;
  recovering = true;
  try {
    bookmarkStore.reset(await chrome.bookmarks.getTree());
    notify();
  } finally {
    recovering = false;
  }
}
const apply = (fn: () => void) => {
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
async function refreshTab(id: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(id);
    const win = await chrome.windows.get(tab.windowId);
    apply(() =>
      win.type === "normal"
        ? tabStore.nodes.has(id)
          ? tabStore.upsert(tab)
          : tabStore.insert(tab)
        : tabStore.remove(id),
    );
  } catch {
    apply(() => tabStore.remove(id));
  }
}
function start(): Promise<void> {
  if (init) return init;
  chrome.bookmarks.onCreated.addListener((_id, node) =>
    apply(() => bookmarkStore.create(node)),
  );
  chrome.bookmarks.onChanged.addListener((id, change) =>
    apply(() => bookmarkStore.update(id, change)),
  );
  chrome.bookmarks.onMoved.addListener((id, info) =>
    apply(() => bookmarkStore.move(id, info.parentId, info.index)),
  );
  chrome.bookmarks.onRemoved.addListener((id) =>
    apply(() => bookmarkStore.remove(id)),
  );
  chrome.bookmarks.onChildrenReordered.addListener((id, info) =>
    apply(() => bookmarkStore.reorder(id, info.childIds)),
  );
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) void refreshTab(tab.id);
  });
  chrome.tabs.onUpdated.addListener((id, _change, tab) => {
    if (tabStore.nodes.has(id)) apply(() => tabStore.upsert(tab));
    else void refreshTab(id);
  });
  chrome.tabs.onRemoved.addListener((id) => apply(() => tabStore.remove(id)));
  chrome.tabs.onMoved.addListener((id, info) =>
    apply(() => tabStore.move(id, info.windowId, info.toIndex)),
  );
  chrome.tabs.onActivated.addListener((info) =>
    apply(() => tabStore.activate(info.tabId, info.windowId)),
  );
  chrome.tabs.onDetached.addListener((id) => apply(() => tabStore.remove(id)));
  chrome.tabs.onAttached.addListener((id) => void refreshTab(id));
  chrome.tabs.onReplaced.addListener((added, removed) => {
    apply(() => tabStore.remove(removed));
    void refreshTab(added);
  });
  chrome.storage.onChanged.addListener((changes, area) =>
    apply(() => {
      if (area === "local" && changes.preferences) {
        prefs = migrate(changes.preferences.newValue);
        preferencesChanged = true;
      }
      if (area === "session" && changes.session) {
        session = readSession(changes.session.newValue);
        sessionChanged = true;
      }
    }),
  );
  init = Promise.all([
    chrome.storage.local.get("preferences"),
    chrome.storage.session.get("session"),
    chrome.bookmarks.getTree(),
    chrome.tabs.query({ windowType: "normal" }),
    chrome.windows.getCurrent(),
    chrome.commands.getAll(),
  ]).then(([local, stored, tree, tabs, win, bindings]) => {
    prefs = migrate(local.preferences);
    session = readSession(stored.session);
    bookmarkStore = new BookmarkStore(tree);
    tabStore = new TabStore(tabs);
    windowId = win.id!;
    shortcuts = bindings;
    hydrated = true;
    for (const fn of pending.splice(0)) apply(fn);
  });
  return init;
}
export async function snapshot(): Promise<Snapshot> {
  await start();
  const b = bookmarkStore.drain(),
    t = tabStore.drain();
  const effective = { ...prefs };
  if (!effective.bookmarkRootId)
    effective.bookmarkRootId =
      [...bookmarkStore.nodes.values()].find(
        (n) => n.folderType === "bookmarks-bar",
      )?.id ?? null;
  const tabs = [...tabStore.nodes.values()];
  const changes = {
    bookmarks: b.changed,
    removedBookmarks: b.removed,
    tabs: t.changed,
    removedTabs: t.removed,
    session: sessionChanged,
    preferences: preferencesChanged,
    initial,
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
    active: tabs.find((t) => t.windowId === windowId && t.active),
    shortcuts,
    bookmarks: bookmarkStore,
    changes,
  };
}
export async function preferences(p: Preferences): Promise<void> {
  await chrome.storage.local.set({ preferences: migrate(p) });
}
export function watch(refresh: () => void): () => void {
  subscribers.add(refresh);
  void start().catch(() => refresh());
  return () => subscribers.delete(refresh);
}
export async function request<T = void>(
  action: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = (await chrome.runtime.sendMessage({ action, ...args })) as {
    ok: boolean;
    value: T;
    error?: string;
  };
  if (!response?.ok)
    throw new Error(
      response?.error ??
        "arcify could not complete this action. Please try again.",
    );
  return response.value;
}
