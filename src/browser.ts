import {
  migrate,
  readSession,
  flatten,
  type Preferences,
  type Session,
  type Bookmark,
  type Tab,
} from "./model";
export interface Snapshot {
  prefs: Preferences;
  session: Session;
  tree: Bookmark[];
  tabs: Tab[];
  windowId: number;
  active?: Tab;
  shortcuts: chrome.commands.Command[];
}
export async function snapshot(): Promise<Snapshot> {
  const [local, session, tree, tabs, win, shortcuts] = await Promise.all([
    chrome.storage.local.get("preferences"),
    chrome.storage.session.get("session"),
    chrome.bookmarks.getTree(),
    chrome.tabs.query({ windowType: "normal" }),
    chrome.windows.getCurrent(),
    chrome.commands.getAll(),
  ]);
  const prefs = migrate(local.preferences);
  if (!prefs.bookmarkRootId)
    prefs.bookmarkRootId =
      flatten(tree).find((n) => n.folderType === "bookmarks-bar")?.id ?? null;
  return {
    prefs,
    session: readSession(session.session),
    tree,
    tabs,
    windowId: win.id!,
    active: tabs.find((t) => t.windowId === win.id && t.active),
    shortcuts,
  };
}
export async function preferences(prefs: Preferences): Promise<void> {
  await chrome.storage.local.set({ preferences: migrate(prefs) });
}
export function watch(refresh: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 45);
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
    chrome.storage.onChanged,
  ];
  for (const event of events) event.addListener(update);
  return () => {
    clearTimeout(timer);
    for (const event of events) event.removeListener(update);
  };
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
      response?.error ?? "Ox could not complete this action. Please try again.",
    );
  return response.value;
}
