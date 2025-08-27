// Background service worker for AI Chat Organizer
// Handles extension initialization
//
// Note: Previously attempted to set an uninstall URL to export.html, but Chrome
// doesn't allow chrome-extension:// URLs for security reasons. Users should
// export their data manually before uninstalling via the extension panel.

chrome.runtime.onInstalled.addListener(() => {
  // Extension initialization completed
  // Note: Uninstall URL cannot use chrome-extension:// protocol for security reasons
});