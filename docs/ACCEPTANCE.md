# Acceptance matrix

2026-10-28: **10 pass, 14 incomplete/blocked**. Passes are A02–A07, A12, A13, A16 and A23. Native observations use signed-out **Arcify QA Temporary** in running Google Chrome 155.0.8059.85. Automated results are supporting evidence, not substitutes for native checks. See [native report](NATIVE-QA.md) for steps, defects, captures and exact limitations. This is not release sign-off.

| ID | Status | Evidence / remaining verification |
| --- | --- | --- |
| A01 | Incomplete | Actual unpacked install enabled without manifest errors; fresh bookmark bar was empty before synthetic seeding. Startup mutation mock and source audit pass. Comprehensive install-time network trace missing. |
| A02 | Pass | Physical ⇧⌘K and ⇧⌘Y open/close their surfaces after install/reload; actual assignments shown in Settings. Cold suspension is separately incomplete under A17. |
| A03 | Pass | Panel preserves selected content tab; fresh popup query accepts typing; successful tab activation dismisses popup and focuses content. Nested Escape defect fixed and natively retested. |
| A04 | Pass | Repeated native favourite activation reuses associated Example home with no additional tabs. Shared resolver tests cover both surfaces. |
| A05 | Pass | Explicit favourite Open new tab added exactly one tab. |
| A06 | Pass | Closed associated tab without deleting favourite/bookmark; after closing remaining duplicate, activation created one replacement. |
| A07 | Pass | Associated live tab navigated to a changed query; association remained; explicit Reset restored saved URL. |
| A08 | Incomplete | Extra live duplicate appeared under Open tabs. Duplicate-bookmark ownership unit tests pass; two-bookmark native permutation untested. |
| A09 | Incomplete | One-level folder persistence and single collapsed active-child observed; deeper nesting and arrow-key permutations pending. |
| A10 | Incomplete | Mock events/pruning/managed guards pass. Native create/move observed; external edit/removal/managed-node matrix pending. |
| A11 | Incomplete | Native destination picker moved Design reference into Design library. Placement/cycle/order tests pass; complete native drag/drop and keyboard reorder permutations pending. |
| A12 | Pass | Native select, close, pin, mute, reload and duplicate affected synthetic intended tabs; pin/unmute labels and tab count verified. |
| A13 | Pass | Other window label observed; selection activated Example Domain and focused its owning QA window. |
| A14 | Incomplete | 37 rendered checks cover ranking/prefixes/labels/IME/no-match/picker; native query/actions/picker exercised. Physical modifier/IME matrix pending. |
| A15 | Incomplete | Browser fullscreen, visible panel, popup input and normal restoration observed. Fixed explicit originating-window focus; a second QA window retained focus on entry and restore. Native zoom/restore was exercised, but exact maximized geometry comparison remains pending. |
| A16 | Pass | Synthetic webpage and local video-element fullscreen tested. Video hid address/tab bars; popup opened with focused input, first Escape dismissed popup and second exited video fullscreen. Chrome retained its own restore infobar. |
| A17 | Incomplete | Cold toggle defect fixed: avoid clearing lifecycle state on port disconnect and preserve the synchronous open gesture. First shortcut after observed inactive worker closed the panel; six rapid toggles ended closed. Cold association retention and remaining lifecycle permutations are pending. |
| A18 | Blocked | Full process restart would close production windows because safe QA profile shares the running Chrome process. No quit attempted. Mock startup identity clearing/exact reconstruction passes. |
| A19 | Incomplete | Native light/dark, left/right, folder/menu states inspected; synthetic narrow/raster containment and live appearance pass. Full native 200%/reduced-motion/keyboard matrix pending. |
| A20 | Incomplete | Page-scoped Offline DevTools setting allowed folder interaction. Whole-profile offline listing/search/switching matrix not completed. |
| A21 | Incomplete | Worker sampled idle/search/switch trace empty; sidebar startup and folder expansion showed extension-local resources only. Complete all-surface/theme/typing traces pending. |
| A22 | Incomplete | URL/credentials rejection and malicious text rendering tests pass. Full native malicious-title/forbidden-navigation scenario pending. |
| A23 | Pass | Built/source permissions exactly tabs/bookmarks/storage/sidePanel/favicon/downloads, no hosts/content scripts; CSP/local-resource audit passes. |
| A24 | Incomplete | 5000-bookmark/500-tab search and synthetic input-to-layout p95 meet 50 ms. Native popup presentation/scroll latency not measured. |

## Additional requested features

Cached endpoint requests were observed in real Chrome; cache misses returned generic Chrome globes. A real synthetic download appeared in sidebar and palette, and Reveal selected it in Finder. Local appearance file validation, reset, cleanup, metadata stripping, quota handling, bounded Downloads metadata and missing-file guards have automated tests. Native custom-file upload and every missing-file race are not claimed passed.

## Completion constraints

No production profile changes, security-policy bypasses, extra testing permissions, downloaded-program execution, file deletion, download-history erasure or store publication. Reliable full-frame popup capture is blocked by native capture scaling; diagnostic thumbnails are not promoted to evidence. Full restart needs an independently controllable isolated Chrome process or a user-controlled restart that preserves production work. Other incomplete rows are explicitly pending tests, not invented environmental blockers.
