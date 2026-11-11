# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.12.1] - 2026-11-11

### Changed

- The side panel reopens after 100 ms by default instead of 500 ms; the pause setting is no longer marked experimental

## [1.12.0] - 2026-11-11

### Added

- Alt+Y closes the side panel
- Setting *Side panel shortcut closes an open panel* restores Alt+A as a toggle
- Arrow Up on the first tab moves into the search field
- Setting *Pause before the side panel reopens* (experimental): how long Alt+A keeps an open panel closed before it opens again

### Changed

- Alt+A on an open side panel puts keyboard focus back into it instead of closing it, so the arrow keys work again after a tab took focus. It does so by closing the panel and opening it again after a short pause; opened too early, the new panel does not always get the focus. The oldest supported browser version is 141, the first with `sidePanel.close`
- Arrow Down in the search field moves into the list onto the first match; the arrows walk the matches from there. Enter in the list clears an active search, like Enter in the search field
- New toolbar icon from the logo

### Fixed

- The side panel does not try to reconnect to the service worker after the extension was reloaded, which logged an error

## [1.11.0] - 2026-11-11

### Added

- Home/End jump to the first/last tab; `/` focuses the search, where Arrow Up/Down walk the matches and Enter opens one
- The active tab is shown in bold
- Unit tests for the order logic and browser tests in Playwright's bundled Chromium, run in CI

### Changed

- Side panel: Arrow Up/Down move the cursor without activating the tab, Enter activates it. Activating a tab moves keyboard focus from the side panel into the page, which broke arrow navigation after the first step. The popup window keeps activating on every arrow key
- More compact layout: the settings button sits beside the search field instead of in a header row, tab rows are denser

### Fixed

- Tabs opened while no panel or popup was open joined the list in the browser's tab strip order instead of the order they were opened in; the service worker now tracks new and closed tabs into the list, and tabs missing from it join sorted by opening order
- A tab opened from a grouped tab joins that group also while no panel is open
- Arrow keys during a search walked over tabs the search hides
- Escape in the popup's search field closed the popup instead of clearing the search
- Restoring a session from quick search could overwrite changes made to the list since quick search opened

## [1.10.0] - 2026-02-08

### Added

- Quick search popup (Alt+S) — command-palette-style fuzzy search across tabs and sessions
- Fuse.js fuzzy matching with weighted fields (name, title, URL)
- Arrow keys navigate results, Enter activates, Escape/blur closes

### Changed

- Click on tab activates without stealing window focus (Enter focuses window)

## [1.9.0] - 2026-02-08

### Added

- Popup window mode (Alt+Q) with size persistence and toggle behavior
- Shift+Arrow range selection for multi-select
- W key to close focused/selected tabs
- S/T keys to switch between Tabs and Sessions views
- Enter key to activate focused tab or restore session
- Session keyboard navigation with arrow keys
- Session context menu (rename, change color, toggle autosave)
- Auto-save on group creation setting
- Popup close-on-refocus setting

### Changed

- Simplified shortcuts: Alt+A (panel), Alt+Q (popup) replace Alt+Shift combinations
- Removed global navigate-up/down/focus-search commands (in-panel keyboard nav replaces them)

### Fixed

- Multi-instance race conditions during session restore

## [1.8.0] - 2025-12-15

### Added

- Search bar with real-time filtering across tab titles, URLs, and custom names
- Session search across name and tab titles
- Match count display during search

## [1.7.1] - 2025-12-15

### Added

- Sort direction toggle for sessions (ascending/descending)

## [1.7.0] - 2025-12-15

### Added

- Session sorting by modified date, created date, or name

## [1.6.1] - 2025-12-15

### Fixed

- Default autosave checkbox not updating after backup restore

## [1.6.0] - 2025-12-15

### Added

- Multi-window support (tabs from all normal browser windows)

## [1.5.0] - 2025-12-15

### Changed

- Refined tab query to exclude PWAs, apps, and popups

## [1.4.0] - 2025-12-14

### Added

- Auto-save feature for saved groups (tracks changes automatically)
- Autosave triggers on URL change (navigation within tab)

### Fixed

- Race condition in tab removal causing empty groups to persist
- Group close leaving empty group (copy tabs array fix)

## [1.3.0] - 2025-12-14

### Added

- Backup and restore functionality (export/import JSON)
- Auto-grouping for child tabs opened from grouped tabs
- Saved sessions to persist and restore tab groups

### Fixed

- Duplicate tabs when restoring sessions
- Import confirm dialog being auto-dismissed

## [1.2.0] - 2025-12-14

### Added

- Tab groups with multi-select, drag support, and color coding
- Keyboard navigation with arrow keys and space for rename
- Tab renaming via right-click context menu

## [1.1.0] - 2025-12-14

### Added

- Keyboard shortcut to toggle side panel

## [1.0.0] - 2025-12-14

### Added

- Initial implementation: side panel showing tabs in custom order
- Drag-and-drop reordering with SortableJS
- Independent from Chrome's tab bar ordering
