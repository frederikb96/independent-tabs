// End-to-end run of the unpacked extension in Playwright's bundled Chromium, headless.
// Branded Chrome and Edge ignore --load-extension, so this is the browser to test with.
// Run: bunx playwright-core install chromium && bun run test:e2e
import { afterAll, beforeAll, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

setDefaultTimeout(30000);

const root = resolve(import.meta.dir, '..', '..');
// The extension is the top-level files plus icons/; everything else is tooling
const isExtensionFile = (name) => name === 'icons'
  || (!name.startsWith('.') && !['package.json', 'bun.lock'].includes(name) && statSync(join(root, name)).isFile());

let tmp;
let context;
let extensionId;

const page = (n) => `data:text/html,<title>Page ${n}</title>`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function worker() {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

// An extension page used to drive chrome.* while no list view is open
async function driver() {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extensionId}/options.html`);
  return p;
}

async function storedOrder(p) {
  return p.evaluate(async () => {
    const { items = [] } = await chrome.storage.local.get('items');
    const tabs = await chrome.tabs.query({});
    const title = id => tabs.find(t => t.id === id)?.title ?? `closed ${id}`;
    return items.map(i => typeof i === 'number' ? title(i) : { [i.name]: i.tabs.map(title) });
  });
}

async function openList() {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await p.waitForSelector('.tab-item');
  return p;
}

// Stops the service worker the way the browser does after it was idle
async function stopWorker(p) {
  const cdp = await context.newCDPSession(p);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await cdp.detach();
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'independent-tabs-e2e-'));
  const ext = join(tmp, 'extension');
  mkdirSync(ext);
  for (const name of readdirSync(root).filter(isExtensionFile)) cpSync(join(root, name), join(ext, name), { recursive: true });
  context = await chromium.launchPersistentContext(join(tmp, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  extensionId = new URL((await worker()).url()).host;
});

afterAll(async () => {
  await context?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

beforeEach(async () => {
  // One blank tab, an empty order
  const pages = context.pages();
  const keep = pages[0] ?? await context.newPage();
  await keep.goto('about:blank');
  for (const p of pages.slice(1)) await p.close();
  await (await worker()).evaluate(() => chrome.storage.local.set({ items: [] }));
});

test('tabs opened while no list is open keep their opening order after the worker was stopped', async () => {
  const d = await driver();
  // A list that was open once holds the tabs of that moment
  await (await openList()).close();
  await stopWorker(d);

  await d.evaluate(async (urls) => {
    const ids = [];
    for (const url of urls) {
      ids.push((await chrome.tabs.create({ url, active: true })).id);
      await new Promise(r => setTimeout(r, 100));
    }
    // Most recently used first, as an MRU extension rearranges the tab strip
    for (const [index, id] of [...ids].reverse().entries()) await chrome.tabs.move(id, { index });
  }, [1, 2, 3, 4].map(page));
  await sleep(300);

  const list = await openList();
  const order = await storedOrder(list);
  expect(order.filter(t => typeof t === 'string' && t.startsWith('Page'))).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4']);
  const shown = await list.$$eval('.tab-item .title', els => els.map(e => e.textContent));
  expect(shown.filter(t => t.startsWith('Page'))).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4']);
});

test('a closed tab leaves the order while no list is open, a tab opened from a grouped tab joins the group', async () => {
  const d = await driver();
  const opener = await context.newPage();
  await opener.setContent('<title>Page A</title><a href="about:blank#child" target="_blank">child</a>');
  const [a, b] = await d.evaluate(async (url) => {
    const [a] = await chrome.tabs.query({ title: 'Page A' });
    const b = await chrome.tabs.create({ url, active: false });
    return [a.id, b.id];
  }, page('B'));
  await sleep(300);
  await d.evaluate(async (a) => {
    const { items } = await chrome.storage.local.get('items');
    await chrome.storage.local.set({
      items: [...items.filter(i => i !== a), { group: 'g1', name: 'G', color: '#2196f3', tabs: [a] }],
    });
  }, a);

  await opener.click('a');
  await d.evaluate((b) => chrome.tabs.remove(b), b);
  await sleep(500);

  const order = await storedOrder(d);
  expect(order).not.toContain('Page B');
  expect(order).toContainEqual({ G: ['Page A', 'about:blank#child'] });
});

test('in the side panel, arrows move the cursor without activating, Enter activates', async () => {
  const d = await driver();
  await d.evaluate(async (urls) => {
    for (const url of urls) await chrome.tabs.create({ url, active: false });
  }, [1, 2, 3].map(page));
  await sleep(300);

  const list = await openList();
  const titles = await list.$$eval('.tab-item .title', els => els.map(e => e.textContent));
  const active = () => list.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].title);
  const cursor = () => list.$eval('.tab-item.keyboard-focused .title', e => e.textContent);
  const start = await active();
  expect(await cursor()).toBe(start);

  await list.keyboard.press('Home');
  expect(await cursor()).toBe(titles[0]);
  await list.keyboard.press('ArrowDown');
  await list.keyboard.press('ArrowDown');
  expect(await cursor()).toBe(titles[2]);
  await list.keyboard.press('End');
  await list.keyboard.press('ArrowUp');
  expect(await cursor()).toBe(titles.at(-2));
  expect(await active()).toBe(start);

  await list.keyboard.press('Enter');
  await sleep(200);
  expect(await active()).toBe(titles.at(-2));
});

test('typing a search, arrows walk the matches only and Enter opens one', async () => {
  const d = await driver();
  await d.evaluate(async (urls) => {
    for (const url of urls) await chrome.tabs.create({ url, active: false });
  }, ['data:text/html,<title>alpha one</title>', 'data:text/html,<title>beta</title>', 'data:text/html,<title>alpha two</title>']);
  await sleep(300);

  const list = await openList();
  await list.keyboard.press('/');
  await list.keyboard.type('alpha');
  const cursor = () => list.$eval('.tab-item.keyboard-focused .title', e => e.textContent);
  expect(await cursor()).toBe('alpha one');
  await list.keyboard.press('ArrowDown');
  expect(await cursor()).toBe('alpha two');
  await list.keyboard.press('ArrowDown');
  expect(await cursor()).toBe('alpha two');

  await list.keyboard.press('Enter');
  await sleep(200);
  const [tab] = await list.evaluate(() => chrome.tabs.query({ title: 'alpha two' }));
  expect(tab.active).toBe(true);
  expect(await list.inputValue('#search-input')).toBe('');
});
