export type Bookmark = chrome.bookmarks.BookmarkTreeNode;
export type Tab = chrome.tabs.Tab;
export interface Preferences {
  schemaVersion: 1;
  bookmarkRootId: string | null;
  favourites: string[];
  icons: Record<string, string>;
  expanded: string[];
  savedCollapsed: boolean;
  theme: "system" | "light" | "dark";
}
export interface Session {
  associations: Record<string, Record<string, number>>;
  mru: number[];
  panels: Record<string, boolean>;
  fullscreen: Record<string, "normal" | "maximized">;
}
export const defaults: Preferences = {
  schemaVersion: 1,
  bookmarkRootId: null,
  favourites: [],
  icons: {},
  expanded: [],
  savedCollapsed: false,
  theme: "system",
};
export const emptySession = (): Session => ({
  associations: {},
  mru: [],
  panels: {},
  fullscreen: {},
});
const ids = (x: unknown): string[] =>
  Array.isArray(x)
    ? [...new Set(x.filter((v): v is string => typeof v === "string"))]
    : [];
export function migrate(raw: unknown): Preferences {
  const p = raw && typeof raw === "object" ? (raw as Partial<Preferences>) : {};
  return {
    ...defaults,
    bookmarkRootId:
      typeof p.bookmarkRootId === "string" ? p.bookmarkRootId : null,
    favourites: ids(p.favourites).slice(0, 12),
    expanded: ids(p.expanded),
    savedCollapsed: p.savedCollapsed === true,
    theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system",
    icons: Object.fromEntries(
      Object.entries(
        p.icons && typeof p.icons === "object" ? p.icons : {},
      ).filter(
        ([k, v]) =>
          k !== "__proto__" && typeof v === "string" && v.length <= 16,
      ),
    ),
  };
}
export function flatten(
  nodes: Bookmark[],
  path = "",
): Array<Bookmark & { path: string }> {
  return nodes.flatMap((n) => [
    { ...n, path },
    ...flatten(n.children ?? [], [path, n.title].filter(Boolean).join(" / ")),
  ]);
}
export function pruneSession(
  s: Session,
  tabs: Tab[],
  bookmarks: Bookmark[],
): Session {
  const valid = new Map(tabs.map((t) => [t.id, t]));
  const ids = new Set(bookmarks.map((b) => b.id));
  const associations = Object.fromEntries(
    Object.entries(s.associations ?? {}).map(([w, items]) => [
      w,
      Object.fromEntries(
        Object.entries(items).filter(
          ([b, t]) => ids.has(b) && valid.get(t)?.windowId === Number(w),
        ),
      ),
    ]),
  );
  return {
    ...emptySession(),
    ...s,
    associations,
    mru: (s.mru ?? []).filter((id) => valid.has(id)),
  };
}
export function descendants(node: Bookmark): number {
  return (node.children ?? []).reduce((n, c) => n + 1 + descendants(c), 0);
}
export function writable(node: Bookmark | undefined): boolean {
  return !!node && !node.unmodifiable;
}
export function movable(node: Bookmark | undefined): boolean {
  return writable(node) && !!node?.parentId && !node.folderType;
}
export function canMove(
  node: Bookmark,
  target: Bookmark,
  all: Bookmark[],
): boolean {
  if (
    !movable(node) ||
    !writable(target) ||
    target.url ||
    node.id === target.id
  )
    return false;
  let p: Bookmark | undefined = target;
  const seen = new Set<string>();
  while (p) {
    if (p.id === node.id || seen.has(p.id)) return false;
    seen.add(p.id);
    p = all.find((n) => n.id === p?.parentId);
  }
  return true;
}
export function readSession(raw: unknown): Session {
  const result = emptySession();
  if (!raw || typeof raw !== "object") return result;
  const s = raw as Record<string, unknown>;
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  for (const [w, items] of Object.entries(record(s.associations))) {
    if (!/^\d+$/.test(w)) continue;
    result.associations[w] = Object.fromEntries(
      Object.entries(record(items)).filter(
        ([id, t]) =>
          id !== "__proto__" && Number.isInteger(t) && Number(t) >= 0,
      ),
    ) as Record<string, number>;
  }
  result.mru = Array.isArray(s.mru)
    ? [
        ...new Set(
          s.mru.filter((id): id is number => Number.isInteger(id) && id >= 0),
        ),
      ].slice(0, 1000)
    : [];
  for (const [w, open] of Object.entries(record(s.panels)))
    if (/^\d+$/.test(w) && typeof open === "boolean") result.panels[w] = open;
  for (const [w, state] of Object.entries(record(s.fullscreen)))
    if (/^\d+$/.test(w) && (state === "normal" || state === "maximized"))
      result.fullscreen[w] = state;
  return result;
}
