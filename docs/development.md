# Development

The extension has no build step: the repository root is the unpacked extension. Bun and Playwright run the tests and the tooling.

```
bun install
bun run test            # unit tests, seconds
bunx playwright-core install chromium
bun run test:e2e        # browser tests in Playwright's bundled Chromium, headless
bun run check           # manifest, changelog and extension files agree
```

Branded Chrome and Edge ignore `--load-extension`, so the browser tests and the screenshots use Playwright's bundled Chromium. `scripts/launch-extension.js` launches it with a copy of the extension.

## Extension files

`scripts/extension-files.js` is the one list of the files that make up the extension. The release zip, the browser tests and `bun run check` read it, and the check fails when a top-level html, js or css file is missing from it.

## Vendored libraries

SortableJS and Fuse.js are dev dependencies; the built files at the repository root are copies of them. `bun run vendor` refreshes the copies, and the pull-request checks fail when the committed ones differ. A Renovate update for either library therefore needs `bun run vendor` and a push to its branch.

## Screenshots

`bun run screenshots` rewrites everything in `docs/images/` except the header and the logo. It starts the extension in Chromium, opens invented pages served from the local machine under example domains, and fills the list from `scripts/screenshots/seed.js`. A change to a pictured screen re-runs it in the same pull request.

## Releases

- Bump `version` in `manifest.json` and move `[Unreleased]` in `CHANGELOG.md` into a dated section for it, in one pull request.
- After the merge, tag the merge commit `vX.Y.Z` and push the tag.
- The release workflow runs `bun run check` against the tag, builds the zip from the extension file list and publishes a GitHub Release whose notes are the changelog section.
