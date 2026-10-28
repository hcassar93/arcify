# Privacy

arcify has no account, backend, telemetry, analytics, remote assets, remote suggestions, or extension-owned cloud sync. It reads tab titles/URLs and the native bookmark tree for local display and search. It does not read page DOM or browsing history. Search queries are not stored or transmitted.

The `tabs` permission exposes metadata and may be described by Chrome as reading browsing history. `bookmarks` allows both reading and writing; Chrome has no read-only bookmarks permission. arcify writes native bookmarks only in response to explicit save/edit/move/delete actions. Installation makes no bookmark changes.

Preferences (root, favourites, icons, expansion, theme) use `chrome.storage.local`. Live associations, MRU tab IDs, panel state and preceding fullscreen states use `chrome.storage.session`. No raw tab IDs are stored as durable identities and `storage.sync` is not used. Chrome itself may sync native bookmarks under the user's existing settings.

All extension code/assets are packaged, with `connect-src 'none'` and no runtime network clients. This does not prove mathematical non-exfiltration: user-requested navigation communicates with the selected website. arcify validates HTTP(S) destinations and rejects credentials and unsafe schemes. It never appends browsing context to a destination. Existing unsupported tabs may be selected by tab ID.

Resetting preferences or uninstalling does not undo native bookmark changes previously confirmed by the user. No enterprise certification is claimed. Native runtime network inspection is still pending; see docs/QA.md.

The user-approved favicon permission reads Chrome's extension-local favicon endpoint. Remote favIconUrl values and external favicon services are never loaded. Generic cache misses are possible. Local appearance images are explicitly selected raster files, resized and re-encoded to PNG; no file content is uploaded. Bookmark overrides are local preferences; tab overrides are session-only and cleared on close/restart.

Downloads uses the explicitly approved downloads permission. The sidebar and palette show at most 50 recent records, with filenames, status and progress held in memory only. No download contents, full paths or source URLs are stored or transmitted. Reveal is user initiated and does not execute the file; Manage opens Chrome's downloads page. No downloads.open, automatic downloads, file deletion, history erasure or external services. Updates use events plus a one-second refresh while an active transfer is present in an open UI. Chrome's existence flag can lag; Reveal re-queries the record. Official API contract: https://developer.chrome.com/docs/extensions/reference/api/downloads .
