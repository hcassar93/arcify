# Installed Google Chrome evidence

2026-10-28. This is a partial native acceptance report, not a completed release sign-off.

## Environment and safe profile route

macOS 26.6.2 (25G83), Apple M1 Pro. Running Chrome **155.0.8059.85**, revision 0e66b94549a8bd85f03fbdf189b752d6e7b63c32, was read from chrome://version. The installed executable used by supplemental headless checks reports **156.0.8078.48**. These are different observations; the production process was not restarted to update it. Node 26.8.1, npm 11.19.0. Full-frame normal captures are approximately 3024×1898 physical pixels (window geometry varies); fullscreen capture 3024×1900. This is screenshot geometry, not a separately measured display specification.

The previously blocked separately launched process was replaced by the normal Chrome UI route: **Profiles → Add profile → Stay signed out → Arcify QA Temporary**. The new profile (Profile 5) was controllable in the already-running application. Only this profile had developer mode enabled and `dist` loaded through Extensions → Load unpacked. The extension ID is `oejnapnkpcgbppedjlfihnjhamcalmll`. No production tabs, bookmarks, account settings or security policies were changed. This was a normal profile creation, not a process-selector bypass.

The installed manifest contains tabs, bookmarks, storage, sidePanel, favicon and downloads, with no host permissions. Chrome displayed arcify 0.1.0 enabled without a manifest-error control. The build tested contains the native Escape, raster-logo and stale-settings fixes in this report's commit. `qa/source-sha256.txt` records source/build hashes; the exact commit is the commit containing this report and is independently identified by its GitHub Actions run.

## Observed native results

- Physical Command+Shift+K opened and closed the action popup. A fresh reopen had an empty query. Command+Shift+Y opened/closed the panel, including on chrome://extensions. Settings displayed the actual ⇧⌘K / ⇧⌘Y assignments. Content selection was retained; successful tab navigation dismissed the popup and focused content.
- Saved Example home reused its associated tab on repeated activation. Explicit Open new tab added exactly one tab. Closing an associated tab preserved its bookmark/favourite; after the remaining duplicate was closed, activation created one replacement. Navigation to a different query retained the association; Reset explicitly restored the saved URL.
- Created Design library, moved Design reference into it using the destination picker, expanded/collapsed it, and observed one contextual active child beneath the collapsed folder. Expansion survived extension reload. This is one nesting level, not exhaustive deep-tree coverage.
- Select, pin, mute, duplicate, reload and close were exercised on a synthetic local-content tab. Native pin state and Unmute/Unpin menu labels reflected the changes. Duplicate added one tab; closing it followed Chrome's selected survivor.
- A second signed-out QA window was created with a synthetic URL. Palette results said Other window. Selecting Example Domain switched to the first window and focused its content. The second test window was closed afterwards.
- Left/right placement was changed through this profile's Chrome Settings → Appearance. Light and Dark overrides changed the mounted panel. Initial System followed the existing dark appearance. Arbitrary Chrome theme colors remain unsupported; live OS appearance switching was only tested synthetically.
- Browser fullscreen via native keyboard and Arcify's footer worked with the panel visible. The palette opened and accepted typing there. Restoring via the palette returned the first QA window to normal, but focus landed on the other QA window during the transition: multi-window fullscreen focus remains unresolved. Normal/maximized restoration is not fully accepted.
- A synthetic webpage's requestFullscreen() hid the address/tab bars while Chrome retained its side panel. Escape restored the page. This is website fullscreen, not a video-element test and not an injected overlay.
- A local fixture downloaded a 60-byte synthetic text file. Downloads showed Complete and Reveal. Reveal selected that exact synthetic file in Finder (accessibility verification only; no personal Finder screenshot was retained). Palette search returned the synthetic download with Reveal file semantics. No downloaded program was executed.

## Defects fixed and regression

1. Escape in a nested popup destination picker dismissed the whole popup. A capture-phase handler now consumes the nested Escape before the popup handler. Real popup regression preserved the query/palette after dismissing the picker; synthetic regression checks the host remains visible.
2. The official logo's display-p3 CSS rendered black in the PNG generator. Raster generation now uses the official SVG's sRGB fill attributes and square padding. The original SVG remains unchanged. Reloaded Chrome displayed a full-color toolbar logo.
3. An already-open options page could overwrite a newer sidebar expansion state when changing theme. Options now reads current preferences before writing root/theme/icons/order. Native regression collapsed a folder after opening options, changed theme, and retained the collapsed folder. A synthetic regression also verifies newer savedCollapsed/expanded fields survive.

Native visual review pass 1 inspected installation, light/dark sidebar, right placement, collapsed child, fullscreen and popup behavior; it found the Escape and logo issues. Pass 2 reloaded the build and inspected the colored logo, left placement, Downloads, menus, dark sidebar and fullscreen, then found and fixed the stale settings write. Final targeted regression reloaded again and verified sidebar shortcuts, settings preservation, and fullscreen command operation. This is **not** a complete rerun of all 24 acceptance scenarios.

## Runtime network observations

The worker's DevTools Network panel recorded no requests during the sampled idle, popup search and tab-switch sequence. A direct installed sidebar.html tab was reloaded with Network recording: seven startup entries were all chrome-extension resources (HTML, CSS, JS, SVG and three `_favicon` cache URLs). Expanding a folder added one more local `_favicon` entry. Page-scoped Offline throttling still allowed folder collapse. Throttling was restored to No throttling afterwards.

These bounded traces complement CSP and source/build review. They do not cover every popup/options startup or prove universal absence of network transmission. DevTools itself is browser tooling; user-requested example/local-site navigation is separate. Cached example icons returned Chrome's generic globe with status 200, demonstrating that a cache miss need not trigger the image-error fallback.

## Screenshots

All `qa/native/*.jpg` files are unedited native captures inspected for synthetic-only contents. No fake frame was drawn. Main deliverables: sidebar-left.jpg, sidebar-dark-regression.jpg, downloads.jpg, fullscreen-regression.jpg, folder-menu.jpg. Additional evidence: collapsed-dark.jpg, sidebar-light.jpg, website-fullscreen.jpg, page-network-offline.jpg and worker-network.jpg.

The native capture tool produced a tiny browser thumbnail over a large white canvas when the action popup was active (both screenshot and combined-state capture). Those diagnostic files are retained locally outside the repository, not presented as adequate popup screenshots. Popup behavior was observed through native accessibility and keyboard input; required full-frame popup visual evidence is still blocked by that capture defect. Existing labelled synthetic palette previews remain supplemental only.

## Remaining gates

See ACCEPTANCE.md. Full Chrome restart is blocked by the shared process: quitting would close production windows, which is outside this workflow. No quit was attempted. Cold-worker shortcut observations were inconsistent (no visible transition in two attempts before a reload; reliable toggles after reload); suspension/rapid-toggle acceptance remains incomplete, not passed. A separate test-helper installation was denied before loading and is pending specific authorization; it has not been retried. Drag/drop permutations, managed bookmarks, deep trees, native IME/modifiers, 200% zoom/reduced motion, video fullscreen, comprehensive offline/network traces and native latency remain untested or partial.

## Reproduce fixtures

Serve `qa/fixtures/native` with `python3 -m http.server 8877 --bind 127.0.0.1 --directory docs/qa/fixtures/native`. In the disposable profile visit http://127.0.0.1:8877/, explicitly download the text fixture, and use its website-fullscreen button. Create only synthetic bookmarks such as https://example.com/, https://example.org/ and https://example.com/?design=1#reference. Do not import personal data. Reload the extension after rebuilding; repeat remaining acceptance rows using the exact release commit.

## Continuation: lifecycle, fullscreen and native input

Two additional fixes were tested in the actual disposable profile. Panel toggles now initiate a context/session snapshot before a synchronous sidePanel.open call, preserving Chrome’s user gesture. Port disconnection no longer marks the panel closed: worker suspension also disconnects ports. Chrome reported SIDE_PANEL contexts with windowId -1, so persisted per-window lifecycle state is reconciled with the existence of live contexts. After Extensions showed the worker Inactive, the first physical shortcut closed the mounted panel. Six rapid shortcuts from closed ended closed after animation settled. This does not yet certify all multi-window lifecycle or association-suspension permutations.

Fullscreen updates now explicitly focus the originating window. In a second QA window at the synthetic local URL, palette fullscreen entry and restore both retained that window and its content focus. The same sequence was repeated after native window zoom. Exact before/after geometry comparison remains pending. The second QA window was then closed, leaving production windows untouched.

A locally generated silent WebM test pattern exercised video-element fullscreen. Address/tab bars disappeared, Chrome’s restore infobar remained, the palette opened with focused input, Escape dismissed it, and a second Escape restored the browser frame. See video-fullscreen.jpg; this is an unmodified inspected native capture. The source fixture is in qa/fixtures/native.

Native custom-image testing reached the folder appearance editor and macOS file picker. The verified packaged github.png path appeared in the path field, but Return and selection repeatedly returned the field to `/`; Escape also failed to dismiss the path layer reliably. No image was selected and no customization was saved. Further file-picker input stopped after bounded reconciliation; the picker remains open. This is an observed input-control barrier, not a passing image-upload test. No picker screenshot or incidental personal file listing is committed.

Automatic approval review denied loading tests/native-helper as a separate extension with tabs/bookmarks access, requiring specific authorization for that access change. It is not installed; its load has not been retried. The permission question remains pending. The helper is excluded from the production build. Manual tests remain independent; outstanding native scenarios are not relabelled as passed.
