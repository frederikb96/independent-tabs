// Independent Tabs - pure operations on the custom order
//
// `items` is the stored order: tab IDs (ungrouped) and group objects
// ({ group, name, color, tabs: [tabId, ...], ... }). Every function returns a new array and
// leaves its input untouched. Loaded as a classic script by the pages and by importScripts()
// in the service worker; exported for the unit tests.

function allTabIds(items) {
  const ids = [];
  for (const item of items) {
    if (typeof item === 'number') ids.push(item);
    else if (item.group) ids.push(...item.tabs);
  }
  return ids;
}

function groupOfTab(items, tabId) {
  return items.find(item => item.group && item.tabs.includes(tabId)) || null;
}

// Adds a new tab at the top or bottom of the list. A tab opened from a grouped tab joins
// that group, at the same end.
function insertTab(items, tabId, { position = 'bottom', openerTabId } = {}) {
  if (allTabIds(items).includes(tabId)) return items;

  const opener = openerTabId === undefined ? null : groupOfTab(items, openerTabId);
  if (opener) {
    return items.map(item => item === opener
      ? { ...item, tabs: position === 'top' ? [tabId, ...item.tabs] : [...item.tabs, tabId] }
      : item);
  }
  return position === 'top' ? [tabId, ...items] : [...items, tabId];
}

// Drops the given tabs; a group left without tabs is dropped with them.
function removeTabs(items, tabIds) {
  const gone = new Set(tabIds);
  const result = [];
  for (const item of items) {
    if (typeof item === 'number') {
      if (!gone.has(item)) result.push(item);
    } else if (item.group) {
      const tabs = item.tabs.filter(id => !gone.has(id));
      if (tabs.length > 0) result.push(tabs.length === item.tabs.length ? item : { ...item, tabs });
    }
  }
  return result;
}

// Brings the stored order in line with the tabs that exist: closed tabs leave, tabs the order
// does not know yet join in the order they were opened. Tab IDs grow with every new tab
// within a browser session, so sorting by ID recovers the opening order; the position of a
// tab in the browser's own tab strip says nothing about it once another extension reorders
// the strip.
function reconcile(items, tabs, position = 'bottom') {
  const open = new Set(tabs.map(t => t.id));
  let result = removeTabs(items, allTabIds(items).filter(id => !open.has(id)));
  const known = new Set(allTabIds(result));
  const missing = tabs.map(t => t.id).filter(id => !known.has(id)).sort((a, b) => a - b);
  for (const id of missing) result = insertTab(result, id, { position });
  return result;
}

function sameItems(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

if (typeof module !== 'undefined') {
  module.exports = { allTabIds, groupOfTab, insertTab, removeTabs, reconcile, sameItems };
}
