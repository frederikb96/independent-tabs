# Independent Tabs

A Chrome side panel extension that displays your tabs in a **custom order completely independent from Chrome's tab bar**.

## Why This Exists

Chrome's tab bar order changes when you use extensions like "Most Recent Used Tab Stack" (which reorders tabs for Ctrl+Tab MRU switching). This extension gives you a second view where tabs stay in the order **you** arranged them, unaffected by any automatic reordering.

**Key difference from other tab managers:** We intentionally ignore `chrome.tabs.onMoved` events. When Chrome's tab bar reorders, our side panel keeps your custom order intact.

## Install

- Open `chrome://extensions/`
- Enable **Developer mode** (top right)
- Click **Load unpacked**
- Select this folder
- Click the extension icon → side panel opens

## Usage

- **Click a tab** → focuses it in Chrome
- **Drag tabs** → reorder in your custom arrangement
- **× button** → closes the tab
- **Settings (gear icon)** → choose whether new tabs appear at top or bottom

Your custom order persists across browser restarts.

## How It Works

```
Tab opened     → added to your list (top or bottom based on setting)
Tab closed     → removed from your list
Tab reordered  → (ignored) your order stays the same
You drag tabs  → your order updates, Chrome's tab bar unchanged
```

The extension stores its own `tabOrder` array in `chrome.storage.local`, completely separate from Chrome's internal tab indices.

## Files

```
manifest.json       Manifest V3 config (requires Chrome 114+)
service-worker.js   Handles tab create/remove events → updates storage
sidepanel.html/js   UI rendering, drag-drop, tab actions
sidepanel.css       Styling with automatic dark mode support
options.html/js     Settings page
```

## Requirements

- Chrome 114+ (Side Panel API requirement)
- Permissions: `sidePanel`, `tabs`, `storage`

## License

MIT
