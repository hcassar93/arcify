# Contributing

Use Node 26, `npm ci --ignore-scripts`, and `npm run check`. Run `npm run format` for readable source. Commit the lockfile and rebuilt dist. CI runs synthetic tests only; it does not certify installed Chrome behavior.

Keep the four-permission contract and explicit CSP. Do not add runtime network clients or remote assets. Centralize navigation in src/navigation.ts, use text nodes for external strings, validate storage, and keep durable preferences separate from session tab IDs.

Use a dedicated disposable Chrome profile for manual QA. Never modify production profiles or bypass administrator policy. Follow docs/ACCEPTANCE.md and document exact observations, screenshots, Chrome/OS version, commit and limitations. Headless previews are useful visual aids, not native acceptance evidence.
