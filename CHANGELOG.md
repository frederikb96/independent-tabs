# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.10.0] - 2025-02-08

### Added

- Quick search popup (Alt+S) — command-palette-style fuzzy search across tabs and sessions
- Fuse.js fuzzy matching with weighted fields (name, title, URL)
- Arrow keys navigate results, Enter activates, Escape/blur closes

### Changed

- Click on tab activates without stealing window focus (Enter focuses window)

## [1.9.0] - 2025-02-08

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

## [1.8.0] - 2025-02-07

### Added

- Search bar with real-time filtering across tab titles, URLs, and custom names
- Session search across name and tab titles
- Match count display during search

## [1.7.1] - 2025-02-07

### Added

- Sort direction toggle for sessions (ascending/descending)

## [1.7.0] - 2025-02-07

### Added

- Session sorting by modified date, created date, or name

## [1.6.1] - 2025-02-06

### Fixed

- Default autosave checkbox not updating after backup restore

## [1.6.0] - 2025-02-06

### Added

- Multi-window support (tabs from all normal browser windows)

## [1.5.0] - 2025-01-15

### Changed

- Refined tab query to exclude PWAs, apps, and popups

## [1.4.0] - 2025-01-10

### Added

- Auto-save feature for saved groups (tracks changes automatically)
- Autosave triggers on URL change (navigation within tab)

### Fixed

- Race condition in tab removal causing empty groups to persist
- Group close leaving empty group (copy tabs array fix)

## [1.3.0] - 2024-12-14

### Added

- Backup and restore functionality (export/import JSON)
- Auto-grouping for child tabs opened from grouped tabs
- Saved sessions to persist and restore tab groups

### Fixed

- Duplicate tabs when restoring sessions
- Import confirm dialog being auto-dismissed

## [1.2.0] - 2024-12-13

### Added

- Tab groups with multi-select, drag support, and color coding
- Keyboard navigation with arrow keys and space for rename
- Tab renaming via right-click context menu

## [1.1.0] - 2024-12-12

### Added

- Keyboard shortcut to toggle side panel

## [1.0.0] - 2024-12-12

### Added

- Initial implementation: side panel showing tabs in custom order
- Drag-and-drop reordering with SortableJS
- Independent from Chrome's tab bar ordering
