import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAppearance,
  readAppearances,
  checkAppearanceQuota,
  localImage,
} from "../src/appearance";
import { migrate, readSession, pruneSession } from "../src/model";
test("appearance validates names, rejects active images and recovers invalid optional settings", () => {
  assert.deepEqual(validateAppearance({ name: "  My tab ", emoji: "🌱" }), {
    name: "My tab",
    emoji: "🌱",
  });
  assert.throws(() => validateAppearance({ name: "x".repeat(121) }));
  for (const image of [
    "https://example.test/icon.png",
    "data:image/svg+xml,<svg/>",
    "data:text/html,a",
  ])
    assert.throws(() => validateAppearance({ image }));
  assert.deepEqual(
    readAppearances({ a: { image: "bad" }, b: { name: "Good" } }),
    { b: { name: "Good" } },
  );
  assert.throws(() => checkAppearanceQuota({ image: "x".repeat(2000001) }));
});
test("bookmark customizations persist while tab customizations are session-only and pruned", () => {
  assert.equal(
    migrate({ customizations: { b: { name: "Saved" } } }).customizations?.b
      .name,
    "Saved",
  );
  const session = readSession({
    tabCustomizations: { "1": { name: "Live" }, "2": { name: "Gone" } },
  });
  const next = pruneSession(
    session,
    [{ id: 1, windowId: 3 } as chrome.tabs.Tab],
    [],
  );
  assert.deepEqual(next.tabCustomizations, { "1": { name: "Live" } });
  assert.equal("tabCustomizations" in migrate(session), false);
});
test("local image validation rejects SVG, oversized files and disguised raster files", async () => {
  for (const f of [
    new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }),
    new File(["bad"], "a.png", { type: "image/png" }),
    new File([new Uint8Array(2000001)], "a.png", { type: "image/png" }),
  ])
    await assert.rejects(localImage(f));
});
