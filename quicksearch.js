// Independent Tabs - Quick Search Popup

let items = [];
let tabData = {};
let customNames = {};
let savedSessions = {};
let searchResults = [];
let selectedIndex = 0;
let fuseInstance = null;
let allEntries = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load data from storage
  const stored = await chrome.storage.local.get(['items', 'customNames', 'savedSessions']);
  items = stored.items || [];
  customNames = stored.customNames || {};
  savedSessions = stored.savedSessions || {};

  // Fetch live tab data
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  tabs.forEach(tab => {
    tabData[tab.id] = {
      id: tab.id,
      title: tab.title || 'Loading...',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl || '',
      active: tab.active,
      windowId: tab.windowId
    };
  });

  buildSearchIndex();
  renderResults();

  const searchInput = document.getElementById('search-input');
  searchInput.focus();

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query) {
      searchResults = fuseInstance.search(query);
    } else {
      searchResults = [];
    }
    selectedIndex = 0;
    renderResults();
  });

  setupKeyboard();
  setupBlurClose();
}

function buildSearchIndex() {
  const entries = [];
  const defaultEntries = [];

  // Sessions (search-only, not shown in default view)
  Object.values(savedSessions).forEach(session => {
    entries.push({
      type: 'session',
      id: session.id,
      name: session.name,
      displayName: session.name,
      color: session.color,
      tabCount: session.tabs.length,
      tabTitles: session.tabs.map(t => t.title).join(' '),
      autoSave: session.autoSave || false,
      _session: session
    });
  });

  // Tabs (in items order)
  const addTab = (tabId) => {
    const data = tabData[tabId];
    if (!data) return;
    const displayName = customNames[tabId] || data.title;
    const entry = {
      type: 'tab',
      id: tabId,
      name: displayName,
      displayName: displayName,
      title: data.title,
      url: data.url,
      favIconUrl: data.favIconUrl,
      windowId: data.windowId,
      hasCustomName: !!customNames[tabId]
    };
    entries.push(entry);
    defaultEntries.push(entry);
  };

  items.forEach(item => {
    if (typeof item === 'number') {
      addTab(item);
    } else if (item.group) {
      item.tabs.forEach(addTab);
    }
  });

  allEntries = defaultEntries;

  fuseInstance = new Fuse(entries, {
    keys: [
      { name: 'displayName', weight: 2.0 },
      { name: 'title', weight: 1.0 },
      { name: 'url', weight: 0.5 },
      { name: 'name', weight: 2.0 },
      { name: 'tabTitles', weight: 0.5 }
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true
  });
}

function getDisplayEntries() {
  if (searchResults.length > 0) {
    return searchResults.map(r => r.item);
  }
  return allEntries;
}

function renderResults() {
  const list = document.getElementById('results-list');
  const entries = getDisplayEntries();

  if (entries.length === 0 && document.getElementById('search-input').value.trim()) {
    list.innerHTML = '<div class="no-results">No results found</div>';
    return;
  }

  list.innerHTML = entries.map((entry, i) => {
    const selectedClass = i === selectedIndex ? ' selected' : '';

    if (entry.type === 'session') {
      return `
        <div class="result-item${selectedClass}" data-index="${i}" data-type="session" data-id="${entry.id}">
          <span class="result-session-dot" style="background: ${escapeAttr(entry.color)}"></span>
          <div class="result-info">
            <span class="result-name">${escapeHtml(entry.name)}</span>
            <span class="result-meta">${entry.tabCount} tab${entry.tabCount !== 1 ? 's' : ''}${entry.autoSave ? ' - auto-save' : ''}</span>
          </div>
          <span class="result-badge">session</span>
        </div>
      `;
    } else {
      const faviconSrc = entry.favIconUrl || `chrome-extension://${chrome.runtime.id}/icons/icon-16.png`;
      const urlSnippet = formatUrl(entry.url);
      const nameClass = entry.hasCustomName ? ' custom-name' : '';
      return `
        <div class="result-item${selectedClass}" data-index="${i}" data-type="tab" data-id="${entry.id}">
          <img class="result-favicon" src="${escapeAttr(faviconSrc)}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><rect fill=%22%23888%22 width=%2216%22 height=%2216%22 rx=%222%22/></svg>'">
          <div class="result-info">
            <span class="result-name${nameClass}">${escapeHtml(entry.displayName)}</span>
            <span class="result-url">${escapeHtml(urlSnippet)}</span>
          </div>
          <span class="result-badge">tab</span>
        </div>
      `;
    }
  }).join('');

  // Scroll selected into view
  const selectedEl = list.querySelector('.result-item.selected');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }

  // Click handlers
  list.querySelectorAll('.result-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      selectedIndex = idx;
      activateSelected();
    });
  });
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    const entries = getDisplayEntries();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (selectedIndex < entries.length - 1) {
        selectedIndex++;
        renderResults();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedIndex > 0) {
        selectedIndex--;
        renderResults();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activateSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeWindow();
    }
  });
}

function setupBlurClose() {
  window.addEventListener('blur', () => {
    closeWindow();
  });
}

async function activateSelected() {
  const entries = getDisplayEntries();
  if (entries.length === 0 || selectedIndex >= entries.length) return;

  const entry = entries[selectedIndex];

  if (entry.type === 'tab') {
    await activateTab(entry.id, entry.windowId);
  } else if (entry.type === 'session') {
    await activateSession(entry.id);
  }
}

async function activateTab(tabId, windowId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
  } catch (e) {
    // Tab may have been closed
  }
  closeWindow();
}

async function activateSession(sessionId) {
  // Check if group already loaded for this session
  const existingGroup = items.find(item => item.group && item.linkedSessionId === sessionId);
  if (existingGroup && existingGroup.tabs.length > 0) {
    const firstTabId = existingGroup.tabs[0];
    try {
      const tab = await chrome.tabs.get(firstTabId);
      await chrome.tabs.update(firstTabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (e) {
      // Tab gone, fall through to restore
      await restoreSession(sessionId);
      return;
    }
    closeWindow();
    return;
  }

  await restoreSession(sessionId);
  closeWindow();
}

async function restoreSession(sessionId) {
  const session = savedSessions[sessionId];
  if (!session || session.tabs.length === 0) return;

  // Signal other instances to skip onCreated
  await chrome.storage.session.set({ restoreInProgress: Date.now() });

  const BATCH_SIZE = 5;
  const BATCH_DELAY = 150;
  const createdTabIds = [];
  const newCustomNames = {};

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
        createdTabIds.push(result.value.id);
        if (batch[idx].customName) {
          newCustomNames[result.value.id] = batch[idx].customName;
        }
      }
    });

    if (i + BATCH_SIZE < session.tabs.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  if (createdTabIds.length === 0) {
    await chrome.storage.session.remove('restoreInProgress');
    return;
  }

  // Create group with restored tabs
  const group = {
    group: 'g' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: session.name,
    color: session.color,
    autoSave: session.autoSave || false,
    tabs: createdTabIds,
    linkedSessionId: sessionId
  };

  items.push(group);

  // Save custom names
  if (Object.keys(newCustomNames).length > 0) {
    Object.assign(customNames, newCustomNames);
    await chrome.storage.local.set({ customNames });
  }

  await chrome.storage.local.set({ items });
  await chrome.storage.session.remove('restoreInProgress');

  // Activate first restored tab
  if (createdTabIds.length > 0) {
    try {
      const tab = await chrome.tabs.get(createdTabIds[0]);
      await chrome.tabs.update(createdTabIds[0], { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (e) {
      // Tab may not be ready yet
    }
  }
}

async function closeWindow() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.windows.remove(currentWindow.id);
  } catch (e) {
    // Window may already be closing
  }
}

function formatUrl(url) {
  try {
    const u = new URL(url);
    let result = u.hostname + u.pathname;
    if (result.length > 60) {
      result = result.substring(0, 57) + '...';
    }
    return result;
  } catch {
    return url || '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return (text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
