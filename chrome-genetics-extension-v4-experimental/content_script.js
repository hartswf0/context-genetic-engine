/**
 * DOM GENETICS ENGINE — CONTENT SCRIPT
 *
 * Content scripts run in the page context and have a restricted chrome API
 * surface. Notably: chrome.tabs is NOT available here.
 *
 * This file is intentionally minimal. Heavy extraction logic runs via
 * chrome.scripting.executeScript() in background.js — injected on demand.
 *
 * This content script only handles PING messages so the panel can confirm
 * the script is alive on a given tab.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ ok: true, url: window.location.href, title: document.title });
  }
  return false; // synchronous response only
});
