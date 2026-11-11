// Independent Tabs - Service Worker
// Handles tab events and maintains the custom tab order in storage

importScripts('tab-items.js');

// Tab tracking lives here rather than in the pages: the worker is woken for every tab event,
// while a side panel or popup only sees the tabs created while it is open.

// The one source of each setting's default; an install or update writes the missing ones into
// storage, so every reader finds a value there.
const DEFAULT_SETTINGS = {
  newTabPosition: 'bottom',
  panelShortcutToggles: false,
  panelReopenPause: 100,  // ms the side panel stays closed before the shortcut opens it again
};

// One storage read-modify-write at a time; events arriving together would otherwise each read
// the same order and overwrite each other's additions.
let queue = Promise.resolve();
function serialized(task) {
  queue = queue.then(task).catch(err => console.error('Independent Tabs:', err));
  return queue;
}

async function updateItems(change) {
  const { items = [], settings = DEFAULT_SETTINGS } = await chrome.storage.local.get(['items', 'settings']);
  const next = await change(items, settings);
  if (!sameItems(items, next)) await chrome.storage.local.set({ items: next });
}

// Only tabs of normal browser windows belong in the list (not PWAs, apps or popups).
async function normalTabs() {
  return chrome.tabs.query({ windowType: 'normal' });
}

async function reconcileWithOpenTabs() {
  const tabs = await normalTabs();
  await updateItems((items, settings) => reconcile(items, tabs, settings.newTabPosition));
}

chrome.runtime.onInstalled.addListener(() => serialized(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const { settings, items, tabOrder } = await chrome.storage.local.get(['settings', 'items', 'tabOrder']);
  await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  if (Array.isArray(tabOrder)) {
    // Order format of the first releases: a flat list of tab IDs
    if (!items || items.length === 0) await chrome.storage.local.set({ items: tabOrder });
    await chrome.storage.local.remove('tabOrder');
  }
  await reconcileWithOpenTabs();
}));

// Tab IDs do not survive a browser restart; the restored tabs join in opening order.
chrome.runtime.onStartup.addListener(() => serialized(reconcileWithOpenTabs));

chrome.tabs.onCreated.addListener((created) => serialized(async () => {
  // The event's tab can lack openerTabId (tabs.create with an opener); the tab itself has it
  let tab, win;
  try {
    tab = await chrome.tabs.get(created.id);
    win = await chrome.windows.get(tab.windowId);
  } catch {
    return;  // tab or window already gone
  }
  if (win.type !== 'normal') return;

  // A session restore adds the tabs it creates as one group itself
  const { restoreInProgress } = await chrome.storage.session.get('restoreInProgress');
  if (restoreInProgress && Date.now() - restoreInProgress < 10000) return;

  await updateItems((items, settings) => insertTab(items, tab.id, {
    position: settings.newTabPosition,
    openerTabId: tab.openerTabId
  }));
}));

// Closing several tabs at once fires one event per tab; they leave the list in one write.
let removedTabIds = [];
chrome.tabs.onRemoved.addListener((tabId) => {
  removedTabIds.push(tabId);
  if (removedTabIds.length > 1) return;  // a flush is already queued
  serialized(async () => {
    const ids = removedTabIds;
    removedTabIds = [];
    await updateItems(items => removeTabs(items, ids));

    const { customNames = {} } = await chrome.storage.local.get('customNames');
    const kept = Object.fromEntries(Object.entries(customNames).filter(([id]) => !ids.includes(Number(id))));
    if (Object.keys(kept).length !== Object.keys(customNames).length) {
      await chrome.storage.local.set({ customNames: kept });
    }
  });
});

// NOTE: We intentionally DO NOT listen to chrome.tabs.onMoved
// This is the key feature - our order is independent from Chrome's tab bar order!

// Popup window management
// Window ID tracked in chrome.storage.session (clears on browser close).
// Note: Window positioning not possible on Wayland (chrome.windows.get returns 0,0).

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { popupWindowId, quicksearchWindowId } = await chrome.storage.session.get(['popupWindowId', 'quicksearchWindowId']);
  if (windowId === popupWindowId) {
    await chrome.storage.session.remove('popupWindowId');
  }
  if (windowId === quicksearchWindowId) {
    await chrome.storage.session.remove('quicksearchWindowId');
  }
});

// Side panel shortcuts. A shortcut's user gesture, which sidePanel.open needs, lasts only until the
// handler's first await, so this listener decides from state it already holds: the windows whose
// panel is open and the settings, both kept current below.
const openPanels = new Map();  // windowId -> connected panel pages
let cachedSettings = DEFAULT_SETTINGS;
chrome.storage.local.get('settings').then((stored) => {
  cachedSettings = { ...DEFAULT_SETTINGS, ...stored.settings };
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) cachedSettings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
});

// Each open side panel holds a port and pings over it, which keeps the worker, and with it the
// state above, alive while a panel is open.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;
  let windowId;
  port.onMessage.addListener((msg) => {
    if (msg.windowId === undefined || windowId !== undefined) return;
    windowId = msg.windowId;
    openPanels.set(windowId, (openPanels.get(windowId) ?? 0) + 1);
  });
  port.onDisconnect.addListener(() => {
    if (windowId === undefined) return;
    const count = openPanels.get(windowId) - 1;
    if (count > 0) openPanels.set(windowId, count); else openPanels.delete(windowId);
  });
});

const logError = (err) => console.error('Independent Tabs:', err);

// Blocks the worker for `ms`. The browser keeps processing the API calls made before, so this
// spaces them out in time while the user gesture, a flag held for the synchronous run of the
// handler, stays valid; Atomics.wait is not allowed in a service worker.
function pause(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

// sidePanel.open on a panel that is already open leaves keyboard focus where it is, in the page
// after a tab was activated. Disabling the panel closes it, and the panel opened again takes
// keyboard focus. The pause lets the browser finish closing the panel first: opened while the
// old panel is still on its way out, the new one does not reliably get the focus. Disabling
// closes the panels of all windows, so those open elsewhere open again.
function reopenPanel(windowId) {
  chrome.sidePanel.setOptions({ enabled: false }).catch(logError);
  if (openPanels.has(windowId)) pause(cachedSettings.panelReopenPause);
  chrome.sidePanel.setOptions({ enabled: true }).catch(logError);
  chrome.sidePanel.open({ windowId }).catch(logError);
  for (const other of openPanels.keys()) {
    if (other !== windowId) chrome.sidePanel.open({ windowId: other }).catch(logError);
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab) return;
  const { windowId } = tab;
  if (command === 'focus-panel') {
    if (cachedSettings.panelShortcutToggles && openPanels.has(windowId)) {
      chrome.sidePanel.close({ windowId }).catch(logError);
    } else {
      reopenPanel(windowId);
    }
  } else if (command === 'close-panel') {
    chrome.sidePanel.close({ windowId }).catch(logError);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-quicksearch') {
    const { quicksearchWindowId } = await chrome.storage.session.get('quicksearchWindowId');
    if (quicksearchWindowId) {
      try {
        const existing = await chrome.windows.get(quicksearchWindowId);
        if (existing.focused) {
          await chrome.windows.remove(quicksearchWindowId);
          await chrome.storage.session.remove('quicksearchWindowId');
        } else {
          await chrome.windows.update(quicksearchWindowId, { focused: true });
        }
        return;
      } catch (e) {
        await chrome.storage.session.remove('quicksearchWindowId');
      }
    }

    const win = await chrome.windows.create({
      url: 'quicksearch.html',
      type: 'popup',
      width: 450,
      height: 500
    });
    await chrome.storage.session.set({ quicksearchWindowId: win.id });
  }

  if (command === 'open-popup') {
    const { popupWindowId } = await chrome.storage.session.get('popupWindowId');
    if (popupWindowId) {
      try {
        const existing = await chrome.windows.get(popupWindowId);
        if (existing.focused) {
          const { settings = {} } = await chrome.storage.local.get('settings');
          if (settings.popupCloseOnRefocus) {
            await chrome.windows.remove(popupWindowId);
            await chrome.storage.session.remove('popupWindowId');
          }
        } else {
          await chrome.windows.update(popupWindowId, { focused: true });
        }
        return;
      } catch (e) {
        await chrome.storage.session.remove('popupWindowId');
      }
    }

    const { popupSize } = await chrome.storage.local.get('popupSize');
    const win = await chrome.windows.create({
      url: 'sidepanel.html',
      type: 'popup',
      width: popupSize?.width || 350,
      height: popupSize?.height || 700
    });
    await chrome.storage.session.set({ popupWindowId: win.id });
  }
});
