#!/usr/bin/env bun
// Copies the built files of the vendored libraries from node_modules into the extension folder.
// Their versions are the dev dependencies in package.json; the pull-request checks run this and
// fail when the committed copies differ.
import { copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const libraries = [
  ['node_modules/fuse.js/dist/fuse.min.js', 'fuse.min.js'],
  ['node_modules/sortablejs/Sortable.min.js', 'sortable.min.js'],
];

for (const [from, to] of libraries) {
  copyFileSync(join(root, from), join(root, to));
  console.log(`${from} -> ${to}`);
}
