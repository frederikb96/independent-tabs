// Independent Tabs - Service Worker
// Handles tab events and maintains the custom tab order in storage

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  // Enable side panel to open on action click
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Initialize settings with defaults if not set
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({
      settings: { newTabPosition: 'bottom' }
    });
  }

  // Initialize tab order with current tabs
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const { tabOrder } = await chrome.storage.local.get('tabOrder');
  if (!tabOrder || tabOrder.length === 0) {
    const initialOrder = tabs.map(t => t.id);
    await chrome.storage.local.set({ tabOrder: initialOrder });
  }
});

// Tab created - add to our order
chrome.tabs.onCreated.addListener(async (tab) => {
  const { tabOrder = [] } = await chrome.storage.local.get('tabOrder');
  const { settings = { newTabPosition: 'bottom' } } = await chrome.storage.local.get('settings');

  // Don't add duplicates
  if (tabOrder.includes(tab.id)) return;

  const newOrder = settings.newTabPosition === 'top'
    ? [tab.id, ...tabOrder]
    : [...tabOrder, tab.id];

  await chrome.storage.local.set({ tabOrder: newOrder });
});

// Tab removed - remove from our order
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { tabOrder = [] } = await chrome.storage.local.get('tabOrder');
  const newOrder = tabOrder.filter(id => id !== tabId);
  await chrome.storage.local.set({ tabOrder: newOrder });
});

// NOTE: We intentionally DO NOT listen to chrome.tabs.onMoved
// This is the key feature - our order is independent from Chrome's tab bar order!
