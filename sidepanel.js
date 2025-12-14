// Independent Tabs - Side Panel Logic

let tabOrder = [];
let tabData = {};
let draggedTabId = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load saved order
  const stored = await chrome.storage.local.get('tabOrder');
  tabOrder = stored.tabOrder || [];

  // Get current tabs and their data
  const tabs = await chrome.tabs.query({ currentWindow: true });
  tabs.forEach(tab => {
    tabData[tab.id] = extractTabData(tab);
  });

  // Sync: add any tabs not in our order (edge case: extension just installed)
  const currentTabIds = tabs.map(t => t.id);
  const missingTabs = currentTabIds.filter(id => !tabOrder.includes(id));
  // Also remove tabs that no longer exist
  tabOrder = [...tabOrder.filter(id => currentTabIds.includes(id)), ...missingTabs];

  await saveTabOrder();
  render();
  setupEventListeners();
  setupDragDrop();
}

function extractTabData(tab) {
  return {
    id: tab.id,
    title: tab.title || 'Loading...',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || '',
    active: tab.active,
    windowId: tab.windowId
  };
}

async function saveTabOrder() {
  await chrome.storage.local.set({ tabOrder });
}

function setupEventListeners() {
  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Storage change listener (for updates from service worker)
  chrome.storage.local.onChanged.addListener(async (changes) => {
    if (changes.tabOrder) {
      tabOrder = changes.tabOrder.newValue || [];
      // Refresh tab data for any new tabs
      const tabs = await chrome.tabs.query({ currentWindow: true });
      tabs.forEach(tab => {
        tabData[tab.id] = extractTabData(tab);
      });
      render();
    }
  });

  // Tab activated (focus changed)
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    Object.keys(tabData).forEach(id => {
      tabData[id].active = (parseInt(id) === tabId);
    });
    render();
  });

  // Tab updated (title/favicon changed)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabData[tabId]) {
      if (changeInfo.title) tabData[tabId].title = changeInfo.title;
      if (changeInfo.favIconUrl) tabData[tabId].favIconUrl = changeInfo.favIconUrl;
      if (changeInfo.status === 'complete') {
        tabData[tabId] = extractTabData(tab);
      }
      render();
    }
  });

  // Tab removed (cleanup local data)
  chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabData[tabId];
    // Service worker handles storage update, but we can update local state
    tabOrder = tabOrder.filter(id => id !== tabId);
    render();
  });
}

function setupDragDrop() {
  const tabList = document.getElementById('tab-list');

  tabList.addEventListener('dragstart', (e) => {
    const tabItem = e.target.closest('.tab-item');
    if (tabItem) {
      draggedTabId = parseInt(tabItem.dataset.tabId);
      tabItem.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedTabId.toString());
    }
  });

  tabList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const tabItem = e.target.closest('.tab-item');
    if (tabItem && draggedTabId !== parseInt(tabItem.dataset.tabId)) {
      // Clear previous indicators
      document.querySelectorAll('.tab-item').forEach(el => {
        el.classList.remove('drop-above', 'drop-below');
      });

      const rect = tabItem.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        tabItem.classList.add('drop-above');
      } else {
        tabItem.classList.add('drop-below');
      }
    }
  });

  tabList.addEventListener('dragleave', (e) => {
    const tabItem = e.target.closest('.tab-item');
    if (tabItem) {
      tabItem.classList.remove('drop-above', 'drop-below');
    }
  });

  tabList.addEventListener('drop', async (e) => {
    e.preventDefault();
    const targetItem = e.target.closest('.tab-item');
    if (targetItem && draggedTabId) {
      const targetId = parseInt(targetItem.dataset.tabId);
      if (draggedTabId !== targetId) {
        await reorderTab(draggedTabId, targetId, e.clientY);
      }
    }
    cleanup();
  });

  tabList.addEventListener('dragend', cleanup);

  function cleanup() {
    document.querySelectorAll('.tab-item').forEach(el => {
      el.classList.remove('dragging', 'drop-above', 'drop-below');
    });
    draggedTabId = null;
  }
}

async function reorderTab(draggedId, targetId, mouseY) {
  const fromIndex = tabOrder.indexOf(draggedId);
  let toIndex = tabOrder.indexOf(targetId);

  if (fromIndex === -1 || toIndex === -1) return;

  // Determine if dropping above or below target
  const targetEl = document.querySelector(`[data-tab-id="${targetId}"]`);
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    if (mouseY > rect.top + rect.height / 2) {
      toIndex++;
    }
  }

  // Remove from old position
  tabOrder.splice(fromIndex, 1);

  // Adjust index if needed
  if (fromIndex < toIndex) toIndex--;

  // Insert at new position
  tabOrder.splice(toIndex, 0, draggedId);

  await saveTabOrder();
  render();
}

function render() {
  const tabList = document.getElementById('tab-list');
  const tabCount = document.getElementById('tab-count');

  // Clear and rebuild
  tabList.innerHTML = '';

  let visibleCount = 0;

  tabOrder.forEach(tabId => {
    const data = tabData[tabId];
    if (!data) return; // Tab might be from another window or closed

    visibleCount++;

    const item = document.createElement('div');
    item.className = 'tab-item' + (data.active ? ' active' : '');
    item.dataset.tabId = tabId;
    item.draggable = true;

    // Favicon with fallback
    const faviconSrc = data.favIconUrl || `chrome-extension://${chrome.runtime.id}/icons/icon-16.png`;

    item.innerHTML = `
      <img class="favicon" src="${escapeAttr(faviconSrc)}" alt="" draggable="false">
      <span class="title" title="${escapeAttr(data.title)}">${escapeHtml(data.title)}</span>
      <button class="close-btn" title="Close tab" aria-label="Close tab">&times;</button>
    `;

    // Handle favicon load errors
    const favicon = item.querySelector('.favicon');
    favicon.addEventListener('error', () => {
      favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23888" width="16" height="16" rx="2"/></svg>';
    });

    // Click to focus tab
    item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('close-btn')) return;
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(data.windowId, { focused: true });
    });

    // Close button
    item.querySelector('.close-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await chrome.tabs.remove(tabId);
    });

    tabList.appendChild(item);
  });

  tabCount.textContent = `${visibleCount} tab${visibleCount !== 1 ? 's' : ''}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return (text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
