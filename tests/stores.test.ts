import test from "node:test";
import assert from "node:assert/strict";
import { BookmarkStore, TabStore } from "../src/stores";
import { bookmarkPlacement, reorderIDs } from "../src/order";
import { treeRows, pageRange, PAGE_SIZE } from "../src/tree-view";
import {
  readSession,
  emptySession,
  flatten,
  type Bookmark,
  type Tab,
} from "../src/model";
import { SearchCatalog } from "../src/catalog";
import type { Snapshot, Changes } from "../src/browser";
import { siteAsset, cachedIconURL } from "../src/icons";
import { resolutionIndex, resolve } from "../src/resolver";
const tree = (): Bookmark[] => [
  {
    id: "r",
    title: "",
    syncing: false,
    children: [
      {
        id: "bar",
        title: "Bar",
        parentId: "r",
        syncing: false,
        children: [
          {
            id: "f",
            title: "Folder",
            parentId: "bar",
            index: 0,
            syncing: false,
            children: [
              {
                id: "a",
                parentId: "f",
                index: 0,
                title: "Alpha",
                url: "https://example.test/a",
                syncing: false,
              },
            ],
          },
          {
            id: "b",
            parentId: "bar",
            index: 1,
            title: "Beta",
            url: "https://example.test/b",
            syncing: false,
          },
          {
            id: "c",
            parentId: "bar",
            index: 2,
            title: "Gamma",
            url: "https://example.test/c",
            syncing: false,
          },
        ],
      },
    ],
  },
];
const tab = (id: number, index = id - 1, windowId = 1): Tab => ({
  id,
  index,
  windowId,
  url: "https://example.test/" + id,
  title: "Tab " + id,
  active: id === 1,
  pinned: false,
  highlighted: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
  frozen: false,
});
test("bookmark event edits preserve unaffected object identity and update descendant paths", () => {
  const store = new BookmarkStore(tree());
  const untouched = store.nodes.get("b");
  store.drain();
  store.update("f", { title: "Renamed" });
  assert.equal(store.nodes.get("b"), untouched);
  assert.equal(store.nodes.get("a")?.path, "Bar / Renamed");
  assert.deepEqual(store.drain().changed, ["f", "a"]);
});
test("bookmark move/create/reorder/remove maintain native ordering and subtree membership", () => {
  const s = new BookmarkStore(tree());
  s.drain();
  s.move("a", "bar", 1);
  assert.deepEqual(
    s.nodes.get("bar")?.children?.map((n) => n.id),
    ["f", "a", "b", "c"],
  );
  assert.equal(s.nodes.get("a")?.path, "Bar");
  s.create({
    id: "d",
    title: "Delta",
    parentId: "bar",
    index: 2,
    syncing: false,
  });
  s.reorder("bar", ["d", "c", "b", "a", "f"]);
  assert.deepEqual(
    s.nodes.get("bar")?.children?.map((n) => n.index),
    [0, 1, 2, 3, 4],
  );
  s.remove("f");
  assert.equal(s.nodes.has("f"), false);
  assert.equal(s.nodes.has("a"), true);
  assert.ok(s.drain().removed.includes("f"));
});
test("external deletion removes a complete subtree and exposes missing root recovery", () => {
  const s = new BookmarkStore(tree());
  s.drain();
  s.remove("bar");
  assert.equal(s.nodes.size, 1);
  assert.deepEqual(
    new Set(s.drain().removed),
    new Set(["bar", "f", "a", "b", "c"]),
  );
});
test("tab insertion, removal, activation and move preserve contiguous native ordering", () => {
  const s = new TabStore([tab(1), tab(2), tab(3)]);
  s.insert(tab(4, 1));
  assert.deepEqual(
    [...s.nodes.values()].sort((a, b) => a.index - b.index).map((t) => t.id),
    [1, 4, 2, 3],
  );
  s.remove(4);
  assert.deepEqual(
    [...s.nodes.values()].map((t) => t.index),
    [0, 1, 2],
  );
  s.activate(3, 1);
  assert.deepEqual(
    [...s.nodes.values()].filter((t) => t.active).map((t) => t.id),
    [3],
  );
  s.move(3, 1, 0);
  assert.equal(s.nodes.get(3)?.index, 0);
  assert.equal(s.nodes.get(1)?.index, 1);
});
test("relative same-folder moves account for removing source in both directions", () => {
  const all = flatten(tree());
  const by = (id: string) => all.find((n) => n.id === id)!;
  assert.deepEqual(bookmarkPlacement(by("f"), by("c"), "after", all), {
    parentId: "bar",
    index: 2,
  });
  assert.deepEqual(bookmarkPlacement(by("f"), by("c"), "before", all), {
    parentId: "bar",
    index: 1,
  });
  assert.deepEqual(bookmarkPlacement(by("c"), by("f"), "before", all), {
    parentId: "bar",
    index: 0,
  });
  assert.deepEqual(bookmarkPlacement(by("b"), by("f"), "inside", all), {
    parentId: "f",
  });
});
test("relative placement rejects self, managed destinations and folder cycles", () => {
  const all = flatten(tree());
  const by = (id: string) => all.find((n) => n.id === id)!;
  assert.throws(() => bookmarkPlacement(by("f"), by("f"), "inside", all));
  assert.throws(() => bookmarkPlacement(by("f"), by("a"), "after", all));
  assert.throws(() =>
    bookmarkPlacement(
      by("b"),
      { ...by("f"), unmodifiable: "managed" },
      "inside",
      all,
    ),
  );
});
test("favourite before/after ordering has identical drag and keyboard semantics", () => {
  assert.deepEqual(reorderIDs(["a", "b", "c"], "a", "c", "after"), [
    "b",
    "c",
    "a",
  ]);
  assert.deepEqual(reorderIDs(["a", "b", "c"], "c", "a", "before"), [
    "c",
    "a",
    "b",
  ]);
  assert.deepEqual(reorderIDs(["a", "b"], "a", "a", "after"), ["a", "b"]);
  assert.throws(() => reorderIDs(["a"], "a", "missing", "after"));
});
test("collapsed folder reveals one active descendant, excluding favourites", () => {
  const children = tree()[0].children![0].children!;
  const rows = treeRows(children, new Set(), new Set(), new Set(["a"]));
  assert.deepEqual(
    rows.map((r) => [r.node.id, r.contextual]),
    [
      ["f", false],
      ["a", true],
      ["b", false],
      ["c", false],
    ],
  );
  assert.equal(
    treeRows(children, new Set(), new Set(["a"]), new Set(["a"])).filter(
      (r) => r.contextual,
    ).length,
    0,
  );
});
test("large tree pages stay bounded and every item remains reachable in order", () => {
  const nodes = Array.from({ length: 5000 }, (_, i) => ({
    id: String(i),
    title: "Item " + i,
    url: "https://example.test/" + i,
    syncing: false,
  }));
  const rows = treeRows(nodes, new Set(), new Set(), new Set());
  const seen = [];
  for (let page = 0; page < pageRange(rows.length, 0).pages; page++) {
    const range = pageRange(rows.length, page);
    assert.ok(range.end - range.start <= PAGE_SIZE);
    seen.push(...rows.slice(range.start, range.end).map((r) => r.node.id));
  }
  assert.deepEqual(
    seen,
    nodes.map((n) => n.id),
  );
  assert.equal(pageRange(0, 100).page, 0);
});
test("session validation rejects malformed identities and restores safe defaults", () => {
  assert.deepEqual(readSession(null), emptySession());
  const s = readSession({
    associations: { x: { a: 1 }, 1: { a: 4, b: "bad" } },
    mru: [1, 1, -1, "x"],
    panels: { 1: true, x: false },
    fullscreen: { 1: "fullscreen", 2: "maximized" },
  });
  assert.deepEqual(s.associations, { "1": { a: 4 } });
  assert.deepEqual(s.mru, [1]);
  assert.deepEqual(s.fullscreen, { "2": "maximized" });
});
test("cached resolution matches reference resolver for duplicates and navigated associations", () => {
  const tabs = [
    tab(1),
    tab(2),
    { ...tab(3), url: "https://example.test/1", active: true },
  ];
  const s = emptySession();
  s.mru = [2, 1, 3];
  const bookmarks: Bookmark[] = flatten(tree()).filter((b) => b.url);
  bookmarks.push({
    id: "d",
    title: "Duplicate",
    url: "https://example.test/1",
    syncing: false,
  });
  s.associations = { "1": { a: 2 } };
  const lookup = resolutionIndex(1, tabs, s);
  for (const b of bookmarks)
    assert.equal(lookup(b)?.id, resolve(b, 1, tabs, s)?.id);
});
test("favicon mapping uses only packaged exact-host assets and rejects deceptive schemes/hosts", () => {
  assert.equal(
    siteAsset("https://github.com/example"),
    "site-icons/github.png",
  );
  assert.equal(siteAsset("https://github.com.evil.test"), undefined);
  assert.equal(siteAsset("javascript:github.com"), undefined);
  assert.equal(siteAsset("https://unknown.test"), undefined);
});
test("catalog applies rename, move, removal and association deltas without full replacement", () => {
  const store = new BookmarkStore(tree());
  const catalog = new SearchCatalog();
  const session = emptySession();
  const changes = (): Changes => {
    const b = store.drain();
    return {
      bookmarks: b.changed,
      removedBookmarks: b.removed,
      tabs: [],
      removedTabs: [],
      session: false,
      preferences: false,
      initial: false,
    };
  };
  const snapshot = (): Snapshot => ({
    prefs: {
      schemaVersion: 1,
      bookmarkRootId: "bar",
      favourites: [],
      icons: {},
      expanded: [],
      savedCollapsed: false,
      theme: "system",
    },
    session,
    tree: store.roots,
    bookmarks: store,
    tabs: [],
    windowId: 1,
    shortcuts: [],
    changes: changes(),
  });
  catalog.update(snapshot());
  assert.equal(catalog.index.query("alpha", 1)[0].id, "a");
  store.update("a", { title: "Updated bookmark" });
  catalog.update(snapshot());
  assert.equal(catalog.index.query("updated", 1)[0].id, "a");
  assert.equal(catalog.index.query("alpha", 1).length, 0);
  store.move("a", "bar", 1);
  catalog.update(snapshot());
  assert.equal(
    catalog.index.query("#updated", 1)[0].detail,
    "Bar · https://example.test/a",
  );
  store.remove("a");
  catalog.update(snapshot());
  assert.equal(catalog.index.query("updated", 1).length, 0);
});

test("cached favicon URL stays in the extension origin with encoded destination only", () => {
  const value = cachedIconURL(
    "https://example.test/a?q=1#frag",
    (path) => "chrome-extension://test-id/" + path,
  )!;
  const parsed = new URL(value);
  assert.equal(parsed.origin, "null");
  assert.equal(parsed.protocol, "chrome-extension:");
  assert.equal(parsed.hostname, "test-id");
  assert.equal(parsed.pathname, "/_favicon/");
  assert.equal(
    parsed.searchParams.get("pageUrl"),
    "https://example.test/a?q=1#frag",
  );
  assert.equal(parsed.searchParams.get("size"), "32");
  assert.deepEqual([...parsed.searchParams.keys()], ["pageUrl", "size"]);
  assert.equal(
    cachedIconURL("javascript:alert(1)", (p) => p),
    undefined,
  );
  assert.equal(
    cachedIconURL(
      "https://user:password@example.test",
      (p) => "chrome-extension://test-id/" + p,
    ),
    undefined,
  );
});
