#!/usr/bin/env bun
// Builds the release zip from the files listed in extension-files.js, manifest.json at its root:
//   bun scripts/package.js independent-tabs-v1.11.0.zip
import { resolve } from 'node:path';
import { releaseFiles } from './extension-files.js';

const out = resolve(process.argv[2] ?? 'independent-tabs.zip');
const root = resolve(import.meta.dir, '..');
const result = Bun.spawnSync(['zip', '-r', '-q', out, ...releaseFiles], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
process.exit(result.exitCode);
