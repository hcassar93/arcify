# QA evidence

Current status: **62 automated tests and 37 rendered checks pass; 9/24 acceptance rows pass, 15 remain incomplete/blocked.** Actual unpacked installation and native testing now succeeded. [NATIVE-QA.md](NATIVE-QA.md) supersedes historical native-blocker statements below and records real screenshots, three fixes and remaining gaps. [ACCEPTANCE.md](ACCEPTANCE.md) is the current matrix.

## Historical development record (before native profile recovery)

# QA evidence — development preview

Date: 2026-10-28. This is not a release sign-off. The full brief is preserved unchanged in IMPLEMENTATION-BRIEF.md (199 blocks, 35,696 characters).

## Environment

- macOS 26.6.2 (25G83), Apple M1 Pro, arm64.
- Installed Google Chrome 156.0.8078.48; native extension acceptance not executed.
- Node 26.8.1, npm 11.19.0.
- Arc 1.157.0 installed; accessibility hierarchy inspected read-only. Private screenshot capture was denied and not retried.
- Native display size not captured. Supplemental preview viewports: sidebar 360×760, palette 600×380, scale factor 2.
- Build/source content hash: see qa/source-sha256.txt. Final exact Git commit and CI status are available on this repository's Actions run; reproduce with `git rev-parse HEAD` and the commands below.
- Production manifest: tabs, bookmarks, storage, sidePanel, favicon, downloads; Chrome ≥142; incognito disabled.

## Results

`npm run check` runs strict TypeScript, ESLint, 62 synthetic unit/security/worker tests, reproducible build, packaged permission/resource audit and the 500-run search benchmark. The seven worker tests use a Chrome API mock and are explicitly not installed-extension integration tests. See qa/test-results.txt and qa/benchmark.json for exact output.

No runtime network inspection was possible. Static source/build checks find no network clients, remote resources, HTML injection or storage.sync. CSP disallows connections. This supports review but is not a universal network guarantee or a runtime trace.

`npm audit --omit=dev --json` reported zero production vulnerabilities (there are no runtime dependencies). Full development-dependency audit is recorded separately if run.

## Native feasibility blocker

An isolated installed-Chrome process launched with user-data-dir `/tmp/ox-chrome-qa-20261028`. The native control API, when selecting `com.google.Chrome` or `/Applications/Google Chrome.app`, repeatedly returned the existing production process/window. The Chrome Window menu exposed only that process's production window. The runtime did not expose `listWindows` for selecting a separate macOS process/window. Foreground launch of the disposable profile did not change the binding. Therefore no unpacked installation was attempted, and no production profile was altered. This is a control-targeting limitation, not proof of Chrome or enterprise policy rejecting Ox.

Smallest next step: make the disposable QA Chrome process selectable by the supported native-control interface, or have a human load `dist` in that isolated profile and supply a controllable QA window. Do not close or modify production Chrome to work around this restriction without separate authorization.

## Visual evidence

- `qa/sidebar-preview.png`: actual bundled sidebar rendered using synthetic APIs in headless installed Chrome; inspected. Shows four favourites, nested folders, active saved row, temporary tabs and footer.
- `qa/palette-preview.png`: actual bundled palette with synthetic APIs; inspected. Shows current/other-window tabs and bookmark results, local URLs and explicit labels.

Both images visibly say IMPLEMENTED UI PREVIEW and not installed-extension evidence. They contain only synthetic data. No fake browser frame was drawn. They cannot satisfy the required full-browser-frame screenshots or the two native visual QA passes.

Preview review 1 detected headless minimum-viewport clipping on the sidebar. The preview harness was constrained to 360 CSS pixels, the screenshot was recaptured, and review 2 verified all four tiles and utility/footer controls. Palette review verified focus outline, hierarchy, truncated secondary content and action labels. These are supplemental preview reviews only. Later synthetic passes cover dark theme, context menus, appearance editing and Downloads. Placement, fullscreen and full native regression remain incomplete.

## Reproduction

```sh
npm ci --ignore-scripts
npm run check
npm run preview
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/qa/preview
```

In another terminal, use the installed Chrome executable with `--headless --user-data-dir=<new-disposable-directory> --no-first-run --no-default-browser-check --disable-background-networking --hide-scrollbars --window-size=360,760 --force-device-scale-factor=2 --screenshot=<absolute-output.png> --virtual-time-budget=2000 http://127.0.0.1:8765/sidebar.html`. Use 600,380 and palette.html for the palette. This command is only a preview renderer; it does not install Ox.

## Issues fixed during local development

- Missing Chrome 142 lifecycle types: added a narrow declaration based on official docs.
- Existing exact-match activation failed to persist the association: fixed and regression tested through redirects.
- Malformed optional session data: added structural validation and bounded MRU IDs.
- CSP compatibility: folder depth moved from inline style writes to data-attribute CSS rules.
- Security textContent assertion broke after formatting: made whitespace tolerant; no runtime behavior change.
- Preview viewport clipping: fixed harness width and inspected recapture.

## References

Official Chrome API documentation was checked for sidePanel, action, commands, tabs, bookmarks, windows, permission warnings, CSP and network requests. onClosed is Chrome 142+, onOpened 141+, supporting the chosen minimum. Bookmarks Bar is identified via folderType. The supplied Arc favourites, pinned tabs and folders articles returned 404. Official 2022 and 2024–2026 release notes remain accessible; their behavioral notes were consulted. Arc's signed-in private screenshot was rejected by automatic approval review because it would capture private data, so no private pixels were captured or published.

Known incomplete scope and precise acceptance outcomes are in ACCEPTANCE.md and README.md. No Windows/Linux testing, Chrome Web Store publication, backend deployment, account grants or security-policy changes occurred.

## Continuation milestone

Incremental stores/index updates, bounded saved/open rows and keyboard move equivalents are now implemented. 62 unit/security/mock tests and 35 rendered checks pass. Rendered system/light/dark changes, narrow columns, collapsed active child, cache hit/miss fixtures, IME/no-match, destination picker, malicious text and appearance editor are covered. Latest results: qa/render-results.json and qa/benchmark.json. The current light/dark sidebar, palette and editor images are synthetic implemented-UI previews. Folder icons now have 20px optical boxes; favourite icons use a 32px flex basis with containment, fixing clipping. Two preview reviews inspected the before/after pixels; native full-frame review remains blocked as above. Run `npm run preview && node scripts/render-qa.mjs` for the supplemental rendering checks.

## Final Downloads regression

62 automated tests pass (including mock worker reveal rejection for missing files and local customization/reset); 35 synthetic rendered checks pass. Downloads light/dark, progress, missing files and palette semantics were captured and inspected. Wide/tall/square local raster images pass containment checks. No nonlocal requests or uncaught errors occurred in the synthetic page trace; this is not an extension service-worker traffic trace. The full original native acceptance count remains 1 static pass / 23 incomplete. Current code is published as a development preview, not release-certified.

Exact commands: npm run check; npm run preview; node scripts/render-qa.mjs. The committed source-sha256.txt identifies the tested source/public payload; CI verifies the final commit and reproducible dist. Current screenshots are arcify-sidebar-light/dark.png, arcify-palette-light/dark.png, arcify-appearance-editor.png and arcify-downloads-light/dark/palette.png. All contain synthetic fixtures and explicit preview labels.
