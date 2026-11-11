// Independent Tabs - Service Worker
// Handles tab events and maintains the custom tab order in storage

importScripts('tab-items.js');

// Tab tracking lives here rather than in the pages: the worker is woken for every tab event,
// while a side panel or popup only sees the tabs created while it is open.

const DEFAULT_SETTINGS = { newTabPosition: 'bottom' };

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
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
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
