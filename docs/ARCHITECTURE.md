# Architecture

Vanilla TypeScript with esbuild produces four packaged modules: sidebar, palette, options and the MV3 worker. No production dependencies are installed. Native browser APIs remain authoritative.

- `browser.ts`: snapshots and event-driven refresh with a 45 ms debounce; preferences and request transport.
- `model.ts`: schema migration, session validation/pruning, bookmark hierarchy and move guards.
- `navigation.ts`: the sole URL-writing boundary; parsed HTTP(S), no credentials; two explicit internal actions.
- `resolver.ts`: per-window saved-item resolution, deterministic duplicate ownership, in-flight activation coalescing.
- `search.ts`: locally pre-normalised index, ranked matching, prefixes, ties and bounded results.
- `commands.ts`: typed command metadata, availability and common execution entry point.
- `worker.ts`: serialized mutation handling, top-level event listeners, session associations and panel lifecycle.
- `ui.ts`: text-based elements, error handling, accessible dialogs and menus, shared command routing.
- `sidebar.ts`, `palette.ts`, `options.ts`: surfaces with shared tokens in public/style.css.

Browser events refresh snapshots; search does not rebuild the bookmark tree for each keystroke. A future refinement should incrementally update stores on individual browser events and virtualize very large saved trees. Worker operations reconcile API failures and do not optimistically modify native bookmark state. Session associations are validated against tab window IDs; full startup clears session identities. Exact URL matching reconstructs presentation on the next snapshot. Navigated associations cannot be reconstructed after a full browser restart without evidence.

The popup uses `_execute_action` and a local keyboard dismissal handler. Its physical shortcut delivery remains unverified. Panel lifecycle combines mounted ports, Chrome opened/closed events, and persisted session state. Rapid command delivery, suspension and native focus require actual Chrome testing.

The preview harness in scripts/preview.mjs supplies synthetic Chrome APIs to the actual bundled UI. It is generated outside dist, never included in the extension, and is not an installed-extension integration test.
