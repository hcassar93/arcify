Build an open source, locally installed Chrome Manifest V3 extension that recreates the everyday feel of Arc’s macOS sidebar and command bar within Chrome’s supported extension APIs. Working name: Ox. Prioritise fast keyboard navigation, tasteful visual design, persistent favourites and bookmark folders above temporary open tabs, and a small, auditable permission footprint.

This is an implementation brief for a Codex coding agent. Build the working extension, install it unpacked in real Google Chrome, exercise it through computer use, capture and inspect screenshots, fix defects, and repeat. A static mockup, a localhost preview, or passing unit tests alone does not satisfy this brief. Do not publish to the Chrome Web Store or deploy a backend.

# 1 Product goals and scope

## Required experience

1. A persistent sidebar showing favourites first, bookmark folders and saved links second, and ordinary open tabs below a quiet divider.

2. One keyboard shortcut to toggle the sidebar and another to toggle a command palette.

3. A shared navigation model: selecting the same saved item from either surface produces the same result.

4. Immediate local search for open tabs, saved links, folders, and browser actions.

5. A polished light and dark interface inspired closely by Arc’s proportions and interaction hierarchy.

6. No accounts, sign-in, telemetry, server, AI service, or runtime remote assets.

7. A source repository that an engineer can inspect, build, and load unpacked without a paid service.

Primary target: current stable Google Chrome on macOS. Target Windows and Linux through portable APIs and platform shortcuts; explicitly report which platforms were actually tested. Set the initial minimum Chrome version to 142 to support the side-panel lifecycle events used below; raise it only for a documented dependency.

## Excluded from version one

Full Arc browser replacement, native tab-strip modification, website injection, automatic archiving, history search, cloud sync, AI features, previews of webpage contents, screenshot capture of user tabs, Peek windows, split-screen browsing, site-specific routing, arbitrary extension launching, OS keyboard automation, browser profile switching, and multi-space tab isolation.

Version one has one bookmark workspace. Space switching is deliberately deferred so the core experience is complete. Do not ship a decorative space switcher that does nothing.

# 2 Arc reference and deliberate adaptations

Use Arc’s official help pages listed at the end as the behavioural reference. Inspect their screenshots and demonstrations where accessible. If Arc is already available in the test environment, inspect it without signing into an account or altering the user’s data. Record platform and version. Do not assume an old release note describes every current behaviour.

| Arc pattern | Ox requirement |
| --- | --- |
| Favourites are compact icons above the saved section and available across Spaces | Compact favourites grid at the top; local ordered references to saved bookmarks |
| Saved or pinned tabs live above temporary tabs | Bookmark-backed saved rows remain after their associated live tab closes |
| Folders collect saved tabs and support nesting | Native Chrome bookmark tree with collapsible rows and clear indentation |
| Temporary tabs appear beneath a separator | Current-window tabs not represented by a saved row appear under Open tabs |
| Command bar unifies destinations and actions | One local searchable list with explicit Switch, Open and Run semantics |
| Arc can reset a saved tab to its pinned URL | Explicit Reset to saved URL action; never reset merely by selecting the row |
| Arc can reveal an active child beneath a collapsed folder | A single contextual active-child row appears beneath the collapsed ancestor |
| Arc’s command bar is centred over browser content | Chrome toolbar popup is the required baseline; its interior should match the visual intent |
| Arc can reveal a hidden sidebar at the window edge | Keyboard and click toggles only; no global edge-hover imitation |

Chrome controls the side-panel frame, header, width constraints and placement. Users select left or right in Chrome settings. Do not present a nonfunctional in-extension placement toggle.

Do not claim to hide Chrome’s native tabs, switch native vertical/horizontal tabs, or show an overlay above every webpage. Normal browser fullscreen and website/video fullscreen are distinct. Treat the exact fullscreen appearance and keyboard behaviour as an empirical release gate on the tested OS.

# 3 Permissions and security contract

Required manifest permissions: tabs, bookmarks, storage, sidePanel. Commands and action are manifest declarations, not extra permissions.

Do not request host_permissions, optional host permissions, activeTab, scripting, history, cookies, debugger, management, nativeMessaging, clipboardRead, webRequest or downloads. No content scripts, external message handlers, remote code, sandboxed remote pages or web-accessible resources are needed. Disable incognito support for version one.

The tabs permission exposes tab metadata such as titles and URLs; it does not grant DOM access. Chrome may describe this as reading browsing history. The bookmarks permission grants reading and writing together; Chrome has no read-only bookmarks permission. State both facts clearly in README and PRIVACY.

All searching and indexing happen locally. Preferences use chrome.storage.local; transient tab associations use chrome.storage.session. Never use storage.sync. Chrome itself may sync native bookmarks under the user’s existing browser settings; distinguish that from extension-owned cloud sync.

Use an explicit CSP based on: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'. Validate the final policy against the production build. Avoid frameworks or styling mechanisms that require loosening it.

Use packaged vector icons, local monograms and user-selected emoji. Do not load tab favIconUrl values directly, call remote favicon services, or fetch previews. Cached browser favicons can be a separately reviewed future enhancement; they are not required.

No fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, remote images/fonts, link prefetch, DNS prefetch or runtime remote dependencies. Build-time dependency installation is separate from runtime behaviour. Minimise dependencies, pin versions, commit the lockfile and document licences.

Never promise that permissions mathematically prevent exfiltration: opening a URL can itself transmit information. Route every navigation through one audited module. Navigate only after a user action, to the selected saved destination or explicitly entered URL. Do not append tab titles, URLs, identifiers or other context to destinations. Search input is never sent anywhere automatically.

Render bookmark titles, URLs and tab titles as text. Reject javascript:, data:, file:, browser-extension schemes and arbitrary custom protocols as destinations. Permit http: and https:, plus a small explicit internal-action allowlist such as Chrome New Tab and extension shortcut settings. Reject embedded URL credentials. Do not execute bookmarklets. Existing unsupported tabs can still be selected by tab ID.

Privacy copy must describe implemented behaviour, not assert enterprise certification. Enterprise installation may require an administrator to allow unpacked extensions; do not bypass policy.

# 4 Sidebar structure and visual design

Use Arc for macOS as the visual reference, with original branding and independently authored assets. Match its restrained density, hierarchy, rounded selection states and quiet controls; do not reproduce its logo or proprietary assets.

Order from top to bottom:

1. A compact utility row: Search or jump trigger, sidebar collapse button, and a small overflow menu.

2. Favourites grid.

3. Saved section title, optional collapse chevron, then bookmark folders and saved links.

4. A subtle separator.

5. A New tab row with plus icon and the palette shortcut.

6. Open tabs list.

7. A compact footer containing settings and fullscreen controls.

Default to one continuous scroll area beneath the utility row, with a sticky footer. Do not create three independently scrolling panes. Large bookmark collections must not make open tabs unreachable. Provide Collapse saved and Jump to open tabs actions.

Design starting values, to be refined through screenshots:

- System font stack; 13px body, 12px secondary text, 18px palette input.

- 32px sidebar rows; 8px outer inset; 8px row radius; 16px icons.

- Favourites: four columns at typical width, adapting to three at narrow widths; approximately 44–52px tile height and 6px gaps.

- Palette: preferred 600px width within Chrome’s popup limits, 52px input area, 44px result rows and at most eight visible results before scrolling.

- Light theme: warm off-white surface with muted lavender-grey hover and selection.

- Dark theme: charcoal surface with slightly lighter hover and selection.

- One restrained accent; no gradients, large cards, dashboard metrics, hero copy, noisy badges or oversized headings.

- Suggested tokens: light surface #F3F1F5, text #242229, selected #E1DDE9; dark surface #25242A, text #F3F1F6, selected #403B4C. Adjust as necessary for contrast.

- Motion 100–160ms for hover and disclosure; honour prefers-reduced-motion.

- Visible keyboard focus, accessible text contrast and icon buttons with at least a 24px hit area.

Use opacity changes for secondary controls. Close and overflow controls appear on hover and keyboard focus without shifting the title. Active rows have a persistent filled background; focus and hover must remain distinguishable. No fake browser chrome inside the panel.

# 5 Bookmark source and favourites

On first opening, show a small in-panel setup state with a bookmark-root picker and an Open sidebar button if needed. Default the root selection to the real Bookmarks Bar identified through API data, not a translated hard-coded title or assumed ID. Permit another writable or read-only bookmark folder. Do not create, move, rename or delete bookmarks during installation.

Show all direct children of the chosen root, preserving native order and nesting. A change of root changes the saved section only. Palette search covers all accessible bookmarks and shows their folder paths.

Favourites are an ordered local array of bookmark IDs, maximum 12 in version one. Adding an existing bookmark to favourites does not move it in Chrome. Suppress that bookmark’s ordinary saved row in this extension while it is a favourite; its real bookmark remains in place. Removing a favourite restores its ordinary location if within the chosen root.

For a live tab with no bookmark, Add to favourites opens a small save sheet with title, URL and destination folder. Create the bookmark only on Save, then add its ID to favourites. If 12 favourites already exist, explain the limit without silently replacing one.

Favourite tiles show a packaged icon, monogram or selected emoji, plus active/open state. Tooltip and accessible name contain title and destination. The context menu includes Open, Open new tab, Reset to saved URL when associated, Remove from favourites, Edit bookmark, and Delete bookmark.

Removing a favourite is local and non-destructive. Deleting a bookmark is explicitly labelled and confirmed; it is a separate action. No ambiguous cross icon that could mean either closing a tab or deleting a saved item.

Persist folder expansion by bookmark ID. React to external bookmark creation, updates, movement and removal. Missing IDs are pruned safely. Managed or unmodifiable nodes remain browsable with write actions disabled and explained.

# 6 Saved item and live tab behaviour

Use a shared resolver for both sidebar and palette. Each saved item can be associated with a live tab in each normal Chrome window. Capture the originating browser window before acting; do not accidentally treat an extension helper window as the destination.

Normal activation:

1. If this bookmark already has a valid associated tab in the current window, activate it.

2. Otherwise find an exact canonical URL match in the current window, preferring the active match, then most recently activated, then native tab order.

3. Associate and activate that match, or create one new active tab and associate it.

4. Do not automatically steal focus from another window when activating a bookmark. Palette open-tab results can explicitly switch across windows.

URL comparison uses parsed browser URLs and normal host/scheme canonicalisation. Preserve path, query and fragment meaning. Never merge all pages from the same domain, strip query parameters or treat HTTP and HTTPS as equivalent.

Once associated, a saved item continues to point at its live tab after navigation, including a redirect. Its saved title and URL remain unchanged. Show the current destination in the tooltip when it differs. Reset to saved URL explicitly navigates that live tab back to the bookmark URL.

Closing the live tab clears its association while retaining the bookmark and favourite. Unassociating or removing the saved item leaves its live tab open and returns it to Open tabs. Closing an associated tab must never delete its bookmark.

For duplicate bookmarks with the same URL, choose a deterministic presentation owner: favourite first, then the first visible bookmark in tree order. Other duplicate bookmarks remain usable and visibly indicate an open match, but do not create duplicate Open tabs rows for the same tab. A deliberately opened duplicate live tab appears under Open tabs.

Store live associations by window ID, bookmark ID and tab ID in session storage. Validate all IDs against current browser state after worker restart. After a full browser restart, discard stale associations and reconstruct only from exact URL matches; do not pretend to identify a navigated saved tab across restarts without evidence.

Listen for tab activation, creation, updates, removal, movement, replacement and window attachment changes. UI updates should settle within 200ms under ordinary load without losing keyboard focus.

# 7 Folders and open tabs

Folder click toggles expansion. Left Arrow collapses an expanded folder or moves to its parent; Right Arrow expands it or focuses its first child. Keep children indented consistently. A collapsed folder containing the active associated tab shows one contextual child row; it is not a second bookmark or a second live tab.

Saved rows show title, local icon and a subtle open indicator. Hover/focus can expose a Close live tab button only when a live association exists. Context menus distinguish Close live tab from Delete bookmark.

Support explicit Create folder, Rename, Edit bookmark URL, Move and Delete bookmark actions. Deleting a non-empty folder requires a confirmation with descendant count. Respect native special-root and managed-bookmark restrictions. Show API failures and preserve the previous UI state.

Drag and drop:

- Reorder favourite tiles locally.

- Move bookmarks within/between writable folders through Chrome’s bookmark API; a drop clearly indicates before, after or inside.

- Drop an open tab into a saved folder to create a bookmark without closing the tab.

- Drop an open tab onto favourites to invoke the save flow.

- Reorder ordinary open tabs with tabs.move, respecting Chrome’s pinned-tab constraints.

- Reject folder cycles and invalid targets. Provide equivalent Move menu actions for keyboard users.

- Do not delete bookmarks by dragging them into Open tabs; use explicit removal actions.

Open tabs shows current-window normal tabs that are not represented by a saved item. Preserve Chrome tab order, not MRU order. This section includes native Chrome pinned tabs that have no saved association; distinguish them with a small pin icon.

Click selects a tab. Close closes exactly that tab and moves keyboard focus to the nearest surviving row. Context menu offers Close, Duplicate, Reload, Mute or Unmute, Pin or Unpin in Chrome, Save to folder, Add to favourites and Show in palette. No bulk destructive commands in version one.

After closing the active tab, follow Chrome’s resulting active tab. Do not open a replacement website. Closing the final tab may close the browser window according to Chrome behaviour.

No automatic archiving, automatic closing or background loading of saved bookmarks.

# 8 Command palette host and lifecycle

Required baseline: a real extension action popup, backed by a local palette page. Use the same design system and action registry as the sidebar. A toolbar popup cannot be arbitrarily centred over browser content; do not misrepresent it as a true Arc overlay.

Before building the full UI, prove that keyboard opening, dismissal, tab focus restoration and fullscreen operation work in real Chrome. Use action.openPopup where appropriate and preserve user activation for side-panel actions.

Do not enable openPanelOnActionClick while the same toolbar action is assigned to the palette. Toolbar click opens the palette. The separate sidebar command and the palette/sidebar controls manage the panel.

Open with an empty focused input and a compact set of recent live tabs plus useful commands. Every explicit reopen starts a new query. Escape dismisses a nested picker first, then the palette. Clicking outside follows native popup dismissal. Successful navigation closes the palette and focuses the destination. A failed action leaves the palette open with a concise error.

The palette shortcut must close an already open palette when Chrome delivers the shortcut; implement and test command routing and an in-popup handler as needed, preventing double toggles. Do not claim shortcut-toggle support until physically tested.

A separate centred popup window is an optional experimental host only after the baseline is complete. It must use extension-owned content, no page injection, no new permissions, and pass fullscreen, multi-monitor, focus and duplicate-window tests. Native window borders cannot be removed through ordinary extension APIs. Do not substitute it silently or turn it into a required dependency.

If neither host can meet a required OS behaviour, record the exact limitation and leave that acceptance item blocked. Never weaken permissions to make an injected overlay.

# 9 Palette search and action semantics

Search sources: accessible open-tab titles and URLs, bookmark titles and URLs, bookmark folder paths, and the local action registry. No browsing history, page contents, remote suggestions, automatic web search or AI ranking.

Results contain a local icon, primary title, concise secondary destination or folder path, and an explicit trailing action label such as Switch tab, Open bookmark, Reveal folder or Run command. Open-tab results from another window display Other window.

Ranking must be deterministic and unit tested. Use case-insensitive Unicode-normalised matching; prefer exact title, title prefix, word-prefix, substring, then fuzzy subsequence. Use current-window and recent activation as tie-breakers, not as reasons to bury substantially better matches. If a matching bookmark is already open, promote its switch result and avoid redundant identical rows; allow explicit Open new tab.

Empty query: up to five recent live tabs excluding the active tab, then New tab, Toggle sidebar and Toggle fullscreen. Keep the combined list short. Prefix > enters actions-only mode. Prefix @ enters tabs-only mode. Prefix # enters bookmarks-only mode. Explain these in the help screen, not as permanent clutter.

URL entry: a valid HTTP(S) URL creates an explicit Open URL result. Recognisable domain input gets https:// added. Support localhost and explicit ports. Preserve query and fragment. Do not interpret arbitrary phrases as URLs. With no matches, show No local matches and a small hint; do not transmit the phrase.

Web search is out of version one. A future explicit opt-in search action would need separate disclosure because it sends the entered query to a search provider.

Keyboard:

- Up/Down changes result selection; selection scrolls into view.

- Enter executes the selected action.

- Command+Enter on macOS or Control+Enter elsewhere opens a selected bookmark/URL in a new active tab, even if already open. On a live-tab result it duplicates that tab into the originating window.

- Tab/Shift+Tab traverses real controls; do not break accessibility to imitate Arc’s historic Tab-to-actions behaviour.

- Escape exits a destination picker, then dismisses.

- During IME composition, Enter must not execute a result.

- Pointer hover and keyboard selection must not fight; mouse movement changes selection only on intentional movement.

Result changes should appear within 50ms at the 95th percentile on a documented test machine with 500 tabs and 5,000 bookmarks. Keep DOM rendering bounded. Build search indexes locally and update incrementally; do not rebuild the entire bookmark tree for every keystroke.

# 10 Commands and shortcuts

All actions use one typed registry with availability, label, aliases, execution and error handling. Sidebar menus and palette commands call the same code.

| Command | Required behaviour |
| --- | --- |
| New tab | Open a normal Chrome new tab in the originating window |
| Toggle sidebar | Toggle this extension’s side panel in that window |
| Show or Hide sidebar | Explicit idempotent variants |
| Toggle fullscreen | Enter browser-window fullscreen or restore the preceding normal/maximised state |
| Switch tab | Activate selected tab and focus its owning window |
| Open bookmark | Apply the shared saved-item resolver |
| Open bookmark in new tab | Deliberately create a fresh tab |
| Close current tab | Close the originating content tab, never the extension popup |
| Reload current tab | Reload that content tab |
| Mute or Unmute current tab | Change muted state |
| Pin or Unpin current tab | Change Chrome native pin state; distinct from saving |
| Save current tab to folder | Open searchable destination picker and confirm save |
| Add to favourites | Use the bookmark/favourite flow |
| Remove from favourites | Remove local favourite reference only |
| Reset to saved URL | Available only for an associated saved item |
| Reveal folder | Open sidebar and expand the target folder |
| Collapse saved | Collapse the saved section |
| Jump to open tabs | Open sidebar, scroll to the section and move keyboard focus |
| Settings | Open local extension options |
| Keyboard shortcuts | Open Chrome’s extension shortcut configuration |

Default suggested shortcuts:

- Toggle palette: Command+Shift+K on macOS; Control+Shift+K on Windows/Linux.

- Toggle sidebar: Command+Shift+Y on macOS; Control+Shift+Y on Windows/Linux.

These are proposals, not guaranteed bindings. Inspect commands.getAll after installation and show the actual assigned shortcuts. If unavailable, show Not assigned with a configuration link. Never claim to override Command+T, Command+L or reserved browser shortcuts. Do not bind system-wide commands.

Sidebar header search and New tab row open the palette; an explicit New blank tab menu action opens Chrome’s new tab immediately. Sidebar collapse closes only this extension’s panel.

Track side-panel opened/closed events per window and reconcile with mounted-panel lifecycle. Register service-worker listeners at top level. Avoid an awaited chain before sidePanel.open that consumes the user gesture. Test worker suspension and rapid repeated toggles; never rely solely on a service-worker global boolean.

# 11 Settings and persistence

Keep settings short:

- Bookmark root picker.

- Theme: System, Light, Dark.

- Favourite icon overrides and ordering.

- Actual shortcut assignments plus Chrome configuration link.

- Help for choosing left/right in Chrome settings.

- Privacy and source information.

- Reset extension preferences with confirmation, explicitly preserving native bookmarks.

No login prompt, email collection, welcome marketing page or setup network request. Setup must be dismissible and usable without writing any bookmark.

Persistent schema: schemaVersion, bookmarkRootId, ordered favourite bookmark IDs, icon overrides, expanded folder IDs, saved-section collapsed state and theme. Session schema: per-window saved-tab associations, live-tab MRU IDs, panel lifecycle state and preceding fullscreen window states. Store only what is necessary; no persistent history of visited pages or search queries.

Validate storage on read, use migrations and recover malformed optional settings with safe defaults. Do not persist raw browser tab IDs as durable identities. Handle external bookmark deletion and root deletion with a clear Choose folder recovery state.

Uninstall removes extension storage but does not undo user-confirmed native bookmark edits. Document that distinction.

# 12 Technical architecture and repository

Use TypeScript, a small UI stack and a reproducible local build. React with Vite is acceptable if the output is fully packaged and CSP-compatible; vanilla TypeScript is also acceptable. Choose one and keep dependencies minimal.

Separate modules:

- Browser adapter wrapping Chrome APIs.

- Tab and bookmark stores driven by browser events.

- Saved-item resolver and session associations.

- Typed command registry and central navigation validator.

- Local search index and ranking.

- Shared UI primitives, design tokens and accessible menus.

- Sidebar page, palette popup, options page and service worker.

The browser APIs are the source of truth. Use snapshots plus events and reconciliation; never let optimistic UI state silently diverge. Catch asynchronous Chrome errors, including tabs disappearing between search and execution.

Required repository deliverables: source, manifest, packaged icons, build config, lockfile, tests, README, PRIVACY.md, SECURITY.md, MIT licence, CONTRIBUTING.md, a short architecture document and QA evidence. Produce a dist directory loadable as an unpacked extension. No store publication, extension auto-updater or remote configuration.

README must include exact install/build/test commands, tested Node version, Load unpacked steps, extension reload steps, permission explanations, shortcut setup, fullscreen limitations and the differences from Arc. Building may require internet access for dependencies; the installed extension must work offline.

Use no real personal bookmarks, titles or URLs in committed fixtures, logs or screenshots. Do not add developer tooling permissions to the distributed manifest.

# 13 Required implementation and computer use workflow

## Phase one feasibility gate

Build a minimal real extension first. In a dedicated disposable Chrome profile, install its actual unpacked build using Chrome’s extension UI or supported browser launch mechanisms. Verify side panel, action popup, both shortcuts, Chrome internal-page operation, browser fullscreen and return to normal. Check the panel on both sides. Capture screenshots showing the entire browser frame.

Use installed Google Chrome as the acceptance target. Chromium or an automated headless renderer can supplement tests but does not replace final Chrome verification. If the environment cannot install unpacked extensions or cannot control browser chrome, report that blocker precisely; do not describe a web preview as an installed extension.

## Phase two functional implementation

Implement stores, resolver, sidebar, palette, mutations and settings. Seed only the disposable profile with synthetic fixtures. Implement test helpers outside the production permission boundary.

## Phase three visual iteration

Use computer use to operate the installed extension and take screenshots. Open and inspect every screenshot at useful resolution. Compare against accessible official Arc screenshots or an available Arc installation, while respecting the Chrome-host differences documented above.

For each discovered issue, record the expected behaviour, observed behaviour, fix and verification. Reload the real unpacked extension after changes and retest. Repeat until no release-blocking defects remain. Perform at least two complete visual review passes, including a regression pass after the final changes; do not stop because the first screenshot looks plausible.

Screenshots must demonstrate the shipped extension inside real Chrome, including browser frame, rather than only a component screenshot. Keep sensitive production profiles out of the process.

## Required screenshot set

1. Light sidebar with populated favourites, nested folders and temporary tabs.

2. Dark sidebar with equivalent content.

3. Active saved tab beneath a collapsed folder.

4. Palette showing a mix of tab, bookmark and action results.

5. Palette actions-only mode and folder destination picker.

6. Narrow panel with long titles and nested folders.

7. Left and right panel placement.

8. Normal browser fullscreen with sidebar visible.

9. Palette invoked while in browser fullscreen.

10. Empty bookmarks, no search results and a recoverable error.

11. Keyboard focus and context menu states.

Use actual screenshots as evidence. Do not manufacture mock screenshots or claim unobserved behaviour. If reference images are unavailable, say so in the QA report and assess against the specified design tokens and interactions.

## Required evidence report

Include OS, Chrome version, screen size, build commit/hash, installed manifest permissions, test results, screenshot paths, issues fixed, unresolved limitations and exact reproduction instructions. Explain any visual discrepancy caused by Chrome’s own frame. A mock API test pass is not evidence for fullscreen, shortcut delivery or popup focus.

# 14 Acceptance tests and definition of done

| ID | Scenario and pass condition |
| --- | --- |
| A01 | Fresh install loads without manifest errors; no network request or bookmark mutation occurs |
| A02 | Both shortcuts open and close their surfaces through real keyboard input; actual bindings are shown |
| A03 | Opening and closing the panel preserves selected content tab and query focus behaves as specified |
| A04 | Favourite and bookmark activation reuse an associated tab; repeated clicks do not create duplicates |
| A05 | Deliberate Open new tab creates exactly one new tab |
| A06 | Closing an associated tab preserves the saved item; reopening creates one replacement |
| A07 | Navigating an associated tab preserves the association; Reset restores saved URL only when invoked |
| A08 | Two bookmarks sharing a URL and two live tabs sharing a URL follow deterministic ownership rules |
| A09 | Nested folder expansion persists; active child is visible beneath a collapsed ancestor |
| A10 | External bookmark edits update both surfaces; deleted and managed nodes are handled safely |
| A11 | Drag/drop and equivalent keyboard menus reorder correctly without unintended bookmark loss |
| A12 | Open-tab select, close, mute, pin, reload and duplicate affect the intended tab |
| A13 | Palette switches to a tab in another window and focuses that window |
| A14 | Search ranking, modifiers, result labels, no-match states and IME handling match the spec |
| A15 | Browser fullscreen, restored window state and palette focus are verified in real Chrome |
| A16 | Website/video fullscreen is tested and its different behaviour documented without forced overlays |
| A17 | Service-worker suspension and restart do not break panel toggling or associations |
| A18 | Browser restart clears stale session identities and rebuilds valid state without ghost tabs |
| A19 | Light/dark, narrow width, long labels, 200 percent zoom, keyboard navigation and reduced motion remain usable |
| A20 | Offline searching, listing, switching and commands work; navigation failures belong to destination availability |
| A21 | Runtime network inspection shows no extension-originated remote resources or background traffic |
| A22 | Malicious-looking titles render as text; forbidden URL schemes and credentials are rejected |
| A23 | Extension source and built output contain only approved permissions and locally packaged resources |
| A24 | Measured search performance meets the stated fixture target; no severe scrolling or typing stalls |

Use focused automated tests for navigation validation, URL matching, associations, duplicate resolution, ranking, state migrations and bookmark mutation error recovery. Run integration tests against the actual extension where practical. Test rapid activation, tabs closing during a search, window movement, worker restarts, denied operations and unavailable shortcuts.

Network verification must inspect both extension pages and service worker. Test idle, startup, query typing, folder expansion, theme changes and tab switching. Separate expected traffic from user-requested website navigation from extension background traffic. Do not present a short trace as proof of universal impossibility; combine it with source/build review and the explicit CSP.

Completion requires a reproducible build, functional acceptance results, real Chrome computer-use evidence, inspected screenshots, regression checks and a candid limitations section. Do not mark untested platforms or blocked scenarios as passed. If blocked by the environment, deliver the working code and exact remaining verification steps, with the affected acceptance items clearly incomplete.

# 15 Source references

Arc behaviour references:

- [Favourites](https://resources.arc.net/hc/en-us/articles/19230755904151-Favorites-Top-Tabs-Across-Every-Space)

- [Pinned tabs](https://resources.arc.net/hc/en-us/articles/19231060187159-Pinned-Tabs-Tabs-you-want-to-stick-around)

- [Folders](https://resources.arc.net/hc/en-us/articles/19228419623447-Folders-Stash-Similar-Tabs-Together)

- [Arc 2022 release notes](https://resources.arc.net/hc/en-us/articles/20498417809815-Arc-for-macOS-2022-Release-Notes), including command actions and folder navigation

- [Arc 2024 to 2026 release notes](https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes), including command-bar refinements and collapsed-folder behaviour

Chrome implementation references:

- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

- [Action popup API](https://developer.chrome.com/docs/extensions/reference/api/action)

- [Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands)

- [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)

- [Bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)

- [Windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)

- [Permissions and warnings](https://developer.chrome.com/docs/extensions/reference/permissions-list)

- [Content Security Policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

- [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

The Arc concepts above are the reference; the exact dimensions, shortcuts, resolver algorithm, offline policy and version-one scope are Ox product decisions. Reference material may move or become unavailable. The coding agent must verify current API availability and inspect available visual references before implementation, without treating historical Arc features as promises of Chrome capability.
