// The files that make up the extension. They are what the release zip holds (plus LICENSE), what
// the browser tests and the screenshots load, and what the release check requires; everything
// else in the repository is tooling, tests or docs.
export const extensionFiles = [
  'manifest.json',
  'service-worker.js',
  'tab-items.js',
  'sidepanel.html', 'sidepanel.js', 'sidepanel.css',
  'quicksearch.html', 'quicksearch.js', 'quicksearch.css',
  'options.html', 'options.js',
  'sortable.min.js', 'fuse.min.js',
  'icons',
];

export const releaseFiles = [...extensionFiles, 'LICENSE'];
