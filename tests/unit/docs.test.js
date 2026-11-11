import { expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const docs = readdirSync(join(root, 'docs')).filter(name => name.endsWith('.md'));

test('every docs file is linked from the README', () => {
  const readme = read('README.md');
  for (const name of docs) expect(readme).toContain(`](docs/${name})`);
});

test('every image and relative link in the README and docs resolves', () => {
  for (const file of ['README.md', ...docs.map(name => `docs/${name}`)]) {
    const text = read(file);
    const targets = [...text.matchAll(/(?:src="|\]\()(?!https?:|#)([^")#]+)/g)].map(m => m[1]);
    for (const target of targets) {
      expect(existsSync(join(root, dirname(file), target)), `${file} -> ${target}`).toBe(true);
    }
  }
});

test('the shortcuts doc names every shortcut of the manifest', () => {
  const shortcuts = read('docs/shortcuts.md');
  const { commands } = JSON.parse(read('manifest.json'));
  for (const { suggested_key } of Object.values(commands)) expect(shortcuts).toContain(suggested_key.default);
});
