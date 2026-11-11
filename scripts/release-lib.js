// Reading CHANGELOG.md and checking that the places a release depends on agree.

const HEADING = /^## \[(?<version>[^\]]+)\](?: - (?<date>\S+))?\s*$/;

// The version headings of the changelog in file order, [Unreleased] included.
export function changelogHeadings(text) {
  return text.split('\n').flatMap((line, index) => {
    const match = HEADING.exec(line);
    return match ? [{ line: index, version: match.groups.version, date: match.groups.date ?? null }] : [];
  });
}

// The body of one version's section, without its heading; null when there is none.
export function changelogSection(text, version) {
  const headings = changelogHeadings(text);
  const at = headings.findIndex(h => h.version === version);
  if (at === -1) return null;
  const lines = text.split('\n');
  const end = headings[at + 1]?.line ?? lines.length;
  return lines.slice(headings[at].line + 1, end).join('\n').trim();
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const TAG = /^v\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Everything that disagrees, as sentences; empty when the release is consistent.
//   manifest   parsed manifest.json
//   changelog  text of CHANGELOG.md
//   tag        the release tag (optional; a pull request has none)
//   present    names that exist in the repository root
//   required   names the extension needs (extensionFiles)
//   extension  names in the root that are html, js or css files
export function checkRelease({ manifest, changelog, tag, present, required, extension }) {
  const problems = [];

  for (const key of ['manifest_version', 'name', 'version', 'permissions', 'background']) {
    if (!(key in manifest)) problems.push(`manifest.json has no "${key}"`);
  }
  if (manifest.manifest_version !== 3) problems.push(`manifest_version is ${manifest.manifest_version}, expected 3`);

  const version = manifest.version;
  if (!SEMVER.test(version ?? '')) problems.push(`manifest version "${version}" is not X.Y.Z`);

  const released = changelogHeadings(changelog).filter(h => h.version !== 'Unreleased');
  const newest = released[0];
  if (!newest) {
    problems.push('CHANGELOG.md has no released version section');
  } else {
    if (newest.version !== version) {
      problems.push(`manifest version ${version} is not the newest CHANGELOG section (${newest.version})`);
    }
    for (const h of released) {
      if (!ISO_DATE.test(h.date ?? '')) problems.push(`CHANGELOG.md section ${h.version} has no YYYY-MM-DD date`);
    }
  }

  if (tag !== undefined) {
    if (!TAG.test(tag)) problems.push(`tag "${tag}" is not vX.Y.Z`);
    else if (tag.slice(1) !== version) problems.push(`tag ${tag} does not match manifest version ${version}`);
    if (!changelogSection(changelog, tag.replace(/^v/, ''))) problems.push(`CHANGELOG.md has no section for ${tag}`);
  }

  for (const name of required) {
    if (!present.includes(name)) problems.push(`missing extension file ${name}`);
  }
  for (const name of extension) {
    if (!required.includes(name)) problems.push(`${name} is not in scripts/extension-files.js, so the release zip would leave it out`);
  }

  return problems;
}
