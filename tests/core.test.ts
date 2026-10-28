import test from "node:test";
import assert from "node:assert/strict";
import { canonical, destination, enteredURL } from "../src/navigation";
import {
  migrate,
  emptySession,
  pruneSession,
  canMove,
  flatten,
  descendants,
  type Bookmark,
  type Tab,
} from "../src/model";
import { resolve, owners, SavedResolver } from "../src/resolver";
import { SearchIndex, score } from "../src/search";
const b = (id: string, url = "https://example.test/"): Bookmark => ({
  syncing: false,
  id,
  title: "Bookmark " + id,
  url,
  parentId: "root",
});
const t = (
  id: number,
  url = "https://example.test/",
  windowId = 1,
  index = id,
  active = false,
): Tab => ({
  frozen: false,
  id,
  url,
  windowId,
  index,
  active,
  pinned: false,
  highlighted: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
});
for (const url of [
  "javascript:alert(1)",
  "data:text/html,test",
  "file:///tmp/a",
  "chrome-extension://abc/a",
  "ftp://example.test",
  "https://user:pass@example.test",
  "https://user@example.test",
  "custom:abc",
])
  test("reject destination " + url, () =>
    assert.throws(() => destination(url)),
  );
test("only named internal actions allowed", () => {
  assert.equal(destination("chrome://newtab/", true), "chrome://newtab/");
  assert.throws(() => destination("chrome://settings", true));
});
test("canonical host and scheme but preserve meaningful URL components", () => {
  assert.equal(
    canonical("HTTPS://EXAMPLE.TEST:443/a?q=1#b"),
    "https://example.test/a?q=1#b",
  );
  assert.notEqual(
    canonical("https://example.test/a?q=1"),
    canonical("https://example.test/a?q=2"),
  );
  assert.notEqual(
    canonical("http://example.test"),
    canonical("https://example.test"),
  );
  assert.notEqual(
    canonical("https://example.test/#a"),
    canonical("https://example.test/#b"),
  );
});
test("explicit URLs and domain entry support ports and localhost", () => {
  assert.equal(
    enteredURL("localhost:8080/a?b=c#d"),
    "https://localhost:8080/a?b=c#d",
  );
  assert.equal(enteredURL("example.test/a"), "https://example.test/a");
  assert.equal(enteredURL("hello world"), null);
  assert.equal(enteredURL("please search"), null);
  assert.equal(enteredURL("javascript:alert(1)"), null);
});
test("malformed optional preferences recover safely", () => {
  const p = migrate({
    schemaVersion: 99,
    favourites: ["a", "a", 4],
    theme: "evil",
    expanded: null,
    icons: { a: "🌱", b: 17 },
  });
  assert.deepEqual(p.favourites, ["a"]);
  assert.equal(p.theme, "system");
  assert.deepEqual(p.icons, { a: "🌱" });
  assert.equal(migrate(null).bookmarkRootId, null);
});
test("favourites limit is 12", () =>
  assert.equal(
    migrate({ favourites: Array.from({ length: 20 }, (_, i) => String(i)) })
      .favourites.length,
    12,
  ));
test("associations survive navigation within original window", () => {
  const s = emptySession();
  s.associations = { "1": { a: 7 } };
  assert.equal(resolve(b("a"), 1, [t(7, "https://other.test/")], s)?.id, 7);
  assert.equal(resolve(b("a"), 2, [t(7, "https://other.test/")], s), undefined);
});
test("exact matching prefers active, then MRU, then native order", () => {
  const s = emptySession();
  s.mru = [3, 2];
  assert.equal(
    resolve(b("a"), 1, [t(2), t(3), t(4, undefined, 1, 4, true)], s)?.id,
    4,
  );
  assert.equal(resolve(b("a"), 1, [t(2), t(3)], s)?.id, 3);
  s.mru = [];
  assert.equal(resolve(b("a"), 1, [t(3), t(2)], s)?.id, 2);
});
test("duplicate ownership favours favourite; extra live duplicate stays ordinary", () => {
  const map = owners([b("a"), b("b")], ["b"], 1, [t(1), t(2)], emptySession());
  assert.deepEqual([...map], [[1, "b"]]);
});
test("closed and moved tab associations are pruned without removing bookmarks", () => {
  const s = emptySession();
  s.associations = { "1": { a: 1, b: 2, c: 3 } };
  s.mru = [1, 2, 3];
  const result = pruneSession(
    s,
    [t(2, undefined, 2), t(3)],
    [b("a"), b("b"), b("c")],
  );
  assert.deepEqual(result.associations, { "1": { c: 3 } });
  assert.deepEqual(result.mru, [2, 3]);
});
test("rapid activation is single-flight and remembers existing exact match", async () => {
  let creates = 0;
  const s = emptySession();
  let tabs: Tab[] = [];
  const resolver = new SavedResolver(
    {
      tabs: async () => tabs,
      activate: async () => {},
      create: async (url, w) => {
        creates++;
        const tab = t(creates, url, w);
        tabs.push(tab);
        return tab;
      },
    },
    s,
    async () => {},
  );
  const [one, two] = await Promise.all([
    resolver.activate(b("a"), 1),
    resolver.activate(b("a"), 1),
  ]);
  assert.equal(one.id, two.id);
  assert.equal(creates, 1);
  tabs = [t(1, "https://redirect.test/")];
  await resolver.activate(b("a"), 1);
  assert.equal(creates, 1);
  await resolver.activate(b("a"), 1, true);
  assert.equal(creates, 2);
  assert.equal(s.associations["1"].a, 1);
});
test("adapter failure does not write false association and retry works", async () => {
  const s = emptySession();
  let fail = true;
  const resolver = new SavedResolver(
    {
      tabs: async () => [],
      activate: async () => {},
      create: async () => {
        if (fail) throw new Error("Denied");
        return t(1);
      },
    },
    s,
    async () => {},
  );
  await assert.rejects(resolver.activate(b("a"), 1), /Denied/);
  assert.deepEqual(s.associations, {});
  fail = false;
  await resolver.activate(b("a"), 1);
  assert.equal(s.associations["1"].a, 1);
});
test("existing exact match is associated before later redirect", async () => {
  const s = emptySession();
  const resolver = new SavedResolver(
    {
      tabs: async () => [t(9)],
      activate: async () => {},
      create: async () => {
        throw new Error("Should not create");
      },
    },
    s,
    async () => {},
  );
  await resolver.activate(b("a"), 1);
  assert.equal(resolve(b("a"), 1, [t(9, "https://redirect.test/")], s)?.id, 9);
});
test("tree movement rejects cycles and managed targets", () => {
  const root: Bookmark = {
    syncing: false,
    id: "r",
    title: "Root",
    children: [],
  };
  const a: Bookmark = { syncing: false, id: "a", title: "A", parentId: "r" },
    child: Bookmark = {
      syncing: false,
      id: "c",
      title: "Child",
      parentId: "a",
    };
  assert.equal(canMove(a, child, [root, a, child]), false);
  assert.equal(canMove(child, a, [root, a, child]), true);
  assert.equal(
    canMove(child, { ...a, unmodifiable: "managed" }, [root, a, child]),
    false,
  );
  assert.equal(
    canMove({ ...a, folderType: "bookmarks-bar" }, root, [root, a]),
    false,
  );
});
test("native tree order and descendant counts are preserved", () => {
  const root: Bookmark = {
    syncing: false,
    id: "r",
    title: "Root",
    children: [
      { syncing: false, id: "f", title: "Folder", children: [b("a"), b("b")] },
    ],
  };
  assert.deepEqual(
    flatten([root]).map((b) => b.id),
    ["r", "f", "a", "b"],
  );
  assert.equal(descendants(root), 3);
});
test("ranking tiers outrank window recency", () => {
  const index = new SearchIndex();
  index.replace([
    { kind: "tab", id: "a", title: "Notes", detail: "", windowId: 2 },
    {
      kind: "tab",
      id: "b",
      title: "My Notes",
      detail: "",
      windowId: 1,
      recent: 0,
    },
    { kind: "tab", id: "c", title: "Notes archive", detail: "", windowId: 1 },
  ]);
  assert.deepEqual(
    index.query("notes", 1).map((e) => e.id),
    ["a", "c", "b"],
  );
  assert.ok(score("notes", "", "nts") < Infinity);
});
test("unicode matching, prefixes, duplicate result and no match handling", () => {
  const index = new SearchIndex();
  index.replace([
    {
      id: "a",
      kind: "bookmark",
      title: "Café",
      detail: "Recipes",
      tabId: 1,
      open: true,
    },
    { id: "1", kind: "tab", title: "Café", detail: "Recipes", tabId: 1 },
    { id: "run", kind: "command", title: "Reload", detail: "" },
  ]);
  assert.equal(index.query("cafe", 1).length, 1);
  assert.equal(index.query("@cafe", 1)[0].kind, "tab");
  assert.equal(index.query("#cafe", 1)[0].kind, "bookmark");
  assert.equal(index.query(">reload", 1)[0].kind, "command");
  assert.deepEqual(index.query("zzzz nope", 1), []);
});
test("empty query limits recent tabs and excludes current", () => {
  const index = new SearchIndex();
  index.replace(
    Array.from({ length: 30 }, (_, i) => ({
      kind: "tab",
      id: String(i),
      tabId: i,
      title: "Tab " + i,
      detail: "",
      recent: i,
    })),
  );
  assert.deepEqual(
    index.query("", 1, 0).map((e) => e.tabId),
    [1, 2, 3, 4, 5],
  );
});
test("incremental search changes and bounded results", () => {
  const index = new SearchIndex();
  index.replace(
    Array.from({ length: 100 }, (_, i) => ({
      kind: "bookmark",
      id: String(i),
      title: "Example " + i,
      detail: "",
    })),
  );
  assert.equal(index.query("example", 1).length, 80);
  index.upsert([{ kind: "bookmark", id: "0", title: "Changed", detail: "" }]);
  assert.equal(index.query("changed", 1)[0].id, "0");
  index.remove("bookmark", "0");
  assert.equal(index.query("changed", 1).length, 0);
});
