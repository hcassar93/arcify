import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DownloadStore,
  summarizeDownload,
  downloadStatus,
  canReveal,
  DOWNLOAD_LIMIT,
} from "../src/downloads";
import { SearchIndex } from "../src/search";
const item = (id = 1) =>
  ({
    id,
    filename: "/synthetic/Design notes.pdf",
    state: "complete",
    exists: true,
    paused: false,
    bytesReceived: 50,
    totalBytes: 100,
    startTime: "2026-10-28T09:00:00Z",
    danger: "safe",
    url: "https://example.test/private-token",
  }) as chrome.downloads.DownloadItem;
test("download projection drops full paths and source URLs", () => {
  const d = summarizeDownload(item());
  assert.equal(d.name, "Design notes.pdf");
  assert.equal("url" in d, false);
  assert.equal("filename" in d, false);
  assert.equal(
    summarizeDownload({ ...item(), filename: "C:\\synthetic\\notes.txt" }).name,
    "notes.txt",
  );
});
test("download status and reveal guard cover progress, missing, paused and interrupted", () => {
  const d = summarizeDownload(item());
  assert.equal(canReveal(d), true);
  assert.equal(downloadStatus({ ...d, exists: false }), "File missing");
  assert.equal(canReveal({ ...d, exists: false }), false);
  assert.equal(
    downloadStatus({ ...d, state: "in_progress" }),
    "50% downloaded",
  );
  assert.equal(
    downloadStatus({ ...d, state: "in_progress", paused: true }),
    "Paused",
  );
  assert.match(downloadStatus({ ...d, state: "interrupted" }), /Interrupted/);
});
test("download store bounds queries, excludes incognito and preserves state on API failure", async () => {
  let fail = false;
  let query: unknown;
  const api = {
    search: async (q: unknown) => {
      query = q;
      if (fail) throw Error("denied");
      return Array.from({ length: 80 }, (_, i) => ({
        ...item(i),
        incognito: i === 0,
      }));
    },
  } as unknown as typeof chrome.downloads;
  const store = new DownloadStore(api);
  await store.refresh();
  assert.deepEqual(query, { limit: 50, orderBy: ["-startTime"] });
  assert.equal(store.items.length, DOWNLOAD_LIMIT);
  assert.equal(store.items[0].id, 1);
  fail = true;
  await store.refresh();
  assert.match(store.error, /unavailable/);
  assert.equal(store.items.length, 50);
});
test("download search ranks filenames locally and respects action-only mode", () => {
  const search = new SearchIndex();
  search.upsert([
    {
      id: "1",
      kind: "download",
      title: "Design notes.pdf",
      detail: "Complete",
      aliases: "download file",
    },
  ]);
  assert.equal(search.query("design", 1)[0].kind, "download");
  assert.equal(search.query(">design", 1).length, 0);
});
