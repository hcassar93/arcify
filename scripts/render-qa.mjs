import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve("docs/qa/preview");
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (pathname === "/_favicon/") {
      const pageURL = new URL(req.url, "http://localhost").searchParams.get(
        "pageUrl",
      );
      if (pageURL === "https://example.test/cached-hit") {
        res.setHeader("Content-Type", "image/png");
        res.end(await readFile(path.join(root, "site-icons/github.png")));
        return;
      }
      res.statusCode = 404;
      res.end();
      return;
    }
    const file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep)) throw new Error("Invalid path");
    const body = await readFile(file);
    const ext = path.extname(file);
    res.setHeader(
      "Content-Type",
      {
        ".js": "text/javascript",
        ".html": "text/html",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }[ext] ?? "application/octet-stream",
    );
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const executablePath =
  process.env.ARCIFY_CHROME_BIN ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
const errors = [];
const requests = [];
let checkCount = 0;
let renderedPerformance;
const check = (condition, label) => {
  assert.ok(condition, label);
  checkCount++;
  results.push(label);
};
try {
  for (const pageName of ["sidebar", "palette"]) {
    const context = await browser.newContext({
      viewport: {
        width: pageName === "sidebar" ? 360 : 600,
        height: pageName === "sidebar" ? 680 : 390,
      },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (new URL(r.url()).origin !== origin) requests.push(r.url());
    });
    await page.goto(origin + "/" + pageName + ".html");
    await page.waitForSelector(pageName === "sidebar" ? ".tile" : ".result");
    if (pageName === "palette") await page.locator("#query").fill("design");
    const surface = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await surface();
    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await surface();
    check(light !== dark, pageName + ": system appearance changes live");
    await page.evaluate(() => window.fixture.setPrefs({ theme: "light" }));
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    check(
      (await surface()) === light,
      pageName + ": explicit light overrides dark system",
    );
    await page.evaluate(() => window.fixture.setPrefs({ theme: "dark" }));
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await page.emulateMedia({ colorScheme: "light" });
    check(
      (await surface()) === dark,
      pageName + ": explicit dark overrides light system",
    );
    await page.evaluate(() => window.fixture.setPrefs({ theme: "system" }));
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "system",
    );
    check(
      (await surface()) === light,
      pageName + ": returning to system follows current appearance",
    );
    const images = await page
      .locator(".site-icon img")
      .evaluateAll((imgs) =>
        imgs.every((img) => img.complete && img.naturalWidth > 0),
      );
    check(
      images && (await page.locator(".site-icon img").count()) > 0,
      pageName + ": packaged website icons decoded",
    );
    for (const mode of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: mode });
      await page.screenshot({
        animations: "disabled",
        path: `docs/qa/arcify-${pageName}-${mode}.png`,
      });
    }
    if (pageName === "sidebar") {
      await page
        .getByRole("button", { name: "Downloads", exact: true })
        .click();
      await page.getByText("Brand guidelines.pdf", { exact: true }).waitFor();
      check(
        await page.getByText("File missing", { exact: false }).isVisible(),
        "downloads: missing file state is explicit",
      );
      check(
        (await page.getByRole("progressbar").count()) === 1,
        "downloads: active progress is accessible",
      );
      for (const mode of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: mode });
        await page.screenshot({
          animations: "disabled",
          path: `docs/qa/arcify-downloads-${mode}.png`,
        });
      }
      await page.getByRole("button", { name: "Tabs", exact: true }).click();
      const tileImage = page.locator(".tile .site-icon img").first();
      check(
        await tileImage.evaluate((img) => {
          const a = img.getBoundingClientRect(),
            b = img.parentElement.getBoundingClientRect();
          return a.width <= b.width && a.height <= b.height;
        }),
        "favourite image stays inside its icon box",
      );
      await page.locator(".tile").first().click({ button: "right" });
      await page
        .getByRole("button", { name: "Customize appearance…", exact: true })
        .click();
      await page
        .getByLabel("Display name", { exact: true })
        .fill("My workspace");
      await page.getByLabel("Icon replacement", { exact: true }).fill("🌿");
      await page.screenshot({
        animations: "disabled",
        path: "docs/qa/arcify-appearance-editor.png",
      });
      check(
        await page
          .getByRole("button", { name: "Reset to original", exact: true })
          .isVisible(),
        "appearance editor offers explicit reset",
      );
      for (const [width, height] of [
        [128, 32],
        [32, 128],
        [64, 64],
      ]) {
        const data = await page.evaluate(
          ([w, h]) => {
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#9875b5";
            ctx.fillRect(0, 0, w, h);
            return c.toDataURL("image/png").split(",")[1];
          },
          [width, height],
        );
        await page.locator('input[type="file"]').setInputFiles({
          name: "synthetic.png",
          mimeType: "image/png",
          buffer: Buffer.from(data, "base64"),
        });
        await page.waitForFunction(
          () => document.querySelector(".appearance-preview img")?.complete,
        );
        check(
          await page.locator(".appearance-preview img").evaluate((img) => {
            const a = img.getBoundingClientRect(),
              b = img.parentElement.getBoundingClientRect();
            return (
              a.width <= b.width && a.height <= b.height && img.naturalWidth > 0
            );
          }),
          "appearance: contained raster " + width + "x" + height,
        );
      }
      await page.getByRole("button", { name: "Cancel", exact: true }).click();

      await page.evaluate(() =>
        window.fixture.bookmarkEvents.onCreated.emit("cached", {
          id: "cached",
          parentId: "1",
          title: "Cached icon fixture",
          url: "https://example.test/cached-hit",
          index: 6,
          syncing: false,
        }),
      );
      await page.waitForFunction(() => {
        const img = document.querySelector(
          '[data-key="bm-cached"] .cached img',
        );
        return img && img.complete && img.naturalWidth > 0;
      });
      check(
        (await page.locator('[data-key="bm-cached"] .cached img').count()) ===
          1,
        "sidebar: extension-local cache-hit fixture loads",
      );
      check(
        (await page.locator(".tile .packaged").count()) === 4,
        "sidebar: cache-load failure falls back to packaged favourites",
      );
      check(
        (await page.locator(".site-icon.monogram").count()) > 0,
        "sidebar: unavailable cache and package fall back to local monogram",
      );
      check(
        (await page.locator(".tile").count()) === 4,
        "sidebar: four favourites at normal width",
      );
      await page.setViewportSize({ width: 280, height: 680 });
      check(
        (await page
          .locator(".favourites")
          .evaluate(
            (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
          )) === 3,
        "sidebar: narrow layout uses three favourite columns",
      );
      await page.evaluate(() => window.fixture.setPrefs({ expanded: [] }));
      await page.waitForSelector(".contextual");
      check(
        (await page.locator(".contextual").count()) === 1,
        "sidebar: collapsed ancestor exposes one active contextual row",
      );
      await page.evaluate(() => {
        for (let i = 0; i < 5000; i++)
          window.fixture.bookmarkEvents.onCreated.emit("load-" + i, {
            id: "load-" + i,
            parentId: "1",
            title: "Synthetic saved link " + i,
            url: "https://example.test/" + i,
            index: i + 6,
            syncing: false,
          });
      });
      await page.waitForSelector(".pager");
      check(
        (await page.locator(".scroll .row").count()) <= 160,
        "sidebar: 5000-bookmark fixture keeps DOM rows bounded",
      );
      await page
        .getByRole("navigation", { name: "Saved pages" })
        .getByRole("button", { name: "Next" })
        .click();
      check(
        (
          await page
            .getByRole("navigation", { name: "Saved pages" })
            .innerText()
        ).includes("81–160"),
        "sidebar: pagination reaches later bookmarks",
      );
      await page.evaluate(() =>
        window.fixture.bookmarkEvents.onChanged.emit("load-80", {
          title: "<img src=x onerror=alert(1)>",
        }),
      );
      await page.waitForFunction(() =>
        document.body.textContent.includes("<img src=x onerror=alert(1)>"),
      );
      check(
        (await page.locator('img[src="x"]').count()) === 0,
        "sidebar: malicious-looking title stays text",
      );
    } else {
      await page.locator("#query").fill("Brand guidelines");
      check(
        await page.getByText("Reveal file", { exact: true }).isVisible(),
        "palette: completed download offers reveal semantics",
      );
      await page.screenshot({
        animations: "disabled",
        path: "docs/qa/arcify-downloads-palette.png",
      });
      await page.locator("#query").fill(">");
      check(
        await page
          .locator(".result-action")
          .evaluateAll((nodes) =>
            nodes.every((n) => n.textContent === "Run command"),
          ),
        "palette: actions-only labels",
      );
      await page.locator("#query").fill("zzzz-no-local-match");
      await page.getByText("No local matches", { exact: true }).waitFor();
      check(
        (await page.locator(".result").count()) === 0,
        "palette: no-match does not invent a destination",
      );
      await page.locator("#query").fill("design");
      const before = await page.evaluate(() => window.fixture.requests.length);
      await page
        .locator("#query")
        .dispatchEvent("keydown", { key: "Enter", isComposing: true });
      check(
        (await page.evaluate(() => window.fixture.requests.length)) === before,
        "palette: IME Enter does not execute",
      );
      await page.locator("#query").fill(">save");
      await page.locator("#query").press("Enter");
      await page.waitForSelector("dialog[open]");
      check(
        (await page.getByRole("combobox").count()) > 0,
        "palette: save command opens destination picker",
      );
      await page.keyboard.press("Escape");
      check(
        (await page.locator("dialog[open]").count()) === 0,
        "palette: Escape dismisses nested picker",
      );
      check(
        await page.locator("#query").isVisible(),
        "palette: nested Escape preserves palette host",
      );
    }

    if (pageName === "palette") {
      await page.evaluate(() => {
        for (let i = 0; i < 5000; i++)
          window.fixture.bookmarkEvents.onCreated.emit("perf-" + i, {
            id: "perf-" + i,
            parentId: "1",
            title: "Synthetic project " + i,
            url: "https://example.test/perf/" + i,
            index: i + 6,
            syncing: false,
          });
        for (let i = 0; i < 500; i++) {
          const tab = {
            id: 1000 + i,
            windowId: 1,
            index: 5 + i,
            title: "Synthetic tab " + i,
            url: "https://example.test/tab/" + i,
            active: false,
          };
          window.fixture.tabs.push(tab);
          window.fixture.tabEvents.onCreated.emit(tab);
        }
      });
      await page.locator("#query").fill("@synthetic");
      await page.waitForFunction(
        () => document.querySelectorAll(".result").length === 80,
      );
      renderedPerformance = await page.evaluate(async () => {
        const q = document.querySelector("#query");
        const queries = [
          "synthetic",
          "#project",
          "@tab",
          "project 4999",
          "zzzz nowhere",
        ];
        const times = [];
        for (let i = 0; i < 100; i++) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const start = performance.now();
          q.value = queries[i % queries.length];
          q.dispatchEvent(new Event("input"));
          void document.querySelector("#results").offsetHeight;
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        return {
          samples: 100,
          bookmarks: 5000,
          tabs: 500,
          p95Ms: times[94],
          maxMs: times[99],
          scope:
            "Synthetic headless input dispatch through synchronous results DOM and forced layout; excludes native popup host and screen presentation.",
        };
      });
      check(
        renderedPerformance.p95Ms < 50,
        "palette: synthetic 5000-bookmark/500-tab input-to-layout p95 under 50 ms",
      );
    }
    await context.close();
  }
  const settings = await browser.newPage();
  await settings.goto(origin + "/options.html");
  await settings.locator("select").nth(1).waitFor();
  await settings.evaluate(() =>
    window.fixture.setPrefs({ expanded: ["design"], savedCollapsed: true }),
  );
  await settings.locator("select").nth(1).selectOption("dark");
  const currentPreferences = await settings.evaluate(
    async () => (await chrome.storage.local.get("preferences")).preferences,
  );
  check(
    currentPreferences.theme === "dark" &&
      currentPreferences.expanded.includes("design") &&
      currentPreferences.savedCollapsed,
    "settings: theme write preserves newer sidebar preferences",
  );
  await settings.close();
  check(errors.length === 0, "rendered pages: no uncaught errors");
  check(
    requests.length === 0,
    "synthetic page trace: no non-local requests (not extension worker traffic evidence)",
  );
  await mkdir("docs/qa", { recursive: true });
  await writeFile(
    "docs/qa/render-results.json",
    JSON.stringify(
      {
        scope:
          "Headless installed Chrome, synthetic Chrome API adapter; not native extension acceptance.",
        chrome: browser.version(),
        renderedPerformance,
        checks: checkCount,
        passed: results,
        errors,
        nonLocalRequests: requests,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      { checks: checkCount, errors, nonLocalRequests: requests },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  server.close();
}
