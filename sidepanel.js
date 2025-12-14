// Independent Tabs - Side Panel Logic

let tabOrder = [];
let tabData = {};
let customNames = {};  // Custom tab names that override Chrome's title
let draggedTabId = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load saved order and custom names
  const stored = await chrome.storage.local.get(['tabOrder', 'customNames']);
  tabOrder = stored.tabOrder || [];
  customNames = stored.customNames || {};

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
  setupContextMenu();
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
    let needsRender = false;

    if (changes.tabOrder) {
      tabOrder = changes.tabOrder.newValue || [];
      // Refresh tab data for any new tabs
      const tabs = await chrome.tabs.query({ currentWindow: true });
      tabs.forEach(tab => {
        tabData[tab.id] = extractTabData(tab);
      });
      needsRender = true;
    }

    if (changes.customNames) {
      customNames = changes.customNames.newValue || {};
      needsRender = true;
    }

    if (needsRender) render();
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
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    delete tabData[tabId];
    // Service worker handles storage update, but we can update local state
    tabOrder = tabOrder.filter(id => id !== tabId);
    // Also remove any custom name for this tab
    if (customNames[tabId]) {
      delete customNames[tabId];
      await chrome.storage.local.set({ customNames });
    }
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

    // Use custom name if set, otherwise Chrome's title
    const displayTitle = customNames[tabId] || data.title;
    const hasCustomName = !!customNames[tabId];

    item.innerHTML = `
      <img class="favicon" src="${escapeAttr(faviconSrc)}" alt="" draggable="false">
      <span class="title${hasCustomName ? ' custom-name' : ''}" title="${escapeAttr(data.title)}">${escapeHtml(displayTitle)}</span>
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

// Context menu for tab renaming
function setupContextMenu() {
  const tabList = document.getElementById('tab-list');

  tabList.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const tabItem = e.target.closest('.tab-item');
    if (!tabItem) return;

    const tabId = parseInt(tabItem.dataset.tabId);
    showContextMenu(e.clientX, e.clientY, tabId);
  });

  // Close context menu on click outside
  document.addEventListener('click', hideContextMenu);
}

function showContextMenu(x, y, tabId) {
  // Remove existing menu
  hideContextMenu();

  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.className = 'context-menu';

  const data = tabData[tabId];
  const hasCustomName = !!customNames[tabId];

  menu.innerHTML = `
    <button class="context-menu-item" data-action="rename">
      ${hasCustomName ? 'Edit name' : 'Rename tab'}
    </button>
    ${hasCustomName ? `
    <button class="context-menu-item" data-action="reset">
      Reset to original
    </button>
    ` : ''}
    <button class="context-menu-item" data-action="close">
      Close tab
    </button>
  `;

  // Position menu
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  document.body.appendChild(menu);

  // Adjust if menu goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 5}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 5}px`;
  }

  // Handle menu clicks
  menu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    hideContextMenu();

    if (action === 'rename') {
      await promptRename(tabId);
    } else if (action === 'reset') {
      delete customNames[tabId];
      await chrome.storage.local.set({ customNames });
      render();
    } else if (action === 'close') {
      await chrome.tabs.remove(tabId);
    }
  });
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.remove();
}

async function promptRename(tabId) {
  const data = tabData[tabId];
  if (!data) return;

  const currentName = customNames[tabId] || data.title;
  const newName = prompt('Enter custom name for this tab:', currentName);

  if (newName !== null && newName.trim() !== '') {
    customNames[tabId] = newName.trim();
    await chrome.storage.local.set({ customNames });
    render();
  }
}
