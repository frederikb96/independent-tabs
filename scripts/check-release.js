#!/usr/bin/env bun
// Checks that the manifest, the changelog, the extension files and (given one) the release tag
// agree. The pull-request checks run it without a tag, the release workflow with one:
//   bun scripts/check-release.js [vX.Y.Z]
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extensionFiles } from './extension-files.js';
import { checkRelease } from './release-lib.js';

const root = resolve(import.meta.dir, '..');
const present = readdirSync(root);
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const problems = checkRelease({
  manifest,
  changelog: readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
  tag: process.argv[2],
  present,
  required: extensionFiles,
  extension: present.filter(name => /\.(html|js|css)$/.test(name)),
});

if (problems.length > 0) {
  console.error('Release check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Release check passed: ${manifest.name} ${manifest.version}`);
