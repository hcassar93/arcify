# Product update — 2026-10-28

The owner's later request supersedes the original brief's Ox name and original-brand-only direction: rename to **arcify**, use the actual Arc logo (owner states permission was checked), improve light/dark appearance and browser/system inheritance, feature website favicons, and substantially polish both surfaces.

The original IMPLEMENTATION-BRIEF.md remains intact as historical source. Application source remains MIT; third-party branding is separately attributed in THIRD_PARTY_ASSETS.md with no affiliation or independent licence-verification claim.

System theme follows the browser's CSS `prefers-color-scheme` signal live. Light and Dark are explicit persistent overrides. Chrome custom-theme palette values are not exposed by the four allowed APIs and are not claimed.

Chrome's documented `_favicon` mechanism requires a new `favicon` permission (https://developer.chrome.com/docs/extensions/how-to/ui/favicons). The existing tabs permission may supersede a warning but does not remove the documented permission requirement. arcify therefore retains exactly tabs, bookmarks, storage and sidePanel: it packages selected public website icons and uses local monograms/emoji for others. It never loads remote favIconUrl values. Genuine cached-favicon coverage would require a separately approved permission-contract change.

Superseding approval: on 2026-10-28 the user approved the specific favicon permission addition. The manifest now includes favicon, with no host permissions. Later requested local names/images for tabs and folders are implemented with session-only tab identities, bookmark-ID durable overrides, safe local raster normalization, explicit reset, and separate native bookmark rename. Downloads is the next authorized milestone.
