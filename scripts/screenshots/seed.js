// The invented browsing session the screenshots show: pages on example domains, how the list
// orders and groups them, and the saved sessions. Kept apart from the browser tests, which use
// data chosen to cover cases rather than to look right.
const DAY = 24 * 60 * 60 * 1000;

const palette = { blue: '#1976d2', teal: '#009688', orange: '#fb8c00', purple: '#7e57c2', pink: '#e91e63', green: '#43a047', grey: '#607d8b' };

// key: [host, path, title, favicon color]
export const pages = {
  mail: ['mail.example.com', '/inbox', 'Inbox (3) - Example Mail', palette.blue],
  calendar: ['calendar.example.com', '/week', 'Week 46 - Calendar', palette.pink],
  guide: ['travel.example.org', '/lisbon', 'Lisbon in four days - Travel guide', palette.teal],
  flights: ['flights.example.net', '/fra-lis', 'Frankfurt to Lisbon - Compare fares', palette.orange],
  stays: ['stays.example.com', '/alfama', 'Apartments in Alfama - Stays', palette.pink],
  revenue: ['sheets.example.com', '/q3-revenue', 'Q3 revenue by region - Sheets', palette.green],
  outline: ['docs.example.com', '/q3-outline', 'Report outline - Docs', palette.blue],
  charts: ['design.example.org', '/charts', 'Style guide for charts', palette.purple],
  checklist: ['git.example.org', '/app/issues/214', 'Release checklist - Issue 214', palette.grey],
  notes: ['docs.example.com', '/standup', 'Untitled document - Docs', palette.blue],
  changelog: ['git.example.org', '/app/pull/219', 'Update changelog for 2.4 - Pull request 219', palette.grey],
  trails: ['maps.example.net', '/trails-aachen', 'Hiking trails near Aachen - Maps', palette.green],
};

// The stored order: ungrouped tabs and groups, in the order the list shows them
export const layout = [
  'mail',
  'calendar',
  { name: 'Lisbon trip', color: '#009688', tabs: ['guide', 'flights', 'stays'], session: 'lisbon' },
  { name: 'Quarterly report', color: '#fb8c00', tabs: ['revenue', 'outline', 'charts'], session: 'report' },
  { name: 'Release 2.4', color: '#3f51b5', tabs: ['checklist', 'changelog'] },
  'notes',
  'trails',
];

export const customNames = { notes: 'Standup notes' };

// The tab the list shows in bold
export const activeKey = 'outline';

export function sessions(now = Date.now()) {
  const tab = (key) => {
    const [host, path, title] = pages[key];
    return { url: `http://${host}${path}`, title, customName: customNames[key] ?? null };
  };
  const session = (id, name, color, keys, createdDaysAgo, updatedDaysAgo, autoSave = false) => ({
    id, name, color, autoSave,
    createdAt: now - createdDaysAgo * DAY,
    updatedAt: now - updatedDaysAgo * DAY,
    tabs: keys.map(tab),
  });
  return {
    lisbon: session('lisbon', 'Lisbon trip', '#009688', ['guide', 'flights', 'stays'], 12, 0, true),
    report: session('report', 'Quarterly report', '#fb8c00', ['revenue', 'outline', 'charts'], 30, 2, true),
    thesis: session('thesis', 'Thesis reading', '#7e57c2', ['guide', 'charts', 'outline', 'notes', 'trails', 'mail', 'calendar', 'stays', 'flights'], 90, 6),
    garden: session('garden', 'Garden project', '#43a047', ['trails', 'stays', 'guide', 'charts', 'notes'], 70, 21),
    bike: session('bike', 'Bike tour planning', '#009688', ['trails', 'stays', 'guide'], 45, 25),
    talks: session('talks', 'Conference talks', '#e91e63', ['guide', 'charts', 'outline', 'notes', 'checklist', 'changelog'], 120, 34),
    recipes: session('recipes', 'Recipes to try', '#fb8c00', ['guide', 'stays', 'trails'], 150, 58),
    moving: session('moving', 'Moving checklist', '#3f51b5', ['checklist', 'mail', 'calendar', 'notes'], 200, 90),
  };
}

export const settings = { newTabPosition: 'bottom', defaultAutoSave: false, autoSaveOnGroupCreation: false, popupCloseOnRefocus: false };

// A page of one example host, with a colored square as its favicon
export function siteResponse(host, path) {
  const entry = Object.values(pages).find(([h, p]) => h === host && p === path);
  if (path === '/favicon.svg') {
    const color = Object.values(pages).find(([h]) => h === host)?.[3] ?? palette.grey;
    return { type: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${color}"/><rect x="4" y="4" width="8" height="2" rx="1" fill="#fff"/><rect x="4" y="8" width="5" height="2" rx="1" fill="#fff"/></svg>` };
  }
  if (!entry) return null;
  return { type: 'text/html', body: `<!doctype html><title>${entry[2]}</title><link rel="icon" href="/favicon.svg"><body style="font-family:sans-serif;padding:2em"><h1>${entry[2]}</h1>` };
}
