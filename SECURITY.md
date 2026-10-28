# Security

This is an unreleased development preview. Do not use private production browsing data for initial testing.

The manifest has exactly tabs, bookmarks, storage and sidePanel. There are no host permissions, content scripts, external messaging handlers, web-accessible resources, remote code or runtime dependencies. Incognito is disabled. All URL creation/reset operations pass through src/navigation.ts. External titles render via textContent. CSP is restrictive and retained in the packaged build.

Report vulnerabilities privately to the repository owner through GitHub's available private reporting mechanism; if unavailable, open a minimal issue requesting contact without disclosing sensitive details or exploit data. Never include real bookmarks, credentials, tokens, URLs from private systems, or private screenshots.

Tests and source/build audits reduce risk; they do not replace runtime inspection, native API verification, or a security audit. No network interception permission is added to arcify for testing. Inspect the extension pages and service worker via Chrome's own DevTools in a disposable profile.

The user-approved favicon permission reads Chrome's extension-local favicon endpoint. Remote favIconUrl values and external favicon services are never loaded. Generic cache misses are possible. Local appearance images are explicitly selected raster files, resized and re-encoded to PNG; no file content is uploaded. Bookmark overrides are local preferences; tab overrides are session-only and cleared on close/restart.

Downloads uses the explicitly approved downloads permission. The sidebar and palette show at most 50 recent records, with filenames, status and progress held in memory only. No download contents, full paths or source URLs are stored or transmitted. Reveal is user initiated and does not execute the file; Manage opens Chrome's downloads page. No downloads.open, automatic downloads, file deletion, history erasure or external services. Updates use events plus a one-second refresh while an active transfer is present in an open UI. Chrome's existence flag can lag; Reveal re-queries the record. Official API contract: https://developer.chrome.com/docs/extensions/reference/api/downloads .
