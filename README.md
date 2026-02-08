# Independent Tabs

A Chrome side panel that displays your tabs in a **custom order, independent from Chrome's tab bar**.

## Why?

Extensions like "Most Recent Used Tab Stack" constantly reorder Chrome's native tab bar for MRU switching. This extension gives you a stable second view where tabs stay exactly where **you** put them.

**Key design:** We intentionally ignore `chrome.tabs.onMoved` events—Chrome's reordering never affects your custom order.

## Install

- Open `chrome://extensions/`
- Enable **Developer mode** (top right)
- Click **Load unpacked** → select this folder
- Click the extension icon to open the side panel

## Keyboard Shortcuts

**Global (work from any Chrome window):**

| Shortcut | Action |
|----------|--------|
| **Alt+A** | Toggle side panel |
| **Alt+Q** | Open popup window (or bring to front) |

**Tabs view (when panel/popup focused):**

| Shortcut | Action |
|----------|--------|
| **Arrow Up/Down** | Navigate tabs |
| **Shift+Arrow Up/Down** | Extend selection (contiguous range) |
| **W** | Close focused tab (or all selected) |
| **Space** | Rename tab (single) or create group (multi-select) |
| **S** | Switch to Sessions view |
| **Escape** | Clear search / close popup window |

**Sessions view (when panel/popup focused):**

| Shortcut | Action |
|----------|--------|
| **Arrow Up/Down** | Navigate sessions |
| **Enter** | Open/restore highlighted session |
| **T** | Switch to Tabs view |

## Features

**Search**
- Real-time filtering as you type
- Searches: tab title, URL, custom name
- Sessions: searches name and tab titles within
- Escape to clear, shows match count

**Tabs**
- Click to focus, drag to reorder, × to close
- Right-click → Rename tab (shown in *italic*)
- Multi-select: Ctrl+click (toggle) or Shift+click (range)

**Groups**
- Right-click → Create group (or group selected tabs)
- Drag tabs into/out of groups
- Right-click group header: rename, change color, ungroup, close all
- Child tabs auto-join parent's group

**Sessions**
- Right-click group → Save session
- Switch to Sessions view (footer toggle)
- Click to restore, × to delete
- Enable **Auto-save** per group to track changes automatically

**Backup (Settings page)**
- Export/Import JSON backup of all data
- Preserves: tab order, groups, custom names, saved sessions

## How It Works

```
Tab opened    → added to your list (top or bottom per setting)
Tab closed    → removed from your list
Tab reordered → (ignored) your order stays the same
You drag      → your order updates, Chrome unchanged
```

Data stored in `chrome.storage.local`, separate from Chrome's tab indices.

## Requirements

Chrome 114+ (Side Panel API)

## License

MIT
