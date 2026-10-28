# Security

This is an unreleased development preview. Do not use private production browsing data for initial testing.

The manifest has exactly tabs, bookmarks, storage and sidePanel. There are no host permissions, content scripts, external messaging handlers, web-accessible resources, remote code or runtime dependencies. Incognito is disabled. All URL creation/reset operations pass through src/navigation.ts. External titles render via textContent. CSP is restrictive and retained in the packaged build.

Report vulnerabilities privately to the repository owner through GitHub's available private reporting mechanism; if unavailable, open a minimal issue requesting contact without disclosing sensitive details or exploit data. Never include real bookmarks, credentials, tokens, URLs from private systems, or private screenshots.

Tests and source/build audits reduce risk; they do not replace runtime inspection, native API verification, or a security audit. No network interception permission is added to Ox for testing. Inspect the extension pages and service worker via Chrome's own DevTools in a disposable profile.
