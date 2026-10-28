import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.deepEqual(manifest.permissions.sort(), [
  "bookmarks",
  "downloads",
  "favicon",
  "sidePanel",
  "storage",
  "tabs",
]);
for (const f of await readdir("dist"))
  if (/\.(js|css|html)$/.test(f)) {
    const text = await readFile("dist/" + f, "utf8");
    assert.doesNotMatch(
      text,
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|storage\.sync|favIconUrl|https?:\/\/[^'"\s]*(?:\.js|\.css|\.woff)/,
      f,
    );
  }
for (const page of ["sidebar", "palette", "options"])
  assert.ok(
    (await readFile(`dist/${page}.html`, "utf8")).includes(`${page}.js`),
  );
console.log(
  "Built permission/resource/network-client audit passed. Runtime traffic inspection is a separate native Chrome gate.",
);
