# How it works

## Storage

Everything is in `chrome.storage.local`:

- `items`: the order, a list of tab IDs and group objects (`group`, `name`, `color`, `tabs`, and for saved groups `linkedSessionId` and `autoSave`).
- `customNames`: tab ID to custom name.
- `savedSessions`: session ID to its name, color, auto-save flag, timestamps and tabs.
- `settings` and `popupSize`.

The popup and quick-search window IDs and the session-restore marker live in `chrome.storage.session`, which the browser clears on restart.

## Tab tracking

The service worker is woken for every tab event, so it does the tracking and the open views only render:

- A created tab is added at the configured end of the list, or to the group of the tab that opened it. Only tabs of normal windows are added.
- Closed tabs leave the list in one write, together with their custom names; a group left empty is removed.
- Tab moves are never listened to. That is the point of the extension.
- On install and on browser start the list is reconciled with the open tabs: closed ones leave, unknown ones join sorted by tab ID. IDs grow with every new tab within a browser session, so sorting by ID recovers the opening order even when another extension has rearranged the tab strip.
- Storage writes of the worker run through one promise chain, so events that arrive together do not overwrite each other.

A session restore creates its tabs and the group itself. It sets a marker for the worker, which skips tabs created within ten seconds of it.

The pure operations on the list are in `tab-items.js`, shared by the worker and the pages and covered by unit tests.
