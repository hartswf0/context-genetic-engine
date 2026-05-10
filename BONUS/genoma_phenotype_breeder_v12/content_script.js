'use strict';
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') sendResponse({ ok: true, url: location.href, title: document.title });
  return false;
});
