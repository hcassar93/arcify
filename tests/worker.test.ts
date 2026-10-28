import test from "node:test";
import assert from "node:assert/strict";
import type { Bookmark, Tab } from "../src/model";
const event = () => ({ addListener: () => {}, removeListener: () => {} });
const local: Record<string, unknown> = {},
  session: Record<string, unknown> = {};
let sequence = 20;
let denied = false;
const bookmarks: Bookmark[] = [
  { id: "0", title: "Root", syncing: false },
  {
    id: "1",
    parentId: "0",
    title: "Bar",
    folderType: "bookmarks-bar",
    syncing: false,
  },
  {
    id: "a",
    parentId: "1",
    title: "Example",
    url: "https://example.test/",
    syncing: false,
  },
];
const tabs: Tab[] = [];
const mutations: string[] = [];
let listener: (
  m: Record<string, unknown>,
  sender: { id: string },
  reply: (v: unknown) => void,
) => boolean;
const area = (data: Record<string, unknown>) => ({
  get: async () => structuredClone(data),
  set: async (value: Record<string, unknown>) =>
    Object.assign(data, structuredClone(value)),
});
const chromeMock = {
  runtime: {
    id: "ox-test",
    onConnect: event(),
    onStartup: event(),
    onMessage: {
      addListener: (fn: typeof listener) => {
        listener = fn;
      },
    },
    openOptionsPage: async () => {},
  },
  storage: { local: area(local), session: area(session) },
  sidePanel: {
    onOpened: event(),
    onClosed: event(),
    open: async () => {},
    close: async () => {},
  },
  commands: { onCommand: event() },
  windows: {
    get: async (id: number) => ({ id, type: "normal", state: "normal" }),
    update: async () => {},
  },
  bookmarks: {
    getTree: async () => structuredClone(bookmarks),
    get: async (id: string) => {
      const b = bookmarks.find((b) => b.id === id);
      if (!b) throw new Error("Missing bookmark");
      return [structuredClone(b)];
    },
    onRemoved: event(),
    create: async (value: Partial<Bookmark>) => {
      if (denied) throw new Error("Write denied");
      mutations.push("bookmark.create");
      const node = {
        ...value,
        id: String(sequence++),
        syncing: false,
      } as Bookmark;
      bookmarks.push(node);
      return structuredClone(node);
    },
    update: async (id: string, value: Partial<Bookmark>) => {
      if (denied) throw new Error("Write denied");
      mutations.push("bookmark.update");
      const node = bookmarks.find((b) => b.id === id)!;
      Object.assign(node, value);
      return structuredClone(node);
    },
    move: async () => {},
    remove: async () => {},
    removeTree: async () => {},
  },
  tabs: {
    query: async () => structuredClone(tabs),
    get: async (id: number) => {
      const t = tabs.find((t) => t.id === id);
      if (!t) throw new Error("Missing tab");
      return structuredClone(t);
    },
    create: async (value: Partial<Tab>) => {
      mutations.push("tab.create");
      const tab = {
        ...value,
        id: sequence++,
        index: tabs.length,
        active: true,
      } as Tab;
      tabs.push(tab);
      return structuredClone(tab);
    },
    update: async (id: number, value: Partial<Tab>) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) throw new Error("Missing tab");
      Object.assign(tab, value);
      return structuredClone(tab);
    },
    remove: async (id: number) => {
      const i = tabs.findIndex((t) => t.id === id);
      if (i >= 0) tabs.splice(i, 1);
    },
    reload: async () => {},
    onActivated: event(),
    onRemoved: event(),
    onAttached: event(),
    onDetached: event(),
    onReplaced: event(),
  },
};
Object.assign(globalThis, { chrome: chromeMock });
await import("../src/worker");
const send = (action: string, args: Record<string, unknown> = {}) =>
  new Promise<{ ok: boolean; error?: string; value?: unknown }>((resolve) =>
    listener({ action, ...args }, { id: "ox-test" }, (v) =>
      resolve(v as { ok: boolean; error?: string; value?: unknown }),
    ),
  );
test("worker startup is read-only for bookmarks and tabs", async () => {
  await send("settings");
  assert.deepEqual(mutations, []);
});
test("worker activation serializes concurrent clicks, persists redirects, reset is explicit", async () => {
  const replies = await Promise.all([
    send("activate", { bookmarkId: "a", windowId: 1 }),
    send("activate", { bookmarkId: "a", windowId: 1 }),
  ]);
  assert.ok(replies.every((r) => r.ok));
  assert.equal(tabs.length, 1);
  tabs[0].url = "https://redirect.test/";
  await send("activate", { bookmarkId: "a", windowId: 1 });
  assert.equal(tabs[0].url, "https://redirect.test/");
  await send("reset", { bookmarkId: "a", windowId: 1 });
  assert.equal(tabs[0].url, "https://example.test/");
});
test("worker deliberate fresh activation creates exactly one additional tab", async () => {
  const count = tabs.length;
  assert.equal(
    (await send("activate", { bookmarkId: "a", windowId: 1, fresh: true })).ok,
    true,
  );
  assert.equal(tabs.length, count + 1);
});
test("worker denied edit preserves bookmark and sends recoverable error", async () => {
  denied = true;
  const before = structuredClone(bookmarks);
  const result = await send("edit", { bookmarkId: "a", title: "Changed" });
  denied = false;
  assert.equal(result.ok, false);
  assert.match(result.error!, /denied/);
  assert.deepEqual(bookmarks, before);
});
test("worker rejects bookmarklets before browser mutation", async () => {
  const count = mutations.length;
  const reply = await send("save", {
    parentId: "1",
    title: "Unsafe",
    url: "javascript:alert(1)",
  });
  assert.equal(reply.ok, false);
  assert.equal(mutations.length, count);
});
test("worker handles tab disappearing between search and execution", async () => {
  const result = await send("switch", { tabId: 99999 });
  assert.equal(result.ok, false);
  assert.match(result.error!, /Missing tab/);
});
test("worker save only mutates after explicit message", async () => {
  const count = bookmarks.length;
  const result = await send("save", {
    parentId: "1",
    title: "Synthetic saved link",
    url: "https://example.test/new",
  });
  assert.equal(result.ok, true);
  assert.equal(bookmarks.length, count + 1);
});
