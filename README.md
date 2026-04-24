# Tabs Cleaner

A small, privacy-respecting WebExtension for Chromium-based browsers (Brave, Chrome, Edge, …) that gives you a live snapshot of your open tabs and lets you clean up duplicates in one click.

No network, no storage, no background worker: everything is computed on demand from `chrome.tabs.query({})`.

## Features

**Popup** (toolbar icon)

- Median idle time and the 5 most idle tabs (click a title to jump)
- Duplicates list with one-click deduplication per URL (keeps the most recently accessed)
- Counts for windows, tabs — Pinned and Audible are clickable (jump to the first matching)

**Dashboard** (`tabs.html`, opened from the popup)

- Per-URL close (trash icon), per-domain "Close all" (multi-URL domains only), and a bulk **Clean up duplicates**
- Domain order is stable across refreshes — closing tabs never reshuffles the list under your cursor
- Undo toast after every destructive action, re-opens closed tabs in their original windows
- All tabs grouped by domain → URL, with favicon per domain
- Live refresh when tabs change elsewhere in the browser
- Live filter on URL **or** title (case-insensitive, debounced)
- Keyboard shortcuts: <kbd>/</kbd> focuses the filter, <kbd>Esc</kbd> clears it
- Collapse / expand per domain, or all at once

## Install

**From the Chrome Web Store** (recommended)

[Install Tabs Cleaner](https://chromewebstore.google.com/detail/pjapglfkgpnkdmpfngalhbhplhleflfo) — works in Chrome, Brave, Edge, and other Chromium-based browsers.

**From source** (for development)

1. Clone this repository or [download the latest release](https://github.com/davlgd/tabs-cleaner/releases)
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`)
3. Enable **Developer mode**
4. **Load unpacked** → select the `src/` directory

## Permissions

Only `tabs`. No `host_permissions`, content script, storage, network request, nor background service worker.

## Development

```sh
npm install
npm test           # vitest — pure helpers in common.js
npm run lint       # eslint
npm run format     # prettier --write
```

Tests cover the pure logic in `common.js` (`normalizeUrl`, `extractDomain`, `formatDuration`, `groupTabs`). UI is tested manually by reloading the extension in `chrome://extensions`.

## Project layout

```
tabs-cleaner/
├── src/
│   ├── manifest.json         # MV3, permissions: ["tabs"]
│   ├── common.css            # shared styles
│   ├── common.js             # shared helpers + pure logic (tested)
│   ├── popup.html / popup.js # toolbar popup
│   ├── tabs.html  / tabs.js  # full-page dashboard
│   └── icons/                # 16 / 32 / 128 PNG
└── tests/                    # vitest
```

## Known limits

- `lastAccessed` (requires Chromium 121+) reflects _last user activation_, not tab creation time.
- When many tabs change in the same ms, a render may briefly show stale counts (next refresh corrects it).

## Credits

<a href="https://www.flaticon.com/free-icons/neat" title="neat icons">Neat icons created by Freepik - Flaticon</a>

## License

[Apache License 2.0](LICENSE) — Copyright 2026 davlgd.
