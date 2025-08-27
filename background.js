// Background service worker for AI Chat Organizer
// Sets uninstall URL to show data export instructions when extension is removed
//
// When users uninstall the extension, Chrome will automatically open export.html
// which provides instructions for data export and explains that data must be
// exported before uninstalling (since chrome.storage.local becomes inaccessible
// after extension removal).

chrome.runtime.onInstalled.addListener(() => {
  // Set the uninstall URL to the export page
  const uninstallUrl = chrome.runtime.getURL('export.html');
  chrome.runtime.setUninstallURL(uninstallUrl);
});