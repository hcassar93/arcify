import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
test("manifest has exactly the permission contract", () => {
  assert.deepEqual(manifest.permissions.sort(), [
    "bookmarks",
    "favicon",
    "sidePanel",
    "storage",
    "tabs",
  ]);
  for (const key of [
    "host_permissions",
    "optional_permissions",
    "optional_host_permissions",
    "content_scripts",
    "web_accessible_resources",
    "externally_connectable",
    "sandbox",
    "update_url",
  ])
    assert.equal(manifest[key], undefined);
  assert.equal(manifest.incognito, "not_allowed");
  assert.equal(manifest.minimum_chrome_version, "142");
});
test("CSP prevents extension remote resource and connection loads", () => {
  const csp = manifest.content_security_policy.extension_pages;
  for (const d of [
    "connect-src 'none'",
    "script-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ])
    assert.ok(csp.includes(d));
  assert.ok(!csp.includes("unsafe-"));
});
const files = readdirSync("src")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, source: readFileSync("src/" + f, "utf8") }));
test("source has no network clients, HTML injection, remote icons or sync storage", () => {
  for (const { file, source } of files)
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|favIconUrl|storage\.sync/,
      file,
    );
});
test("all URL navigation writes are centralized", () => {
  for (const { file, source } of files.filter(
    (f) => f.file !== "navigation.ts",
  )) {
    assert.doesNotMatch(source, /chrome\.tabs\.create\s*\(/, file);
    assert.doesNotMatch(source, /chrome\.tabs\.update\([^;]*\burl\s*:/, file);
  }
});
test("production resources are local and no inline scripts", () => {
  for (const file of readdirSync("public").filter((f) => f.endsWith(".html"))) {
    const source = readFileSync("public/" + file, "utf8");
    assert.doesNotMatch(
      source,
      /(src|href)=["']https?:|<script(?![^>]*src=)|\son\w+=/,
    );
  }
});
test("malicious display titles use textContent primitive", () => {
  const ui = readFileSync("src/ui.ts", "utf8");
  assert.match(ui, /e\.textContent\s*=\s*text/);
  for (const { source } of files)
    assert.doesNotMatch(source, /eval\s*\(|new Function|document\.write/);
});
