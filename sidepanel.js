// Independent Tabs - Side Panel Logic with Tab Groups

// Data structure:
// items: Array of tab IDs (ungrouped) or group objects
// Group object: { group: 'uuid', name: 'Group Name', color: '#hex', tabs: [tabId, ...] }

let items = [];           // Mixed array of tab IDs and group objects
let tabData = {};         // Tab metadata cache
let customNames = {};     // Custom tab names
let selectedTabs = new Set();  // Currently selected tab IDs
let lastClickedTab = null;     // For Shift+click range selection
let sortableInstances = [];    // Track SortableJS instances
let keyboardFocusedTabId = null;  // For keyboard navigation
let savedSessions = {};   // Saved session storage
let currentView = 'tabs'; // Current view: 'tabs' or 'sessions'
let restoringTabIds = new Set();  // Tab IDs being restored (skip in onCreated)

// Debounce queue for tab removal (prevents race conditions when closing multiple tabs)
let removeQueue = [];
let removeTimeout = null;

// Autosave queue for groups with autoSave enabled
let autosaveQueue = new Set();
let autosaveTimeout = null;

const GROUP_COLORS = [
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
  '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#ff9800', '#ff5722'
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const stored = await chrome.storage.local.get(['items', 'customNames', 'savedSessions']);
  items = stored.items || [];
  customNames = stored.customNames || {};
  savedSessions = stored.savedSessions || {};

  // Migration from old tabOrder format
  if (items.length === 0) {
    const oldData = await chrome.storage.local.get('tabOrder');
    if (oldData.tabOrder) {
      items = oldData.tabOrder;
      await saveItems();
    }
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  tabs.forEach(tab => {
    tabData[tab.id] = extractTabData(tab);
  });

  await syncItemsWithTabs(tabs);
  render();
  setupEventListeners();
  setupContextMenu();
  setupKeyboardNavigation();
  setupViewToggle();
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

async function saveItems() {
  await chrome.storage.local.set({ items });
}

// Sync items with actual Chrome tabs
async function syncItemsWithTabs(tabs) {
  const currentTabIds = new Set(tabs.map(t => t.id));

  // Remove closed tabs from items and groups
  items = items.filter(item => {
    if (typeof item === 'number') {
      return currentTabIds.has(item);
    } else if (item.group) {
      item.tabs = item.tabs.filter(id => currentTabIds.has(id));
      return item.tabs.length > 0; // Remove empty groups
    }
    return false;
  });

  // Get all tab IDs currently in items
  const itemTabIds = new Set(getAllTabIds());

  // Add missing tabs
  const { settings = { newTabPosition: 'bottom' } } = await chrome.storage.local.get('settings');
  const missingTabs = tabs.filter(t => !itemTabIds.has(t.id));

  missingTabs.forEach(tab => {
    if (settings.newTabPosition === 'top') {
      items.unshift(tab.id);
    } else {
      items.push(tab.id);
    }
  });

  await saveItems();
}

function getAllTabIds() {
  const ids = [];
  items.forEach(item => {
    if (typeof item === 'number') {
      ids.push(item);
    } else if (item.group) {
      ids.push(...item.tabs);
    }
  });
  return ids;
}

function setupEventListeners() {
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.local.onChanged.addListener(async (changes) => {
    if (changes.items) {
      items = changes.items.newValue || [];
      const tabs = await chrome.tabs.query({ currentWindow: true });
      tabs.forEach(tab => {
        tabData[tab.id] = extractTabData(tab);
      });
      render();
    }
    if (changes.customNames) {
      customNames = changes.customNames.newValue || {};
      render();
    }
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    Object.keys(tabData).forEach(id => {
      tabData[id].active = (parseInt(id) === tabId);
    });
    keyboardFocusedTabId = tabId;
    render();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabData[tabId]) {
      if (changeInfo.title) tabData[tabId].title = changeInfo.title;
      if (changeInfo.favIconUrl) tabData[tabId].favIconUrl = changeInfo.favIconUrl;
      if (changeInfo.url) tabData[tabId].url = changeInfo.url;
      if (changeInfo.status === 'complete') {
        tabData[tabId] = extractTabData(tab);
      }
      render();

      // Trigger autosave on URL change (navigation within tab)
      if (changeInfo.url) {
        const groupId = getTabGroupId(tabId);
        if (groupId) queueAutosave(groupId);
      }
    }
  });

  chrome.tabs.onCreated.addListener(async (tab) => {
    tabData[tab.id] = extractTabData(tab);
    const { settings = { newTabPosition: 'bottom' } } = await chrome.storage.local.get('settings');

    // Check AFTER await - by now restoringTabIds will be populated if this is a restore
    if (restoringTabIds.has(tab.id)) {
      restoringTabIds.delete(tab.id);  // Clean up
      return;
    }

    // Check if opener tab is in a group - add child tab to same group
    if (tab.openerTabId) {
      const openerGroupId = getTabGroupId(tab.openerTabId);
      if (openerGroupId) {
        const group = items.find(item => item.group === openerGroupId);
        if (group) {
          if (settings.newTabPosition === 'top') {
            group.tabs.unshift(tab.id);
          } else {
            group.tabs.push(tab.id);
          }
          await saveItems();
          render();
          queueAutosave(openerGroupId);
          return;
        }
      }
    }

    // Default: add to root level
    if (settings.newTabPosition === 'top') {
      items.unshift(tab.id);
    } else {
      items.push(tab.id);
    }
    await saveItems();
    render();
  });

  // Debounced removal handler - batches rapid tab closures to prevent race conditions
  chrome.tabs.onRemoved.addListener((tabId) => {
    removeQueue.push(tabId);

    if (removeTimeout) clearTimeout(removeTimeout);
    removeTimeout = setTimeout(processRemoveQueue, 50);
  });

  // Click outside to clear selection
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-item') && !e.target.closest('.group-header') && !e.target.closest('.context-menu')) {
      selectedTabs.clear();
      render();
    }
  });
}

// Process batched tab removals - prevents race conditions with storage listener
async function processRemoveQueue() {
  if (removeQueue.length === 0) return;

  const tabIds = [...removeQueue];
  removeQueue = [];
  removeTimeout = null;

  const removedSet = new Set(tabIds);

  // Clean up state for all removed tabs
  tabIds.forEach(id => {
    delete tabData[id];
    selectedTabs.delete(id);
    if (keyboardFocusedTabId === id) {
      keyboardFocusedTabId = null;
    }
  });

  // Single filter pass for all removed tabs
  items = items.filter(item => {
    if (typeof item === 'number') {
      return !removedSet.has(item);
    } else if (item.group) {
      item.tabs = item.tabs.filter(id => !removedSet.has(id));
      return item.tabs.length > 0;  // Remove empty groups
    }
    return false;
  });

  // Clean up custom names
  let customNamesChanged = false;
  tabIds.forEach(id => {
    if (customNames[id]) {
      delete customNames[id];
      customNamesChanged = true;
    }
  });

  if (customNamesChanged) {
    await chrome.storage.local.set({ customNames });
  }

  await saveItems();
  render();

  // Check if any removed tabs were in autosave groups
  checkAutosaveForRemovedTabs(tabIds);
}

// Queue a group for autosave (debounced)
function queueAutosave(groupId) {
  const group = items.find(item => item.group === groupId);
  if (!group || !group.autoSave || !group.linkedSessionId) return;

  autosaveQueue.add(groupId);

  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(processAutosaveQueue, 500);
}

// Process all queued autosaves
async function processAutosaveQueue() {
  if (autosaveQueue.size === 0) return;

  const groupIds = [...autosaveQueue];
  autosaveQueue.clear();
  autosaveTimeout = null;

  for (const groupId of groupIds) {
    const group = items.find(item => item.group === groupId);
    if (!group || !group.linkedSessionId) continue;

    // Update the saved session
    const sessionId = group.linkedSessionId;
    const existingSession = savedSessions[sessionId];
    if (!existingSession) continue;

    const sessionTabs = group.tabs.map(tabId => {
      const data = tabData[tabId];
      return {
        url: data?.url || '',
        title: data?.title || 'Unknown',
        customName: customNames[tabId] || null
      };
    }).filter(t => t.url);

    savedSessions[sessionId] = {
      ...existingSession,
      name: group.name,
      color: group.color,
      autoSave: group.autoSave || false,  // Keep autoSave state in sync
      updatedAt: Date.now(),
      tabs: sessionTabs
    };
  }

  await chrome.storage.local.set({ savedSessions });
}

// Check if removed tabs affect any autosave groups
function checkAutosaveForRemovedTabs(removedTabIds) {
  // After removal, check which groups might need autosave
  // The tabs are already removed, so we just trigger autosave for any autosave-enabled groups
  items.forEach(item => {
    if (item.group && item.autoSave && item.linkedSessionId) {
      queueAutosave(item.group);
    }
  });
}

function render() {
  const tabList = document.getElementById('tab-list');
  const tabCount = document.getElementById('tab-count');

  // Destroy existing sortable instances
  sortableInstances.forEach(s => s.destroy());
  sortableInstances = [];

  tabList.innerHTML = '';
  let visibleCount = 0;

  items.forEach((item, index) => {
    if (typeof item === 'number') {
      // Ungrouped tab
      const el = renderTab(item);
      if (el) {
        tabList.appendChild(el);
        visibleCount++;
      }
    } else if (item.group) {
      // Group
      const groupEl = renderGroup(item, index);
      tabList.appendChild(groupEl);
      visibleCount += item.tabs.length;
    }
  });

  tabCount.textContent = `${visibleCount} tab${visibleCount !== 1 ? 's' : ''}`;

  // Initialize sortable on root
  initSortable(tabList, null);
}

function renderTab(tabId) {
  const data = tabData[tabId];
  if (!data) return null;

  const item = document.createElement('div');
  item.className = 'tab-item';
  if (data.active) item.classList.add('active');
  if (selectedTabs.has(tabId)) item.classList.add('selected');
  if (keyboardFocusedTabId === tabId) item.classList.add('keyboard-focused');
  item.dataset.tabId = tabId;

  const faviconSrc = data.favIconUrl || `chrome-extension://${chrome.runtime.id}/icons/icon-16.png`;
  const displayTitle = customNames[tabId] || data.title;
  const hasCustomName = !!customNames[tabId];

  item.innerHTML = `
    <img class="favicon" src="${escapeAttr(faviconSrc)}" alt="" draggable="false">
    <span class="title${hasCustomName ? ' custom-name' : ''}" title="${escapeAttr(data.title)}">${escapeHtml(displayTitle)}</span>
    <button class="close-btn" title="Close tab" aria-label="Close tab">&times;</button>
  `;

  const favicon = item.querySelector('.favicon');
  favicon.addEventListener('error', () => {
    favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23888" width="16" height="16" rx="2"/></svg>';
  });

  item.addEventListener('click', (e) => handleTabClick(e, tabId, data));
  item.querySelector('.close-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await chrome.tabs.remove(tabId);
  });

  return item;
}

function renderGroup(group, itemIndex) {
  const container = document.createElement('div');
  container.className = 'group-container';
  container.dataset.groupId = group.group;
  container.style.setProperty('--group-color', group.color);

  // Group header
  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `
    <span class="group-color-dot" style="background: ${group.color}"></span>
    <span class="group-name">${escapeHtml(group.name)}</span>
    <button class="group-close-btn" title="Close all tabs in group">&times;</button>
  `;

  header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showGroupContextMenu(e.clientX, e.clientY, group);
  });

  header.querySelector('.group-close-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await chrome.tabs.remove([...group.tabs]);  // Copy array to avoid mutation issues
  });

  container.appendChild(header);

  // Group tabs container
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'group-tabs';
  tabsContainer.dataset.groupId = group.group;

  group.tabs.forEach(tabId => {
    const el = renderTab(tabId);
    if (el) {
      tabsContainer.appendChild(el);
    }
  });

  container.appendChild(tabsContainer);

  // Initialize sortable on group tabs
  initSortable(tabsContainer, group.group);

  return container;
}

function handleTabClick(e, tabId, data) {
  if (e.target.classList.contains('close-btn')) return;

  if (e.shiftKey && lastClickedTab !== null) {
    // Range selection
    const allTabIds = getAllTabIds();
    const startIdx = allTabIds.indexOf(lastClickedTab);
    const endIdx = allTabIds.indexOf(tabId);
    if (startIdx !== -1 && endIdx !== -1) {
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      for (let i = from; i <= to; i++) {
        selectedTabs.add(allTabIds[i]);
      }
    }
    render();
  } else if (e.ctrlKey || e.metaKey) {
    // Toggle selection
    if (selectedTabs.has(tabId)) {
      selectedTabs.delete(tabId);
    } else {
      // If nothing selected yet and we have a last clicked tab, include it too
      if (selectedTabs.size === 0 && lastClickedTab !== null && lastClickedTab !== tabId) {
        selectedTabs.add(lastClickedTab);
      }
      selectedTabs.add(tabId);
    }
    lastClickedTab = tabId;
    render();
  } else {
    // Normal click - focus tab
    selectedTabs.clear();
    lastClickedTab = tabId;
    keyboardFocusedTabId = tabId;
    chrome.tabs.update(tabId, { active: true });
    chrome.windows.update(data.windowId, { focused: true });
  }
}

function initSortable(container, groupId) {
  const options = {
    group: 'tabs',
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    draggable: groupId === null ? '.tab-item, .group-container' : '.tab-item',
    onEnd: async (evt) => {
      await handleDragEnd(evt, groupId);
    }
  };

  // Only filter .group-tabs on root container (prevent dragging the container itself)
  if (groupId === null) {
    options.filter = '.group-tabs';
  }

  const sortable = new Sortable(container, options);
  sortableInstances.push(sortable);
}

async function handleDragEnd(evt, sourceGroupId) {
  const draggedEl = evt.item;
  const toContainer = evt.to;
  const newIndex = evt.newIndex;

  // Check if dragging a group
  if (draggedEl.classList.contains('group-container')) {
    const groupId = draggedEl.dataset.groupId;
    const group = items.find(item => item.group === groupId);
    if (group) {
      // Remove group from old position
      items = items.filter(item => item.group !== groupId);
      // Insert at new position
      items.splice(newIndex, 0, group);
      await saveItems();
      render();
    }
    return;
  }

  // Dragging a tab
  const tabId = parseInt(draggedEl.dataset.tabId);
  const toGroupId = toContainer.dataset.groupId || null;

  // Check if dragging selected tabs (multi-drag)
  if (selectedTabs.has(tabId) && selectedTabs.size > 1) {
    await handleMultiDrag(Array.from(selectedTabs), toGroupId, newIndex);
    return;
  }

  // Single tab drag
  removeTabFromItems(tabId);

  // Add to new location
  if (toGroupId) {
    // Moving into a group
    const group = items.find(item => item.group === toGroupId);
    if (group) {
      group.tabs.splice(newIndex, 0, tabId);
    }
  } else {
    // Moving to root level
    items.splice(newIndex, 0, tabId);
  }

  await saveItems();
  render();

  // Trigger autosave for affected groups
  if (sourceGroupId) queueAutosave(sourceGroupId);
  if (toGroupId && toGroupId !== sourceGroupId) queueAutosave(toGroupId);
}

async function handleMultiDrag(tabIds, toGroupId, insertIndex) {
  // Get tabs in their current visual order
  const allTabIds = getAllTabIds();
  const orderedTabIds = tabIds.sort((a, b) => allTabIds.indexOf(a) - allTabIds.indexOf(b));

  // Track source groups before removal
  const sourceGroupIds = new Set();
  orderedTabIds.forEach(id => {
    const groupId = getTabGroupId(id);
    if (groupId) sourceGroupIds.add(groupId);
  });

  // Remove all selected tabs from their current positions
  orderedTabIds.forEach(id => removeTabFromItems(id));

  // Insert all tabs at the drop position
  if (toGroupId) {
    // Moving into a group
    const group = items.find(item => item.group === toGroupId);
    if (group) {
      // Adjust insert index based on how many tabs were above it
      group.tabs.splice(insertIndex, 0, ...orderedTabIds);
    }
  } else {
    // Moving to root level
    items.splice(insertIndex, 0, ...orderedTabIds);
  }

  await saveItems();
  selectedTabs.clear();
  render();

  // Trigger autosave for all affected groups
  sourceGroupIds.forEach(groupId => queueAutosave(groupId));
  if (toGroupId) queueAutosave(toGroupId);
}

function removeTabFromItems(tabId) {
  for (let i = 0; i < items.length; i++) {
    if (items[i] === tabId) {
      items.splice(i, 1);
      return;
    }
    if (items[i].group) {
      const idx = items[i].tabs.indexOf(tabId);
      if (idx !== -1) {
        items[i].tabs.splice(idx, 1);
        // Remove empty group
        if (items[i].tabs.length === 0) {
          items.splice(i, 1);
        }
        return;
      }
    }
  }
}

function getNextGroupColor() {
  const usedColors = items.filter(i => i.group).map(g => g.color);
  for (const color of GROUP_COLORS) {
    if (!usedColors.includes(color)) return color;
  }
  return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
}

function generateGroupId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

async function createGroup(tabIds, name = 'New Group') {
  const color = getNextGroupColor();
  const group = {
    group: generateGroupId(),
    name: name,
    color: color,
    tabs: []
  };

  // Find insertion point (position of first selected tab)
  let insertIndex = items.length;
  for (const tabId of tabIds) {
    for (let i = 0; i < items.length; i++) {
      if (items[i] === tabId) {
        insertIndex = Math.min(insertIndex, i);
        break;
      }
    }
  }

  // Remove tabs from current positions and add to group
  tabIds.forEach(tabId => {
    removeTabFromItems(tabId);
    group.tabs.push(tabId);
  });

  // Insert group at the position of first tab
  items.splice(insertIndex, 0, group);

  await saveItems();
  selectedTabs.clear();
  render();
}

async function ungroupTab(tabId, groupId) {
  const groupIndex = items.findIndex(item => item.group === groupId);
  if (groupIndex === -1) return;

  const group = items[groupIndex];
  const tabIndex = group.tabs.indexOf(tabId);
  if (tabIndex === -1) return;

  group.tabs.splice(tabIndex, 1);

  // Insert tab after the group
  items.splice(groupIndex + 1, 0, tabId);

  // Remove empty group
  if (group.tabs.length === 0) {
    items.splice(groupIndex, 1);
  }

  await saveItems();
  render();
}

async function dissolveGroup(groupId) {
  const groupIndex = items.findIndex(item => item.group === groupId);
  if (groupIndex === -1) return;

  const group = items[groupIndex];
  // Replace group with its tabs
  items.splice(groupIndex, 1, ...group.tabs);

  await saveItems();
  render();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return (text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Context Menu
function setupContextMenu() {
  const tabList = document.getElementById('tab-list');

  tabList.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const tabItem = e.target.closest('.tab-item');
    const groupHeader = e.target.closest('.group-header');

    if (groupHeader) {
      // Group header right-click is handled in renderGroup
      return;
    }

    if (tabItem) {
      const tabId = parseInt(tabItem.dataset.tabId);

      // If right-clicking an unselected tab, select only that tab
      if (!selectedTabs.has(tabId)) {
        selectedTabs.clear();
        selectedTabs.add(tabId);
        render();
      }

      showTabContextMenu(e.clientX, e.clientY, tabId);
    }
  });

  document.addEventListener('click', hideContextMenu);
}

function showTabContextMenu(x, y, tabId) {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.className = 'context-menu';

  const hasCustomName = !!customNames[tabId];
  const tabGroupId = getTabGroupId(tabId);
  const multipleSelected = selectedTabs.size > 1;

  let menuHtml = '';

  if (multipleSelected) {
    menuHtml = `
      <button class="context-menu-item" data-action="group-selected">
        Group ${selectedTabs.size} tabs
      </button>
      <button class="context-menu-item" data-action="close-selected">
        Close ${selectedTabs.size} tabs
      </button>
    `;
  } else {
    menuHtml = `
      <button class="context-menu-item" data-action="rename">
        ${hasCustomName ? 'Edit name' : 'Rename tab'}
      </button>
      ${hasCustomName ? `
      <button class="context-menu-item" data-action="reset-name">
        Reset to original
      </button>
      ` : ''}
      <div class="context-menu-separator"></div>
      ${tabGroupId ? `
      <button class="context-menu-item" data-action="ungroup">
        Remove from group
      </button>
      ` : `
      <button class="context-menu-item" data-action="create-group">
        Create group
      </button>
      `}
      <div class="context-menu-separator"></div>
      <button class="context-menu-item" data-action="close">
        Close tab
      </button>
    `;
  }

  menu.innerHTML = menuHtml;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  adjustMenuPosition(menu);

  menu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    hideContextMenu();

    switch (action) {
      case 'rename':
        await promptRename(tabId);
        break;
      case 'reset-name':
        delete customNames[tabId];
        await chrome.storage.local.set({ customNames });
        render();
        break;
      case 'close':
        await chrome.tabs.remove(tabId);
        break;
      case 'create-group':
        await createGroup([tabId]);
        break;
      case 'ungroup':
        await ungroupTab(tabId, tabGroupId);
        break;
      case 'group-selected':
        await createGroup(Array.from(selectedTabs));
        break;
      case 'close-selected':
        await chrome.tabs.remove(Array.from(selectedTabs));
        break;
    }
  });
}

function showGroupContextMenu(x, y, group) {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.className = 'context-menu';

  const hasSavedSession = !!group.linkedSessionId;
  const hasAutoSave = group.autoSave === true;

  menu.innerHTML = `
    <button class="context-menu-item" data-action="save-session">
      ${hasSavedSession ? 'Update saved session' : 'Save session'}
    </button>
    ${hasSavedSession ? `
    <button class="context-menu-item" data-action="save-as-new">
      Save as new...
    </button>
    <button class="context-menu-item" data-action="toggle-autosave">
      Auto-save: ${hasAutoSave ? '✓ enabled' : 'disabled'}
    </button>
    ` : ''}
    <div class="context-menu-separator"></div>
    <button class="context-menu-item" data-action="rename-group">
      Rename group
    </button>
    <button class="context-menu-item" data-action="change-color">
      Change color
    </button>
    <div class="context-menu-separator"></div>
    <button class="context-menu-item" data-action="ungroup-all">
      Ungroup all
    </button>
    <button class="context-menu-item" data-action="close-group">
      Close all tabs
    </button>
  `;

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  adjustMenuPosition(menu);

  menu.addEventListener('click', async (e) => {
    e.stopPropagation();  // Prevent document click from hiding color picker
    const action = e.target.dataset.action;
    if (!action) return;

    hideContextMenu();

    switch (action) {
      case 'save-session':
        await saveGroupAsSession(group);
        break;
      case 'save-as-new':
        await saveGroupAsNewSession(group);
        break;
      case 'toggle-autosave':
        group.autoSave = !group.autoSave;
        await saveItems();
        render();
        break;
      case 'rename-group':
        const newName = prompt('Enter group name:', group.name);
        if (newName && newName.trim()) {
          group.name = newName.trim();
          await saveItems();
          render();
          queueAutosave(group.group);
        }
        break;
      case 'change-color':
        showColorPicker(group);
        break;
      case 'ungroup-all':
        await dissolveGroup(group.group);
        break;
      case 'close-group':
        await chrome.tabs.remove([...group.tabs]);
        break;
    }
  });
}

function showColorPicker(group) {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.className = 'context-menu color-picker';

  menu.innerHTML = GROUP_COLORS.map(color => `
    <button class="color-option" data-color="${color}" style="background: ${color}"></button>
  `).join('');

  // Position near the group
  const groupEl = document.querySelector(`[data-group-id="${group.group}"]`);
  const rect = groupEl.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(menu);

  adjustMenuPosition(menu);

  menu.addEventListener('click', async (e) => {
    const color = e.target.dataset.color;
    if (!color) return;

    hideContextMenu();
    group.color = color;
    await saveItems();
    render();
    queueAutosave(group.group);
  });
}

function adjustMenuPosition(menu) {
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 5}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 5}px`;
  }
}

function getTabGroupId(tabId) {
  for (const item of items) {
    if (item.group && item.tabs.includes(tabId)) {
      return item.group;
    }
  }
  return null;
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

    // Trigger autosave if tab is in an autosave group
    const groupId = getTabGroupId(tabId);
    if (groupId) queueAutosave(groupId);
  }
}

// Keyboard Navigation
function setupKeyboardNavigation() {
  document.addEventListener('keydown', async (e) => {
    // Ignore if typing in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ignore if context menu is open
    if (document.getElementById('context-menu')) return;

    const allTabIds = getAllTabIds();
    if (allTabIds.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();

      let currentIndex = keyboardFocusedTabId !== null
        ? allTabIds.indexOf(keyboardFocusedTabId)
        : -1;

      if (e.key === 'ArrowDown') {
        // Move down (or start at first tab)
        currentIndex = currentIndex < allTabIds.length - 1 ? currentIndex + 1 : currentIndex;
      } else {
        // Move up (or start at last tab)
        currentIndex = currentIndex > 0 ? currentIndex - 1 : (currentIndex === -1 ? allTabIds.length - 1 : currentIndex);
      }

      const newTabId = allTabIds[currentIndex];
      if (newTabId !== undefined) {
        keyboardFocusedTabId = newTabId;
        lastClickedTab = newTabId;
        selectedTabs.clear();

        // Focus the tab in Chrome
        const data = tabData[newTabId];
        if (data) {
          await chrome.tabs.update(newTabId, { active: true });
          await chrome.windows.update(data.windowId, { focused: true });
        }

        render();

        // Scroll the focused tab into view
        const focusedEl = document.querySelector(`.tab-item[data-tab-id="${newTabId}"]`);
        if (focusedEl) {
          focusedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    } else if (e.key === ' ' && keyboardFocusedTabId !== null) {
      // Space bar - open rename prompt
      e.preventDefault();
      await promptRename(keyboardFocusedTabId);
    }
  });
}

// View Toggle
function setupViewToggle() {
  const viewBtns = document.querySelectorAll('.view-btn');
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  currentView = view;
  const tabList = document.getElementById('tab-list');
  const sessionsList = document.getElementById('sessions-list');
  const viewBtns = document.querySelectorAll('.view-btn');

  viewBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  if (view === 'tabs') {
    tabList.classList.remove('hidden');
    sessionsList.classList.add('hidden');
  } else {
    tabList.classList.add('hidden');
    sessionsList.classList.remove('hidden');
    renderSessions();
  }
}

// Sessions Management
async function saveGroupAsSession(group) {
  const sessionId = group.linkedSessionId || crypto.randomUUID();
  const isUpdate = !!group.linkedSessionId;

  // Capture current tab data
  const sessionTabs = group.tabs.map(tabId => {
    const data = tabData[tabId];
    return {
      url: data?.url || '',
      title: data?.title || 'Unknown',
      customName: customNames[tabId] || null
    };
  }).filter(t => t.url); // Only save tabs with valid URLs

  // Set autoSave based on settings for new saves
  if (!isUpdate && group.autoSave === undefined) {
    const { settings = {} } = await chrome.storage.local.get('settings');
    group.autoSave = settings.defaultAutoSave || false;
  }

  const session = {
    id: sessionId,
    name: group.name,
    color: group.color,
    autoSave: group.autoSave || false,  // Persist autoSave state in session
    createdAt: isUpdate ? (savedSessions[sessionId]?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now(),
    tabs: sessionTabs
  };

  savedSessions[sessionId] = session;
  await chrome.storage.local.set({ savedSessions });

  // Link group to session
  group.linkedSessionId = sessionId;
  await saveItems();
  render();
}

async function saveGroupAsNewSession(group) {
  const name = prompt('Enter session name:', group.name);
  if (!name || !name.trim()) return;

  const sessionId = crypto.randomUUID();

  // Set autoSave based on settings
  const { settings = {} } = await chrome.storage.local.get('settings');
  const autoSaveValue = settings.defaultAutoSave || false;

  // Capture current tab data
  const sessionTabs = group.tabs.map(tabId => {
    const data = tabData[tabId];
    return {
      url: data?.url || '',
      title: data?.title || 'Unknown',
      customName: customNames[tabId] || null
    };
  }).filter(t => t.url);

  const session = {
    id: sessionId,
    name: name.trim(),
    color: group.color,
    autoSave: autoSaveValue,  // Persist autoSave state in session
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tabs: sessionTabs
  };

  savedSessions[sessionId] = session;
  await chrome.storage.local.set({ savedSessions });

  // Update group to link to new session
  group.linkedSessionId = sessionId;
  group.autoSave = autoSaveValue;
  await saveItems();
  render();
}

async function restoreSession(sessionId) {
  const session = savedSessions[sessionId];
  if (!session || session.tabs.length === 0) return;

  // Option A: Check if a group already exists linked to this session
  const existingGroup = items.find(item => item.group && item.linkedSessionId === sessionId);
  if (existingGroup) {
    // Switch to tabs view and focus the existing group
    switchView('tabs');

    // Focus first tab in the group
    if (existingGroup.tabs.length > 0) {
      const firstTabId = existingGroup.tabs[0];
      const tabInfo = tabData[firstTabId];
      if (tabInfo) {
        await chrome.tabs.update(firstTabId, { active: true });
        await chrome.windows.update(tabInfo.windowId, { focused: true });
      }
      keyboardFocusedTabId = firstTabId;
    }

    render();

    // Scroll to the group
    setTimeout(() => {
      const groupEl = document.querySelector(`[data-group-id="${existingGroup.group}"]`);
      if (groupEl) {
        groupEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 50);

    return;
  }

  const BATCH_SIZE = 5;
  const BATCH_DELAY = 150;
  const createdTabIds = [];
  const newCustomNames = {};

  // Create tabs in batches
  for (let i = 0; i < session.tabs.length; i += BATCH_SIZE) {
    const batch = session.tabs.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(tab =>
        chrome.tabs.create({
          url: tab.url,
          active: false
        })
      )
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const newTabId = result.value.id;
        restoringTabIds.add(newTabId);  // Mark IMMEDIATELY so onCreated skips it
        createdTabIds.push(newTabId);
        tabData[newTabId] = extractTabData(result.value);

        // Store custom name if exists
        if (batch[idx].customName) {
          newCustomNames[newTabId] = batch[idx].customName;
        }
      }
    });

    // Delay between batches
    if (i + BATCH_SIZE < session.tabs.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  if (createdTabIds.length === 0) return;

  // Create group with restored tabs (onCreated skipped adding these due to restoringTabIds)
  const group = {
    group: generateGroupId(),
    name: session.name,
    color: session.color,
    autoSave: session.autoSave || false,  // Restore autoSave state from session
    tabs: createdTabIds,
    linkedSessionId: sessionId
  };

  items.push(group);

  // Save custom names
  if (Object.keys(newCustomNames).length > 0) {
    Object.assign(customNames, newCustomNames);
    await chrome.storage.local.set({ customNames });
  }

  await saveItems();

  // Switch to tabs view
  switchView('tabs');

  // Activate first restored tab
  if (createdTabIds.length > 0) {
    await chrome.tabs.update(createdTabIds[0], { active: true });
  }
}

async function deleteSession(sessionId) {
  if (!confirm('Delete this saved session?')) return;

  delete savedSessions[sessionId];
  await chrome.storage.local.set({ savedSessions });

  // Clear linkedSessionId from any groups that reference this session
  let needsSave = false;
  items.forEach(item => {
    if (item.group && item.linkedSessionId === sessionId) {
      delete item.linkedSessionId;
      needsSave = true;
    }
  });

  if (needsSave) {
    await saveItems();
  }

  renderSessions();
}

function renderSessions() {
  const sessionsList = document.getElementById('sessions-list');

  // Sort by updatedAt descending
  const sortedSessions = Object.values(savedSessions)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (sortedSessions.length === 0) {
    sessionsList.innerHTML = `
      <div class="sessions-empty">
        <p>No saved sessions yet</p>
        <p>Right-click a group header → Save session</p>
      </div>
    `;
    return;
  }

  sessionsList.innerHTML = sortedSessions.map(session => {
    const date = formatDate(session.updatedAt);
    return `
      <div class="session-item" data-session-id="${session.id}">
        <span class="session-color" style="background: ${session.color}"></span>
        <div class="session-info">
          <span class="session-name">${escapeHtml(session.name)}</span>
          <span class="session-meta">${session.tabs.length} tabs • ${date}</span>
        </div>
        <button class="session-delete" title="Delete session">&times;</button>
      </div>
    `;
  }).join('');

  // Add click handlers
  sessionsList.querySelectorAll('.session-item').forEach(item => {
    const sessionId = item.dataset.sessionId;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('session-delete')) {
        e.stopPropagation();
        deleteSession(sessionId);
      } else {
        restoreSession(sessionId);
      }
    });
  });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
