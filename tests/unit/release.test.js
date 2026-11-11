import { expect, test } from 'bun:test';
import { changelogHeadings, changelogSection, checkRelease } from '../../scripts/release-lib.js';

const changelog = `# Changelog

## [Unreleased]

### Added

- Something new

## [1.1.0] - 2026-02-08

### Fixed

- A bug

## [1.0.0] - 2025-12-14

### Added

- Initial release
`;

const consistent = {
  manifest: { manifest_version: 3, name: 'x', version: '1.1.0', permissions: [], background: {} },
  changelog,
  present: ['manifest.json', 'a.js', 'README.md'],
  required: ['manifest.json', 'a.js'],
  extension: ['a.js'],
};

test('headings carry version and date, [Unreleased] has none', () => {
  expect(changelogHeadings(changelog).map(h => [h.version, h.date])).toEqual([
    ['Unreleased', null], ['1.1.0', '2026-02-08'], ['1.0.0', '2025-12-14'],
  ]);
});

test('a section ends at the next heading and a missing one is null', () => {
  expect(changelogSection(changelog, '1.1.0')).toBe('### Fixed\n\n- A bug');
  expect(changelogSection(changelog, '1.0.0')).toBe('### Added\n\n- Initial release');
  expect(changelogSection(changelog, '2.0.0')).toBeNull();
});

test('a consistent release has no problems, with and without its tag', () => {
  expect(checkRelease(consistent)).toEqual([]);
  expect(checkRelease({ ...consistent, tag: 'v1.1.0' })).toEqual([]);
});

test('a tag that differs from the manifest version is reported', () => {
  const problems = checkRelease({ ...consistent, tag: 'v1.2.0' });
  expect(problems.join('\n')).toContain('tag v1.2.0 does not match manifest version 1.1.0');
});

test('a tag that is not vX.Y.Z is reported', () => {
  expect(checkRelease({ ...consistent, tag: 'v1.1.0-rc1' }).join('\n')).toContain('is not vX.Y.Z');
});

test('a manifest version ahead of the changelog is reported', () => {
  const manifest = { ...consistent.manifest, version: '1.2.0' };
  expect(checkRelease({ ...consistent, manifest }).join('\n')).toContain('is not the newest CHANGELOG section (1.1.0)');
});

test('an undated changelog section is reported', () => {
  const undated = changelog.replace('## [1.0.0] - 2025-12-14', '## [1.0.0]');
  expect(checkRelease({ ...consistent, changelog: undated }).join('\n')).toContain('section 1.0.0 has no YYYY-MM-DD date');
});

test('a missing extension file and an unlisted one are reported', () => {
  const problems = checkRelease({ ...consistent, present: ['manifest.json'], extension: ['a.js', 'b.js'] });
  expect(problems).toContain('missing extension file a.js');
  expect(problems.join('\n')).toContain('b.js is not in scripts/extension-files.js');
});
