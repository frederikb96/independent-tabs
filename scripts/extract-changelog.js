#!/usr/bin/env bun
// Prints one version's CHANGELOG.md section, the body of its GitHub Release:
//   bun scripts/extract-changelog.js 1.11.0
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { changelogSection } from './release-lib.js';

const version = (process.argv[2] ?? '').replace(/^v/, '');
const body = changelogSection(readFileSync(join(resolve(import.meta.dir, '..'), 'CHANGELOG.md'), 'utf8'), version);

if (!body) {
  console.error(`CHANGELOG.md has no section for "${version}"`);
  process.exit(1);
}
console.log(body);
