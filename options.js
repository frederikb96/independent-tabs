// Independent Tabs - Options Page

document.addEventListener('DOMContentLoaded', async () => {
  const positionSelect = document.getElementById('position');
  const savedIndicator = document.getElementById('saved');

  // Load current settings
  const { settings = { newTabPosition: 'bottom' } } = await chrome.storage.local.get('settings');
  positionSelect.value = settings.newTabPosition;

  // Save on change
  positionSelect.addEventListener('change', async (e) => {
    const newSettings = { newTabPosition: e.target.value };
    await chrome.storage.local.set({ settings: newSettings });

    // Show saved indicator
    savedIndicator.classList.add('show');
    setTimeout(() => {
      savedIndicator.classList.remove('show');
    }, 1500);
  });
});
