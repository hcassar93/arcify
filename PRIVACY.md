# Privacy

Ox has no account, backend, telemetry, analytics, remote assets, remote suggestions, or extension-owned cloud sync. It reads tab titles/URLs and the native bookmark tree for local display and search. It does not read page DOM or browsing history. Search queries are not stored or transmitted.

The `tabs` permission exposes metadata and may be described by Chrome as reading browsing history. `bookmarks` allows both reading and writing; Chrome has no read-only bookmarks permission. Ox writes native bookmarks only in response to explicit save/edit/move/delete actions. Installation makes no bookmark changes.

Preferences (root, favourites, icons, expansion, theme) use `chrome.storage.local`. Live associations, MRU tab IDs, panel state and preceding fullscreen states use `chrome.storage.session`. No raw tab IDs are stored as durable identities and `storage.sync` is not used. Chrome itself may sync native bookmarks under the user's existing settings.

All extension code/assets are packaged, with `connect-src 'none'` and no runtime network clients. This does not prove mathematical non-exfiltration: user-requested navigation communicates with the selected website. Ox validates HTTP(S) destinations and rejects credentials and unsafe schemes. It never appends browsing context to a destination. Existing unsupported tabs may be selected by tab ID.

Resetting preferences or uninstalling does not undo native bookmark changes previously confirmed by the user. No enterprise certification is claimed. Native runtime network inspection is still pending; see docs/QA.md.
