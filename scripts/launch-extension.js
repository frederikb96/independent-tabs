// Launches Playwright's bundled Chromium with a copy of the extension loaded, for the browser
// tests and the screenshots. Branded Chrome and Edge ignore --load-extension, so this is the
// browser for automation. The copy holds only the files of extension-files.js.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { extensionFiles } from './extension-files.js';

const root = resolve(import.meta.dir, '..');

export async function launchExtension({ headless = true, args = [], ...options } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'independent-tabs-'));
  const extension = join(tmp, 'extension');
  mkdirSync(extension);
  for (const name of extensionFiles) cpSync(join(root, name), join(extension, name), { recursive: true });

  const context = await chromium.launchPersistentContext(join(tmp, 'profile'), {
    channel: 'chromium',
    headless,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, ...args],
    ...options,
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return {
    context,
    extensionId: new URL(worker.url()).host,
    async close() {
      await context.close();
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}
