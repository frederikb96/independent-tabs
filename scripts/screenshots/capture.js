#!/usr/bin/env bun
// Captures the pictures in docs/images/ from the invented session in seed.js, in Playwright's
// bundled Chromium with the extension loaded:
//   bunx playwright-core install chromium && bun run screenshots
// The side panel and the quick search are shot as the popup windows the shortcuts open: they
// hold the same pages and, being popups, stay out of the list the panel shows.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchExtension } from '../launch-extension.js';
import { activeKey, customNames, layout, pages, sessions, settings, siteResponse } from './seed.js';

const images = resolve(import.meta.dir, '..', '..', 'docs', 'images');
const PANEL = { width: 340, height: 600 };
const QUICK = { width: 450, height: 600 };
const OPTIONS = { width: 720, height: 600 };

const hosts = [...new Set(Object.values(pages).map(([host]) => host))];
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const { pathname } = new URL(request.url);
    const site = siteResponse(request.headers.get('host').split(':')[0], pathname);
    return site ? new Response(site.body, { headers: { 'content-type': site.type } }) : new Response('not found', { status: 404 });
  },
});

const browser = await launchExtension({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  args: [`--host-resolver-rules=${hosts.map(host => `MAP ${host} 127.0.0.1:${server.port}`).join(',')}`],
});
const { context, extensionId } = browser;

try {
  // A popup page drives chrome.*; being a popup, it is not a tab of the list
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const driverOpened = context.waitForEvent('page');
  await worker.evaluate(() => chrome.windows.create({ url: 'options.html', type: 'popup' }));
  const driver = await driverOpened;
  await driver.waitForLoadState();

  const blank = context.pages().find(p => p.url() === 'about:blank');
  const open = {};
  for (const [key, [host, path]] of Object.entries(pages)) {
    open[key] = await context.newPage();
    await open[key].goto(`http://${host}${path}`);
  }
  await blank?.close();
  await open[activeKey].bringToFront();

  const tabs = await driver.evaluate(async () => (await chrome.tabs.query({ windowType: 'normal' })).map(t => ({ id: t.id, url: t.url, icon: t.favIconUrl })));
  const idOf = Object.fromEntries(Object.entries(pages).map(([key, [host, path]]) => [key, tabs.find(t => t.url === `http://${host}${path}`).id]));
  const missingIcons = tabs.filter(t => !t.icon).length;
  if (missingIcons > 0) console.warn(`${missingIcons} tab(s) have no favicon`);

  const items = layout.map((entry, index) => typeof entry === 'string' ? idOf[entry] : {
    group: `g${index}`,
    name: entry.name,
    color: entry.color,
    tabs: entry.tabs.map(key => idOf[key]),
    ...(entry.session && { linkedSessionId: entry.session, autoSave: sessions()[entry.session].autoSave }),
  });
  await driver.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(data);
    const [tab] = await chrome.tabs.query({ active: true, windowType: 'normal' });
    return tab;
  }, {
    items,
    customNames: Object.fromEntries(Object.entries(customNames).map(([key, name]) => [idOf[key], name])),
    savedSessions: sessions(),
    settings,
  });

  const popup = async (url, size) => {
    const opened = context.waitForEvent('page');
    await driver.evaluate(({ url, size }) => chrome.windows.create({ url, type: 'popup', ...size }), { url, size });
    const page = await opened;
    await page.setViewportSize(size);
    await page.waitForLoadState();
    await page.addStyleTag({ content: 'html { box-shadow: inset 0 0 0 1px #d4d4d4; }' });
    return page;
  };
  const shoot = (page, name) => page.screenshot({ path: join(images, name) });

  const panel = await popup('sidepanel.html', PANEL);
  await panel.waitForSelector('.tab-item');
  await shoot(panel, 'sidepanel.png');

  await panel.click('.view-btn[data-view="sessions"]');
  await panel.waitForSelector('.session-item');
  await shoot(panel, 'sessions.png');

  const quick = await popup('quicksearch.html', QUICK);
  await quick.waitForSelector('.result-item');
  await quick.keyboard.type('re');
  await quick.waitForFunction(() => document.querySelector('.result-badge')?.textContent === 'session');
  await shoot(quick, 'quicksearch.png');

  const settingsPage = await context.newPage();
  await settingsPage.setViewportSize(OPTIONS);
  await settingsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await settingsPage.addStyleTag({ content: 'html { box-shadow: inset 0 0 0 1px #d4d4d4; }' });
  await settingsPage.setViewportSize({ width: OPTIONS.width, height: await settingsPage.evaluate(() => document.documentElement.scrollHeight) });
  await shoot(settingsPage, 'options.png');

  // The three views side by side, for the README's first screen
  const data = (name) => `data:image/png;base64,${readFileSync(join(images, name)).toString('base64')}`;
  const hero = await context.newPage();
  await hero.setViewportSize({ width: 1280, height: 740 });
  await hero.setContent(`<!doctype html><style>
    body { margin: 0; height: 740px; background: #e9edf2; font-family: system-ui, sans-serif; color: #455a64;
           display: flex; justify-content: center; align-items: flex-start; gap: 48px; padding-top: 48px; box-sizing: border-box; }
    figure { margin: 0; text-align: center; font-size: 15px; }
    img { display: block; border-radius: 10px; box-shadow: 0 8px 28px rgba(38, 50, 56, .25); margin-bottom: 18px; }
  </style>
  <figure><img src="${data('sidepanel.png')}" width="${PANEL.width}">Side panel &middot; Alt+A</figure>
  <figure><img src="${data('sessions.png')}" width="${PANEL.width}">Saved sessions &middot; S</figure>
  <figure><img src="${data('quicksearch.png')}" width="${QUICK.width}">Quick search &middot; Alt+S</figure>`);
  await hero.screenshot({ path: join(images, 'hero.png') });
} finally {
  await browser.close();
  server.stop(true);
}
