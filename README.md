# Independent Tabs

[![CI](https://github.com/frederikb96/independent-tabs/actions/workflows/ci.yaml/badge.svg)](https://github.com/frederikb96/independent-tabs/actions/workflows/ci.yaml)
[![Release](https://img.shields.io/github/v/release/frederikb96/independent-tabs)](https://github.com/frederikb96/independent-tabs/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Chrome side panel that displays your tabs in a **custom order, independent from Chrome's tab bar**.

## Why?

Extensions like "Most Recent Used Tab Stack" constantly reorder Chrome's native tab bar for MRU switching. This extension gives you a stable second view where tabs stay exactly where **you** put them.

**Key design:** We intentionally ignore `chrome.tabs.onMoved` events — Chrome's reordering never affects your custom order.

## Install

- Open `chrome://extensions/`
- Enable **Developer mode** (top right)
- Click **Load unpacked** → select this folder
- Click the extension icon to open the side panel

Or download the latest `.zip` from [Releases](https://github.com/frederikb96/independent-tabs/releases), extract, and load unpacked.

## Keyboard Shortcuts

**Global (work from any Chrome window):**

| Shortcut | Action |
|----------|--------|
| **Alt+A** | Toggle side panel |
| **Alt+Q** | Open popup window (or bring to front) |
| **Alt+S** | Open quick search (fuzzy tab/session switcher) |

Customize at `chrome://extensions/shortcuts`.

**Tabs view (when panel/popup focused):**

| Shortcut | Action |
|----------|--------|
| **Arrow Up/Down** | Navigate tabs (activates without stealing focus) |
| **Enter** | Focus the browser window of current tab |
| **Shift+Arrow Up/Down** | Extend selection (contiguous range) |
| **W** | Close focused tab (or all selected) |
| **Space** | Rename tab (single) or create group (multi-select) |
| **S** | Switch to Sessions view |
| **Escape** | Clear search / close popup window |

**Sessions view:**

| Shortcut | Action |
|----------|--------|
| **Arrow Up/Down** | Navigate sessions |
| **Enter** | Open/restore highlighted session |
| **T** | Switch to Tabs view |

**Quick search (Alt+S popup):**

| Shortcut | Action |
|----------|--------|
| **Type** | Fuzzy search across tabs and sessions |
| **Arrow Up/Down** | Navigate results |
| **Enter** | Activate selection and close |
| **Escape / blur** | Close |

## Features

**Quick Search**
- Alt+S opens a command-palette-style popup with fuzzy matching
- Searches tab names, titles, URLs, and session names
- Default view shows all tabs in your custom order
- Auto-closes on blur for fast workflow

**Tabs**
- Click to activate (stays in panel), Enter to focus browser window
- Drag to reorder, × to close
- Right-click → Rename tab (shown in *italic*)
- Multi-select: Ctrl+click (toggle) or Shift+click (range)

**Groups**
- Right-click → Create group (or group selected tabs)
- Drag tabs into/out of groups
- Right-click group header: rename, change color, save session, ungroup, close all
- Child tabs auto-join parent's group

**Sessions**
- Right-click group → Save session (or enable auto-save)
- Switch to Sessions view (footer toggle or **S** key)
- Click to restore, × to delete
- Right-click session: rename, change color, toggle auto-save
- Sort by modified date, created date, or name

**Popup Window**
- Alt+Q opens the full UI in a separate popup window
- Remembers window size between sessions
- Escape to close

**Settings (Options page)**
- New tab position: top or bottom
- Default auto-save for new sessions
- Auto-save on group creation
- Popup close-on-refocus toggle
- Export/Import JSON backup of all data

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
