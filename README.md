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

**Basic actions:**
- **Click a tab** → focuses it in Chrome
- **Drag tabs** → reorder in your custom arrangement
- **× button** → closes the tab
- **Alt+Shift+T** → toggle side panel open/closed
- **Settings (gear icon)** → choose whether new tabs appear at top or bottom

**Keyboard navigation:**
- **Arrow Down/Up** → navigate through tabs (switches to that tab)
- **Space** → open rename prompt for current tab
- Navigation skips group headers, only tabs are navigable

**Tab renaming (right-click menu):**
- **Rename tab** → give any tab a custom name
- Custom names shown in *italic* with accent color
- Names persist until tab is closed
- **Reset to original** → restore Chrome's title

**Multi-select:**
- **Ctrl+click** → toggle individual tab selection
- **Shift+click** → select range of tabs
- Selected tabs highlighted with accent border

**Tab groups:**
- **Right-click → Create group** → create a group from one tab
- **Select multiple → Right-click → Group N tabs** → group selected tabs
- **Drag tab into group** → automatically joins the group
- **Drag tab out of group** → automatically leaves the group
- **Drag group header** → move entire group with all tabs
- **Right-click group header** → Rename, Change color, Ungroup all, Close all
- **Open link from grouped tab** → new tab auto-joins same group
- Groups have colored left borders and headers
- Empty groups are automatically removed

**Saved sessions:**
- **Right-click group header → Save session** → save group for later
- **Footer: Tabs / Sessions** → switch between views
- **Click saved session** → restore all tabs and recreate group
- **× button on session** → delete saved session
- Sessions remember: group name, color, all tab URLs, custom tab names
- Already-saved groups show "Update saved session" + "Save as new..."
- Sessions persist across browser restarts

**Backup & Restore (Settings page):**
- **Export Backup** → downloads JSON file with all your data
- **Import Backup** → restores from a backup file
- Includes: tab order, groups, custom names, saved sessions, settings
- Use before uninstalling to preserve your data

## How It Works

```
Tab opened     → added to your list (top or bottom based on setting)
Tab closed     → removed from your list
Tab reordered  → (ignored) your order stays the same
You drag tabs  → your order updates, Chrome's tab bar unchanged
```

The extension stores its own data in `chrome.storage.local`, completely separate from Chrome's internal tab indices.

## Files

```
manifest.json       Manifest V3 config (requires Chrome 114+)
service-worker.js   Extension initialization
sidepanel.html/js   UI rendering, drag-drop with SortableJS, groups
sidepanel.css       Styling with automatic dark mode support
sortable.min.js     SortableJS library for drag-drop
options.html/js     Settings page
```

## Requirements

- Chrome 114+ (Side Panel API requirement)
- Permissions: `sidePanel`, `tabs`, `storage`

## Note on Side Panel Width

Side panel minimum width (~320px) is controlled by Chrome's browser settings, not by extension APIs. This is a browser-level constraint that cannot be changed.

## License

MIT
