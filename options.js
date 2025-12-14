// Independent Tabs - Options Page

document.addEventListener('DOMContentLoaded', async () => {
  const positionSelect = document.getElementById('position');
  const savedIndicator = document.getElementById('saved');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  const errorDiv = document.getElementById('error');

  // Load current settings
  const { settings = { newTabPosition: 'bottom' } } = await chrome.storage.local.get('settings');
  positionSelect.value = settings.newTabPosition;

  // Save on change
  positionSelect.addEventListener('change', async (e) => {
    const newSettings = { newTabPosition: e.target.value };
    await chrome.storage.local.set({ settings: newSettings });
    showSaved();
  });

  // Export backup
  exportBtn.addEventListener('click', async () => {
    try {
      hideError();
      const data = await chrome.storage.local.get(null);

      const backup = {
        version: 1,
        extensionVersion: chrome.runtime.getManifest().version,
        timestamp: new Date().toISOString(),
        data: data
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const filename = `independent-tabs-backup-${new Date().toISOString().slice(0, 10)}.json`;

      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });

      URL.revokeObjectURL(url);
      showSaved('Backup exported');
    } catch (err) {
      showError('Export failed: ' + err.message);
    }
  });

  // Import backup - trigger file picker
  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  // Handle file selection
  importFile.addEventListener('change', async (e) => {
    console.log('File change event fired', e.target.files);
    const file = e.target.files[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', file.name, file.size);

    try {
      hideError();
      const text = await file.text();
      console.log('File read, length:', text.length);
      const backup = JSON.parse(text);
      console.log('Parsed backup:', backup);

      // Validate backup structure
      if (!backup.version || !backup.data) {
        throw new Error('Invalid backup file format');
      }

      // Validate data types
      if (backup.data.items && !Array.isArray(backup.data.items)) {
        throw new Error('Invalid items format in backup');
      }

      // Confirm before overwriting
      const itemCount = backup.data.items?.length || 0;
      const sessionCount = Object.keys(backup.data.savedSessions || {}).length;
      const customNameCount = Object.keys(backup.data.customNames || {}).length;

      const confirmMsg = `This will replace all your current data with:\n` +
        `- ${itemCount} items (tabs/groups)\n` +
        `- ${sessionCount} saved sessions\n` +
        `- ${customNameCount} custom tab names\n\n` +
        `Continue?`;

      console.log('About to show confirm dialog');
      const confirmed = confirm(confirmMsg);
      console.log('Confirm result:', confirmed);

      if (!confirmed) {
        console.log('User cancelled');
        importFile.value = '';
        return;
      }

      console.log('User confirmed, starting restore...');

      // Restore data
      await chrome.storage.local.clear();
      await chrome.storage.local.set(backup.data);

      // Verify restore worked
      const verified = await chrome.storage.local.get(['savedSessions', 'items', 'customNames']);
      console.log('Restored data:', verified);

      // Reload settings display
      const newSettings = backup.data.settings || { newTabPosition: 'bottom' };
      positionSelect.value = newSettings.newTabPosition || 'bottom';

      // Show success with alert to ensure visibility
      const restoredItems = Array.isArray(verified.items) ? verified.items.length : 0;
      const restoredSessions = Object.keys(verified.savedSessions || {}).length;
      const restoredNames = Object.keys(verified.customNames || {}).length;

      alert(`Backup restored successfully!\n\n` +
        `- ${restoredItems} items\n` +
        `- ${restoredSessions} saved sessions\n` +
        `- ${restoredNames} custom names\n\n` +
        `Close and reopen the side panel to see changes.`);

      showSaved('Backup restored!');
    } catch (err) {
      console.error('Import error:', err);
      showError('Import failed: ' + err.message);
    }

    // Clear file input for next use
    importFile.value = '';
  });

  function showSaved(message = 'Settings saved') {
    savedIndicator.textContent = message;
    savedIndicator.classList.add('show');
    setTimeout(() => {
      savedIndicator.classList.remove('show');
    }, 2500);
  }

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
  }

  function hideError() {
    errorDiv.classList.remove('show');
  }
});
