importScripts('shared.js');

async function updateBadge() {
  const { enabled } = await HP.loadSettings();
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#71717a' });
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'enabled' in changes) updateBadge();
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'reveal-post') {
    // Unsupported pages have no content script to receive this; that's fine.
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'reveal-post' }).catch(() => {});
    return;
  }
  if (command !== 'toggle') return;
  const { enabled } = await HP.loadSettings();
  await chrome.storage.local.set({ enabled: !enabled });
});
