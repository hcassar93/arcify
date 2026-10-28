# Acceptance matrix

Status on 2026-10-28: **1 pass, 0 observed native failures, 23 incomplete/blocked**. A passing synthetic test is supporting evidence, not a native acceptance pass. A23 is the static source/build gate only. Native installation was not attempted in the production profile. No installed-extension screenshot exists.

| ID | Status | Evidence / remaining verification |
| --- | --- | --- |
| A01 | Blocked | Mock worker startup makes no tab/bookmark mutations; manifest audit passes. Fresh real install and startup network trace pending. |
| A02 | Blocked | Suggested declarations and actual-bindings UI implemented; physical open/close shortcut delivery untested. |
| A03 | Blocked | Input autofocus and dismissal implemented; content focus preservation requires native popup/panel test. |
| A04 | Incomplete | Resolver and worker concurrent-click tests pass; associated reuse and redirected reuse exercised synthetically. Real clicks pending. |
| A05 | Incomplete | Worker test confirms exactly one deliberate additional tab; real Chrome pending. |
| A06 | Incomplete | Pruning retains bookmarks and removes invalid associations; real close/reopen pending. |
| A07 | Incomplete | Worker test preserves redirect until explicit reset; native navigation pending. |
| A08 | Incomplete | Deterministic favourite/tree ownership and extra live duplicate test passes; real presentation pending. |
| A09 | Incomplete | Persistence/active-child code and preview nesting inspected. Collapsed active-child real UI pending. |
| A10 | Incomplete | Event refresh, missing-ID pruning and managed-write guards implemented. External/managed Chrome behavior pending. |
| A11 | Incomplete | Cycle guard unit tests pass; shared before/after/inside placement and keyboard earlier/later/menu moves implemented and unit tested. Real drag/keyboard verification pending. |
| A12 | Incomplete | Worker routes select/close/mute/pin/reload/duplicate by ID. Native commands and pinned reorder pending. |
| A13 | Blocked | Owning-window focus is implemented; real multi-window focus untested. |
| A14 | Incomplete | Ranking/prefixes/dedup/no-match/bounds tested; palette preview inspected. Physical modifiers and IME pending. |
| A15 | Blocked | Fullscreen state preservation implemented; native fullscreen/palette focus unavailable for QA. |
| A16 | Blocked | Website/video fullscreen not tested; no injected overlays implemented. |
| A17 | Blocked | Top-level listeners, ports and session state implemented. Worker suspension/rapid panel toggle untested. |
| A18 | Blocked | Startup clears session identities; exact URL reconstruction logic tested. Full native restart not tested. |
| A19 | Incomplete | Light/dark and narrow synthetic rendering checked; native 200%/keyboard/reduced-motion regression pending. |
| A20 | Blocked | No runtime clients/assets; offline listing/switching in real Chrome not tested. |
| A21 | Blocked | Source/build client/resource scans and CSP pass. No extension-page or service-worker runtime traffic trace captured. |
| A22 | Incomplete | Unsafe schemes/credentials rejected; textContent-only rendering audit passes. Malicious-title rendered native test pending. |
| A23 | Pass | Source and built manifest exactly tabs/bookmarks/storage/sidePanel/favicon, incognito disabled, no hosts/content scripts/remote resources. npm run audit:build passes. |
| A24 | Incomplete | Search computation p95 in qa/benchmark.json meets 50 ms. DOM update/typing/scrolling p95 in installed Chrome not measured. |

## Native completion procedure

Use a new disposable profile, load `dist` through chrome://extensions, and record the exact installed manifest and `commands.getAll()` bindings. Seed only example.test bookmark/tab fixtures via normal Chrome UI or a separately reviewed test helper outside the production manifest. Record a full-frame screenshot for every required screenshot scenario in the implementation brief.

Run all A01–A24 scenarios, then reload the final build and repeat the full visual pass and regression. For A21 inspect DevTools Network for popup, sidebar, options and worker during startup, idle, query typing, folder expansion, theme changes and tab switching. Distinguish user-requested site traffic. For A15/A16 separately test browser-window fullscreen and website fullscreen. For A17 terminate the worker through Chrome's own tools and rapidly toggle; for A18 fully quit only the disposable Chrome process and restart that profile.

Do not change the user's production profile, disable security policy, add testing permissions, or use headless results as a substitute for these native gates.
